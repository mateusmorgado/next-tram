package tech.morgado.nexttram.notifications

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import tech.morgado.nexttram.LauncherActivity
import tech.morgado.nexttram.R
import tech.morgado.nexttram.assistant.AssistantRouter
import tech.morgado.nexttram.shared.Catching
import tech.morgado.nexttram.shared.Departure
import tech.morgado.nexttram.shared.Route
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Lock-screen Live Updates countdown tracker until the user's next tram departs.
 * Uses Android 16 (API 36) Notification.ProgressStyle + promoted ongoing treatment when available,
 * and falls back cleanly to a rich ongoing countdown notification on Android 7–15.
 */
class LiveCountdownService : Service() {
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var trackingRoute: Route? = null
    private var reversed: Boolean = false
    private var trackedDeparture: Departure? = null
    private var startedAtMs: Long = 0L
    private var lastFetchMs: Long = 0L
    private var running = false

    private val tickRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            val now = System.currentTimeMillis()
            val dep = trackedDeparture
            if (dep != null && dep.depMs <= now - 15_000L) {
                stopTracking()
                return
            }
            if (dep != null) {
                updateNotification(dep, now)
            }
            if (now - lastFetchMs >= REFRESH_INTERVAL_MS) {
                fetchAndRefresh()
            }
            handler.postDelayed(this, TICK_INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopTracking()
            return START_NOT_STICKY
        }

        NotificationChannels.ensureCreated(this)
        val store = RouteStore(this)
        val routeId = intent?.getStringExtra(EXTRA_ROUTE_ID)
        trackingRoute = if (!routeId.isNullOrBlank()) {
            store.findRouteByQuery(routeId) ?: store.activeRoute()
        } else {
            store.activeRoute()
        }
        reversed = intent?.getBooleanExtra(EXTRA_REVERSED, false) ?: false
        startedAtMs = System.currentTimeMillis()
        lastFetchMs = 0L
        running = true

