package tech.morgado.nexttram.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Build
import android.widget.RemoteViews
import tech.morgado.nexttram.CompanionActivity
import tech.morgado.nexttram.LauncherActivity
import tech.morgado.nexttram.R
import tech.morgado.nexttram.assistant.AssistantRouter
import tech.morgado.nexttram.location.LocationHelper
import tech.morgado.nexttram.notifications.LiveCountdownService
import tech.morgado.nexttram.shared.Catching
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import tech.morgado.nexttram.shared.TripPlan
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/** Home-screen widget showing the next catchable tram, walk/run status, delay, and upcoming trams. */
class NextTramWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        refreshWidgetsAsync(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH -> refreshWidgetsAsync(context)
            ACTION_START_LIVE -> {
                val routeId = intent.getStringExtra(AssistantRouter.EXTRA_ROUTE_ID)
                val reversed = intent.getBooleanExtra(AssistantRouter.EXTRA_ROUTE_BACK, false)
                LiveCountdownService.start(context, routeId, reversed)
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "tech.morgado.nexttram.widget.ACTION_REFRESH"
        const val ACTION_START_LIVE = "tech.morgado.nexttram.widget.ACTION_START_LIVE"
        private val executor = Executors.newSingleThreadExecutor()

        fun refreshWidgetsAsync(context: Context) {
            val appCtx = context.applicationContext
            val mgr = AppWidgetManager.getInstance(appCtx)
            val ids = mgr.getAppWidgetIds(ComponentName(appCtx, NextTramWidgetProvider::class.java))
            if (ids.isEmpty()) return

            executor.execute {
                val store = RouteStore(appCtx)
                val routes = store.getRoutes()
                val match = if (store.locationAutoSwitch) {
                    LocationHelper.pickNearestRoute(appCtx, routes)
                } else {
                    null
                }
                val route = match?.route ?: store.activeRoute()
                val reversed = match?.reversed ?: false
                try {
                    val plan = TransitApi.fetchPlan(route, reversed)
                    renderPlanToAllWidgets(appCtx, plan)
                } catch (_: Exception) {
                    renderErrorToAllWidgets(appCtx, route.displayName(reversed))
                }
            }
        }

        fun renderPlanToAllWidgets(context: Context, plan: TripPlan) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, NextTramWidgetProvider::class.java))
            if (ids.isEmpty()) return

            val nowMs = System.currentTimeMillis()
            val hero = plan.hero
            val views = RemoteViews(context.packageName, R.layout.widget_next_tram)

            val header = buildString {
                append(plan.route.displayName(plan.reversed))
                append(" · ")
                append(SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(nowMs)))
            }
            views.setTextViewText(R.id.widget_route, header)

            if (hero != null) {
                val depMins = Catching.minutesUntilDeparture(hero, nowMs)
                val statusLabel = Catching.statusLabel(hero, nowMs)
                val status = Catching.status(hero, nowMs)

                views.setTextViewText(R.id.widget_line_badge, hero.line)
                views.setTextColor(R.id.widget_line_badge, hero.colorFg)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    views.setColorStateList(
                        R.id.widget_line_badge,
                        "setBackgroundTintList",
                        ColorStateList.valueOf(hero.colorBg),
                    )
                } else {
                    views.setInt(R.id.widget_line_badge, "setBackgroundColor", hero.colorBg)
                }

                views.setTextViewText(R.id.widget_status, statusLabel)
                views.setTextColor(
                    R.id.widget_status,
                    when (status) {
                        Catching.Status.RUN -> Color.parseColor("#FF6B6B")
                        Catching.Status.LEAVE_NOW -> Color.parseColor("#FFCC00")
                        Catching.Status.WAIT -> Color.WHITE
                    },
                )
                views.setTextViewText(R.id.widget_stop, "${hero.boardAt} → ${hero.direction}")
                views.setTextViewText(R.id.widget_countdown, if (depMins <= 0) "now" else "${depMins}m")

                val delayText = if (hero.delayMin >= 1) "+${hero.delayMin} min" else if (hero.realtime) "live" else ""
                views.setTextViewText(R.id.widget_delay, delayText)
                views.setTextColor(
                    R.id.widget_delay,
                    if (hero.delayMin >= 1) Color.parseColor("#FF6B6B") else Color.parseColor("#65B32E"),
                )

                val nextFew = plan.upcoming
                    .filter { it.tripKey != hero.tripKey }
                    .take(3)
                    .joinToString("  ·  ") { d ->
                        val m = Catching.minutesUntilDeparture(d, nowMs)
                        "${d.line} in ${m}m"
                    }
                views.setTextViewText(
                    R.id.widget_upcoming,
                    if (nextFew.isNotBlank()) "Next: $nextFew" else "Tap to open live view",
                )
            } else {
                views.setTextViewText(R.id.widget_line_badge, "—")
                views.setTextViewText(R.id.widget_status, "No trams soon")
                views.setTextViewText(R.id.widget_stop, plan.route.dest.name)
                views.setTextViewText(R.id.widget_countdown, "—")
                views.setTextViewText(R.id.widget_upcoming, "Tap refresh to check again")
                views.setTextViewText(R.id.widget_delay, "")
            }

            wireButtons(context, views, plan.route.id, plan.reversed)
            for (id in ids) mgr.updateAppWidget(id, views)
        }

        private fun renderErrorToAllWidgets(context: Context, routeTitle: String) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, NextTramWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val views = RemoteViews(context.packageName, R.layout.widget_next_tram)
            views.setTextViewText(R.id.widget_route, routeTitle)
            views.setTextViewText(R.id.widget_status, "Offline — tap refresh")
            views.setTextViewText(R.id.widget_countdown, "—")
            wireButtons(context, views, null, false)
            for (id in ids) mgr.updateAppWidget(id, views)
        }

        private fun wireButtons(context: Context, views: RemoteViews, routeId: String?, reversed: Boolean) {
            val openIntent = Intent(context, LauncherActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (!routeId.isNullOrBlank()) putExtra(AssistantRouter.EXTRA_ROUTE_ID, routeId)
                putExtra(AssistantRouter.EXTRA_ROUTE_BACK, reversed)
            }
            val openPi = PendingIntent.getActivity(
                context,
                6001,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_hero_row, openPi)

            val refreshIntent = Intent(context, NextTramWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            val refreshPi = PendingIntent.getBroadcast(
                context,
                6002,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_btn_refresh, refreshPi)

            val liveIntent = Intent(context, NextTramWidgetProvider::class.java).apply {
                action = ACTION_START_LIVE
                if (!routeId.isNullOrBlank()) putExtra(AssistantRouter.EXTRA_ROUTE_ID, routeId)
                putExtra(AssistantRouter.EXTRA_ROUTE_BACK, reversed)
            }
            val livePi = PendingIntent.getBroadcast(
                context,
                6003,
                liveIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_btn_live, livePi)

            val settingsIntent = Intent(context, CompanionActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val settingsPi = PendingIntent.getActivity(
                context,
                6004,
                settingsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_btn_settings, settingsPi)
        }
    }
}
