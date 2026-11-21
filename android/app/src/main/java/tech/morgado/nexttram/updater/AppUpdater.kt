package tech.morgado.nexttram.updater

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import tech.morgado.nexttram.BuildConfig
import tech.morgado.nexttram.CompanionActivity
import tech.morgado.nexttram.R
import tech.morgado.nexttram.notifications.NotificationChannels
import tech.morgado.nexttram.shared.ReleaseInfo
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Checks the GitHub android-latest release, downloads NextTram.apk, and invokes Android's installer. */
object AppUpdater {
    private const val UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L // 6 hours
    private const val NOTIF_ID_UPDATE = 4100

    fun isUpdateAvailable(release: ReleaseInfo): Boolean {
        val currentSha = BuildConfig.GIT_SHA
        if (currentSha.isBlank() || currentSha == "dev") return false
        val remoteSha = release.targetCommitish.trim()
        if (remoteSha.isNotBlank() && !remoteSha.startsWith(currentSha, ignoreCase = true) && !currentSha.startsWith(remoteSha, ignoreCase = true)) {
            return true
        }
        // Fallback: check release notes "Built from <sha>"
        val match = Regex("Built from ([0-9a-f]{7,40})", RegexOption.IGNORE_CASE).find(release.body)
        val noteSha = match?.groupValues?.getOrNull(1)
        if (!noteSha.isNullOrBlank() && !noteSha.startsWith(currentSha, ignoreCase = true) && !currentSha.startsWith(noteSha, ignoreCase = true)) {
            return true
        }
        return false
    }

    fun checkAndNotifyIfNeeded(context: Context, force: Boolean = false): ReleaseInfo? {
        val store = RouteStore(context)
        if (!force && !store.autoUpdateEnabled) return null
        val now = System.currentTimeMillis()
        if (!force && (now - store.lastUpdateCheckMs) < UPDATE_CHECK_INTERVAL_MS) return null
        store.lastUpdateCheckMs = now

        val release = TransitApi.fetchLatestRelease() ?: return null
        if (!isUpdateAvailable(release) || release.apkUrl.isNullOrBlank()) return null

        val releaseKey = release.publishedAt.ifBlank { release.targetCommitish }
        if (force || releaseKey != store.lastNotifiedReleaseKey) {
            store.lastNotifiedReleaseKey = releaseKey
            postUpdateNotification(context, release)
        }
        return release
    }

    private fun postUpdateNotification(context: Context, release: ReleaseInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }
        NotificationChannels.ensureCreated(context)
        val intent = Intent(context, CompanionActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(CompanionActivity.EXTRA_TRIGGER_UPDATE, true)
        }
        val pi = PendingIntent.getActivity(
            context,
            NOTIF_ID_UPDATE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notif = NotificationCompat.Builder(context, NotificationChannels.CHANNEL_UPDATES)
            .setSmallIcon(R.drawable.ic_tram_notif)
            .setContentTitle("NextTram update available")
            .setContentText("Tap to download & install the latest Android APK.")
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(NOTIF_ID_UPDATE, notif)
        } catch (_: SecurityException) {
            // Notification permission revoked.
        }
    }

    /** Downloads the APK into cacheDir/updates/NextTram.apk on a background thread. */
    fun downloadApk(context: Context, apkUrl: String, onProgress: (Int) -> Unit = {}): File? {
        val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(updatesDir, "NextTram.apk")
        val conn = (URL(apkUrl).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("User-Agent", "NextTram-Android/${BuildConfig.VERSION_NAME}")
        }
        return try {
            if (conn.responseCode !in 200..299) return null
            val total = conn.contentLengthLong
            var read = 0L
            conn.inputStream.use { input ->
                FileOutputStream(target).use { output ->
                    val buf = ByteArray(16 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        output.write(buf, 0, n)
                        read += n
                        if (total > 0) {
                            onProgress(((read * 100) / total).toInt().coerceIn(0, 100))
                        }
                    }
                }
            }
            target
        } catch (_: Exception) {
            target.delete()
            null
        } finally {
            conn.disconnect()
        }
    }

    /** Launches Android's system package installer for the downloaded APK. */
    fun installApk(context: Context, apkFile: File): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(settingsIntent)
            return false
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
        return true
    }
}
