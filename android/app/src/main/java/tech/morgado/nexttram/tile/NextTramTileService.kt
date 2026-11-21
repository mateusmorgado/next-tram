package tech.morgado.nexttram.tile

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import tech.morgado.nexttram.LauncherActivity
import tech.morgado.nexttram.assistant.AssistantRouter
import tech.morgado.nexttram.location.LocationHelper
import tech.morgado.nexttram.shared.Catching
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import java.util.concurrent.Executors

/** Quick Settings tile showing the live next tram countdown in the notification shade. */
class NextTramTileService : TileService() {
    private val executor = Executors.newSingleThreadExecutor()
    private var lastRouteId: String? = null
    private var lastReversed: Boolean = false

    override fun onStartListening() {
        super.onStartListening()
        val tile = qsTile ?: return
        tile.state = Tile.STATE_ACTIVE
        tile.label = "NextTram"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = "Checking…"
        }
        tile.updateTile()

        executor.execute {
            val store = RouteStore(this)
            val routes = store.getRoutes()
            val match = if (store.locationAutoSwitch) {
                LocationHelper.pickNearestRoute(this, routes)
            } else {
                null
            }
            val route = match?.route ?: store.activeRoute()
            val reversed = match?.reversed ?: false
            lastRouteId = route.id
            lastReversed = reversed

            try {
                val plan = TransitApi.fetchPlan(route, reversed)
                val hero = plan.hero
                val nowMs = System.currentTimeMillis()
                val labelText = if (hero != null) "${hero.line} in ${Catching.minutesUntilDeparture(hero, nowMs)}m" else "NextTram"
                val subText = if (hero != null) Catching.statusLabel(hero, nowMs) else route.displayName(reversed)
                qsTile?.let { t ->
                    t.state = Tile.STATE_ACTIVE
                    t.label = labelText
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        t.subtitle = subText
                    }
                    t.updateTile()
                }
            } catch (_: Exception) {
                qsTile?.let { t ->
                    t.state = Tile.STATE_INACTIVE
                    t.label = "NextTram"
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        t.subtitle = "Tap to open"
                    }
                    t.updateTile()
                }
            }
        }
    }

    override fun onClick() {
        super.onClick()
        val intent = Intent(this, LauncherActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            lastRouteId?.let { putExtra(AssistantRouter.EXTRA_ROUTE_ID, it) }
            putExtra(AssistantRouter.EXTRA_ROUTE_BACK, lastReversed)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val pi = PendingIntent.getActivity(
                this,
                7001,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            startActivityAndCollapse(pi)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
