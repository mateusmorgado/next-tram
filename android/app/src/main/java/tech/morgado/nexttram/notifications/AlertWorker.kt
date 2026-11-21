package tech.morgado.nexttram.notifications

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import tech.morgado.nexttram.LauncherActivity
import tech.morgado.nexttram.R
import tech.morgado.nexttram.ShortcutsManager
import tech.morgado.nexttram.assistant.AssistantRouter
import tech.morgado.nexttram.location.LocationHelper
import tech.morgado.nexttram.shared.Catching
import tech.morgado.nexttram.shared.Departure
import tech.morgado.nexttram.shared.Route
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import tech.morgado.nexttram.updater.AppUpdater
import tech.morgado.nexttram.widget.NextTramWidgetProvider
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Background WorkManager worker powering:
 *  - "Leave now" / "Run!" notifications (daytime 06:00-23:00 only)
 *  - Delay alerts (when the usual tram is >= 3 min late)
 *  - Home-screen widget refresh (only when screen is on and a widget is placed)
 *  - Periodic GitHub android-latest auto-update checks (throttled to every 6h)
 */
class AlertWorker(
    appContext: Context,
    params: WorkerParameters,
) : Worker(appContext, params) {

    override fun doWork(): Result {
        val store = RouteStore(applicationContext)
        val alertsOn = store.leaveNowEnabled || store.delayAlertsEnabled
        val hasWidgets = NextTramWidgetProvider.hasWidgets(applicationContext)

        if (!alertsOn && !hasWidgets) {
            // No active transit features: only run throttled update check (every 6h) if enabled.
            try {
                AppUpdater.checkAndNotifyIfNeeded(applicationContext, force = false)
            } catch (_: Exception) {
            }
            return Result.success()
        }

        val pm = applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val screenOn = pm?.isInteractive ?: true
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val isOvernight = hour < 6 || hour >= 23

        // Never wake transit APIs while the phone is locked/asleep if only a widget is active,
        // and skip overnight polling (23:00-06:00) to respect battery and Transitous fair-use limits.
        val shouldFetchTransit = when {
            isOvernight -> false
            alertsOn -> true
            hasWidgets && screenOn -> true
            else -> false
        }

        if (shouldFetchTransit) {
            store.syncFromRemoteIfConfigured()
            ShortcutsManager.refreshDynamicShortcuts(applicationContext)

            val routes = store.getRoutes()
            val match = if (store.locationAutoSwitch) {
                LocationHelper.pickNearestRoute(applicationContext, routes)
            } else {
                null
            }
            val route = match?.route ?: store.activeRoute()
            val reversed = match?.reversed ?: false

            try {
                val plan = TransitApi.fetchPlan(route, reversed, forceRefresh = false)
                if (hasWidgets) {
                    NextTramWidgetProvider.renderPlanToAllWidgets(applicationContext, plan)
                }

                val hero = plan.hero
                val nowMs = System.currentTimeMillis()
                if (hero != null && alertsOn && canPostNotifications()) {
                    NotificationChannels.ensureCreated(applicationContext)

                    if (store.leaveNowEnabled) {
                        maybeNotifyLeaveNow(store, route, reversed, hero, nowMs)
                    }
                    if (store.delayAlertsEnabled) {
                        maybeNotifyDelay(store, route, reversed, hero)
                    }
                }
            } catch (_: Exception) {
                // Network errors are retried on the next periodic window.
            }
        }

        try {
            AppUpdater.checkAndNotifyIfNeeded(applicationContext, force = false)
        } catch (_: Exception) {
            // Non-critical update check.
        }

        return Result.success()
    }

    private fun maybeNotifyLeaveNow(store: RouteStore, route: Route, reversed: Boolean, dep: Departure, nowMs: Long) {
        val status = Catching.status(dep, nowMs)
        val leaveInMin = Catching.leaveInMinutes(dep, nowMs)
        if (status == Catching.Status.WAIT && leaveInMin > 2) return

        val key = "${dep.tripKey}|${status.name}"
        if (store.lastLeaveAlertKey == key) return
        store.lastLeaveAlertKey = key

        val depMins = Catching.minutesUntilDeparture(dep, nowMs)
        val title = when (status) {
            Catching.Status.RUN -> "Run for ${dep.line} → ${dep.direction}!"
            Catching.Status.LEAVE_NOW -> "Leave now for ${dep.line} → ${dep.direction}"
            Catching.Status.WAIT -> "Leave in $leaveInMin min for ${dep.line}"
        }
        val body = "Departs from ${dep.boardAt} in $depMins min" +
            if (dep.delayMin >= 1) " (+${dep.delayMin} min late)" else ""

        val openPi = openRoutePendingIntent(route, reversed, 5001)
        val trackIntent = Intent(applicationContext, LiveCountdownService::class.java).apply {
            action = LiveCountdownService.ACTION_START
            putExtra(LiveCountdownService.EXTRA_ROUTE_ID, route.id)
            putExtra(LiveCountdownService.EXTRA_REVERSED, reversed)
        }
        val trackPi = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PendingIntent.getForegroundService(
                applicationContext,
                5002,
                trackIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        } else {
            PendingIntent.getService(
                applicationContext,
                5002,
                trackIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        val notif = NotificationCompat.Builder(applicationContext, NotificationChannels.CHANNEL_LEAVE_NOW)
            .setSmallIcon(R.drawable.ic_tram_notif)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openPi)
            .addAction(0, "Track live", trackPi)
            .build()

        try {
            NotificationManagerCompat.from(applicationContext).notify(NOTIF_ID_LEAVE_NOW, notif)
        } catch (_: SecurityException) {
        }
    }

    private fun maybeNotifyDelay(store: RouteStore, route: Route, reversed: Boolean, dep: Departure) {
        if (dep.delayMin < DELAY_THRESHOLD_MIN) return
        val key = "${dep.tripKey}|delay:${dep.delayMin}"
        if (store.lastDelayAlertKey == key) return
        store.lastDelayAlertKey = key

        val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(dep.depMs))
        val notif = NotificationCompat.Builder(applicationContext, NotificationChannels.CHANNEL_DELAYS)
            .setSmallIcon(R.drawable.ic_tram_notif)
            .setContentTitle("${dep.line} delayed +${dep.delayMin} min")
            .setContentText("Now departing $timeStr from ${dep.boardAt} → ${dep.direction}")
            .setAutoCancel(true)
            .setContentIntent(openRoutePendingIntent(route, reversed, 5003))
            .build()

        try {
            NotificationManagerCompat.from(applicationContext).notify(NOTIF_ID_DELAY, notif)
        } catch (_: SecurityException) {
        }
    }

    private fun openRoutePendingIntent(route: Route, reversed: Boolean, reqCode: Int): PendingIntent {
        val intent = Intent(applicationContext, LauncherActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(AssistantRouter.EXTRA_ROUTE_ID, route.id)
            putExtra(AssistantRouter.EXTRA_ROUTE_BACK, reversed)
        }
        return PendingIntent.getActivity(
            applicationContext,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun canPostNotifications(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            applicationContext,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        private const val WORK_NAME = "nexttram_background_monitor"
        private const val DELAY_THRESHOLD_MIN = 3
        private const val NOTIF_ID_LEAVE_NOW = 4301
        private const val NOTIF_ID_DELAY = 4302

        fun ensureScheduled(context: Context) {
            val store = RouteStore(context)
            val needed = store.leaveNowEnabled ||
                store.delayAlertsEnabled ||
                store.autoUpdateEnabled ||
                NextTramWidgetProvider.hasWidgets(context)
            val wm = WorkManager.getInstance(context.applicationContext)
            if (!needed) {
                wm.cancelUniqueWork(WORK_NAME)
                return
            }
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val req = PeriodicWorkRequestBuilder<AlertWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()
            wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