        val initialNotif = buildStatusNotification("NextTram", "Loading next departure…", "…", 0, Color.parseColor("#65B32E"))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, initialNotif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, initialNotif)
        }

        handler.removeCallbacks(tickRunnable)
        fetchAndRefresh()
        handler.postDelayed(tickRunnable, TICK_INTERVAL_MS)
        return START_NOT_STICKY
    }

    private fun fetchAndRefresh() {
        val route = trackingRoute ?: return
        lastFetchMs = System.currentTimeMillis()
        executor.execute {
            try {
                val plan = TransitApi.fetchPlan(route, reversed)
                val target = plan.hero ?: plan.upcoming.firstOrNull()
                handler.post {
                    if (!running) return@post
                    if (target == null) {
                        val notif = buildStatusNotification(
                            route.displayName(reversed),
                            "No upcoming trams right now",
                            "—",
                            0,
                            Color.parseColor("#5B6170"),
                        )
                        postNotification(notif)
                    } else {
                        if (trackedDeparture == null || trackedDeparture?.tripKey != target.tripKey) {
                            startedAtMs = System.currentTimeMillis()
                        }
                        trackedDeparture = target
                        updateNotification(target, System.currentTimeMillis())
                    }
                }
            } catch (_: Exception) {
                // Keep showing last known countdown until next refresh.
            }
        }
    }

    private fun updateNotification(dep: Departure, nowMs: Long) {
        val mins = Catching.minutesUntilDeparture(dep, nowMs)
        val status = Catching.status(dep, nowMs)
        val statusLabel = Catching.statusLabel(dep, nowMs)
        val depTimeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(dep.depMs))
        val delaySuffix = if (dep.delayMin >= 1) " (+${dep.delayMin}m)" else ""

        val title = "${dep.line} → ${dep.direction} · $statusLabel"
        val text = "Departs $depTimeStr$delaySuffix from ${dep.boardAt} · in ${mins} min"
        val chip = when (status) {
            Catching.Status.RUN -> "RUN ${mins}m"
            Catching.Status.LEAVE_NOW -> "GO ${mins}m"
            Catching.Status.WAIT -> "${mins}m"
        }

        val totalSpan = (dep.depMs - startedAtMs).coerceAtLeast(60_000L)
        val elapsed = (nowMs - startedAtMs).coerceIn(0L, totalSpan)
        val progress = ((elapsed * 100L) / totalSpan).toInt().coerceIn(0, 100)

        val accent = when (status) {
            Catching.Status.RUN -> Color.parseColor("#E30613")
            Catching.Status.LEAVE_NOW -> Color.parseColor("#FFCC00")
            Catching.Status.WAIT -> dep.colorBg
        }
        postNotification(buildStatusNotification(title, text, chip, progress, accent))
    }

    private fun buildStatusNotification(
        title: String,
        text: String,
        shortChip: String,
        progress: Int,
        accentColor: Int,
    ): Notification {
        val openIntent = Intent(this, LauncherActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            trackingRoute?.let { putExtra(AssistantRouter.EXTRA_ROUTE_ID, it.id) }
            putExtra(AssistantRouter.EXTRA_ROUTE_BACK, reversed)
        }
        val openPi = PendingIntent.getActivity(
            this,
            101,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val stopIntent = Intent(this, LiveCountdownService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPi = PendingIntent.getService(
            this,
            102,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Android 16 (API 36+): true Promoted Live Updates using Notification.ProgressStyle
        if (Build.VERSION.SDK_INT >= 36) {
            val style = Notification.ProgressStyle()
                .setStyledByProgress(true)
                .setProgress(progress)
                .setProgressTrackerIcon(Icon.createWithResource(this, R.drawable.ic_tram_notif))
                .addProgressSegment(Notification.ProgressStyle.Segment(75).setColor(accentColor))
                .addProgressSegment(Notification.ProgressStyle.Segment(25).setColor(Color.parseColor("#FFCC00")))

            val stopAction = Notification.Action.Builder(
                Icon.createWithResource(this, R.drawable.ic_tram_notif),
                "Stop",
                stopPi,
            ).build()

            val builder = Notification.Builder(this, NotificationChannels.CHANNEL_LIVE_COUNTDOWN)
                .setSmallIcon(R.drawable.ic_tram_notif)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(openPi)
                .setShortCriticalText(shortChip)
                .setStyle(style)
                .addAction(stopAction)
            builder.extras.putBoolean("android.requestPromotedOngoing", true)
            return builder.build()
        }

        // Android 7–15: rich ongoing lock-screen countdown notification with progress bar
        return NotificationCompat.Builder(this, NotificationChannels.CHANNEL_LIVE_COUNTDOWN)
            .setSmallIcon(R.drawable.ic_tram_notif)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setProgress(100, progress, false)
            .setColor(accentColor)
            .setContentIntent(openPi)
            .addAction(0, "Stop", stopPi)
            .build()
    }

    private fun postNotification(notif: Notification) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, notif)
    }

    private fun stopTracking() {
        running = false
        handler.removeCallbacks(tickRunnable)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacks(tickRunnable)
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "tech.morgado.nexttram.ACTION_LIVE_START"
        const val ACTION_STOP = "tech.morgado.nexttram.ACTION_LIVE_STOP"
        const val EXTRA_ROUTE_ID = "live_route_id"
        const val EXTRA_REVERSED = "live_reversed"
        private const val NOTIF_ID = 4201
        private const val TICK_INTERVAL_MS = 10_000L
        private const val REFRESH_INTERVAL_MS = 30_000L

        fun start(context: Context, routeId: String? = null, reversed: Boolean = false) {
            val intent = Intent(context, LiveCountdownService::class.java).apply {
                action = ACTION_START
                if (!routeId.isNullOrBlank()) putExtra(EXTRA_ROUTE_ID, routeId)
                putExtra(EXTRA_REVERSED, reversed)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, LiveCountdownService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
