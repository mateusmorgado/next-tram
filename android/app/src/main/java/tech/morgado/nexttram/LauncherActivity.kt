package tech.morgado.nexttram

import android.net.Uri
import android.os.Bundle
import android.util.Log
import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata
import com.google.androidbrowserhelper.trusted.TwaProviderPicker
import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity
import tech.morgado.nexttram.assistant.AssistantRouter
import tech.morgado.nexttram.location.LocationHelper
import tech.morgado.nexttram.notifications.AlertWorker
import tech.morgado.nexttram.notifications.NotificationChannels
import tech.morgado.nexttram.shared.Defaults
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.updater.AppUpdater
import tech.morgado.nexttram.widget.NextTramWidgetProvider
import java.util.concurrent.Executors

/**
 * Defensive TWA launcher with:
 *  - Google Assistant / Gemini App Actions & App Shortcut routing (?route=<id>&back=1)
 *  - Location-aware nearest-stop routing when enabled
 *  - Background AlertWorker, dynamic shortcuts, widget refresh, and throttled update checks
 *  - Null-provider guard + WebViewFallbackActivity safety net (prevents API 35/S24 crashes)
 */
class LauncherActivity : com.google.androidbrowserhelper.trusted.LauncherActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        NotificationChannels.ensureCreated(this)
        super.onCreate(savedInstanceState)
    }

    override fun getLaunchingUrl(): Uri {
        // Respect explicit https://app.nexttram.morgado.tech/... deep links first.
        val incomingData = intent?.data
        if (incomingData != null && incomingData.scheme == "https") {
            return super.getLaunchingUrl()
        }

        val store = RouteStore(this)

        // 1. Shortcuts, Widget taps, Quick Settings tile, Notifications, Assistant App Actions
        AssistantRouter.resolve(intent, store)?.let { target ->
            store.activeRouteId = target.route.id
            return target.toUri()
        }

        // 2. Location-aware stop selection (auto-switches to nearest stop / trip back home)
        if (store.locationAutoSwitch) {
            LocationHelper.pickNearestRoute(this, store.getRoutes())?.let { match ->
                store.activeRouteId = match.route.id
                val b = Uri.parse(Defaults.APP_BASE_URL).buildUpon()
                    .appendQueryParameter("route", match.route.id)
                if (match.reversed) b.appendQueryParameter("back", "1")
                return b.build()
            }
        }

        return super.getLaunchingUrl()
    }

    override fun launchTwa() {
        runHousekeepingAsync()

        val action = TwaProviderPicker.pickProvider(packageManager)
        if (action == null || action.provider == null) {
            Log.w(TAG, "No TWA/browser provider found; opening WebView fallback.")
            openWebViewFallback()
            return
        }
        try {
            super.launchTwa()
        } catch (e: RuntimeException) {
            Log.e(TAG, "TWA launch failed; opening WebView fallback.", e)
            openWebViewFallback()
        }
    }

    private fun openWebViewFallback() {
        val url = launchingUrl
        val metadata = LauncherActivityMetadata.parse(this)
        val fallbackIntent = WebViewFallbackActivity.createLaunchIntent(this, url, metadata)
        startActivity(fallbackIntent)
        finish()
    }

    private fun runHousekeepingAsync() {
        val appCtx = applicationContext
        housekeepingExecutor.execute {
            try {
                AlertWorker.ensureScheduled(appCtx)
                ShortcutsManager.refreshDynamicShortcuts(appCtx)
                NextTramWidgetProvider.refreshWidgetsAsync(appCtx)
                AppUpdater.checkAndNotifyIfNeeded(appCtx, force = false)
            } catch (_: Exception) {
                // Never interfere with app launch.
            }
        }
    }

    companion object {
        private const val TAG = "NextTramLauncher"
        private val housekeepingExecutor = Executors.newSingleThreadExecutor()
    }
}
