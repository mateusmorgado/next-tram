package tech.morgado.nexttram.wear

import android.graphics.Color
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders
import androidx.wear.protolayout.DimensionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import tech.morgado.nexttram.shared.Catching
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import tech.morgado.nexttram.shared.TripPlan
import java.util.concurrent.Executors

/** Wear OS Tile showing the next tram departure countdown, line badge, and leave-now status. */
class NextTramWearTileService : TileService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val future = SettableFuture.create<TileBuilders.Tile>()
        executor.execute {
            val store = RouteStore(this)
            val route = store.activeRoute()
            val plan = try {
                TransitApi.fetchPlan(route, reversed = false)
            } catch (_: Exception) {
                null
            }
            val layout = LayoutElementBuilders.Layout.Builder()
                .setRoot(buildTileRoot(route.displayName(false), plan))
                .build()
            val timeline = TimelineBuilders.Timeline.Builder()
                .addTimelineEntry(
                    TimelineBuilders.TimelineEntry.Builder()
                        .setLayout(layout)
                        .build()
                )
                .build()
            val tile = TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES_VERSION)
                .setTileTimeline(timeline)
                .setFreshnessIntervalMillis(60_000L)
                .build()
            future.set(tile)
        }
        return future
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<ResourceBuilders.Resources> {
        val resources = ResourceBuilders.Resources.Builder()
            .setVersion(RESOURCES_VERSION)
            .build()
        return Futures.immediateFuture(resources)
    }

    private fun buildTileRoot(routeLabel: String, plan: TripPlan?): LayoutElementBuilders.LayoutElement {
        val nowMs = System.currentTimeMillis()
        val hero = plan?.hero

        val openAppAction = ActionBuilders.LaunchAction.Builder()
            .setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(packageName)
                    .setClassName(WatchMainActivity::class.java.name)
                    .build()
            )
            .build()

        val refreshAction = ActionBuilders.LoadAction.Builder().build()

        val col = LayoutElementBuilders.Column.Builder()
            .setWidth(DimensionBuilders.expand())
            .setHeight(DimensionBuilders.expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(ColorBuilders.argb(Color.parseColor("#101114")))
                            .build()
                    )
                    .setPadding(
                        ModifiersBuilders.Padding.Builder()
                            .setTop(DimensionBuilders.dp(18f))
                            .setBottom(DimensionBuilders.dp(14f))
                            .setStart(DimensionBuilders.dp(14f))
                            .setEnd(DimensionBuilders.dp(14f))
                            .build()
                    )
                    .setClickable(
                        ModifiersBuilders.Clickable.Builder()
                            .setId("open_watch_app")
                            .setOnClick(openAppAction)
                            .build()
                    )
                    .build()
            )

        // Header: route label
        col.addContent(
            styledText(routeLabel, 12f, Color.parseColor("#9AA3B2"), bold = true)
        )
        col.addContent(spacer(6f))

        if (hero != null) {
            val mins = Catching.minutesUntilDeparture(hero, nowMs)
            val status = Catching.status(hero, nowMs)
            val statusColor = when (status) {
                Catching.Status.RUN -> Color.parseColor("#FF6B6B")
                Catching.Status.LEAVE_NOW -> Color.parseColor("#FFCC00")
                Catching.Status.WAIT -> Color.parseColor("#65B32E")
            }

            // Line badge + big countdown row
            val heroRow = LayoutElementBuilders.Row.Builder()
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .addContent(
                    LayoutElementBuilders.Box.Builder()
                        .setModifiers(
                            ModifiersBuilders.Modifiers.Builder()
                                .setBackground(
                                    ModifiersBuilders.Background.Builder()
                                        .setColor(ColorBuilders.argb(hero.colorBg))
                                        .setCorner(
                                            ModifiersBuilders.Corner.Builder()
                                                .setRadius(DimensionBuilders.dp(8f))
                                                .build()
                                        )
                                        .build()
                                )
                                .setPadding(
                                    ModifiersBuilders.Padding.Builder()
                                        .setStart(DimensionBuilders.dp(8f))
                                        .setEnd(DimensionBuilders.dp(8f))
                                        .setTop(DimensionBuilders.dp(4f))
                                        .setBottom(DimensionBuilders.dp(4f))
                                        .build()
                                )
                                .build()
                        )
                        .addContent(styledText(hero.line, 16f, hero.colorFg, bold = true))
                        .build()
                )
                .addContent(
                    LayoutElementBuilders.Spacer.Builder()
                        .setWidth(DimensionBuilders.dp(10f))
                        .build()
                )
                .addContent(styledText(if (mins <= 0) "now" else "${mins}m", 32f, Color.WHITE, bold = true))
                .build()

            col.addContent(heroRow)
            col.addContent(spacer(4f))
            col.addContent(styledText(Catching.statusLabel(hero, nowMs), 14f, statusColor, bold = true))
            col.addContent(spacer(2f))
            val delayStr = if (hero.delayMin >= 1) " (+${hero.delayMin}m)" else ""
            col.addContent(styledText("${hero.boardAt}$delayStr", 11f, Color.parseColor("#8D96A6")))

            val next = plan.upcoming.firstOrNull { it.tripKey != hero.tripKey }
            if (next != null) {
                col.addContent(spacer(4f))
                val nm = Catching.minutesUntilDeparture(next, nowMs)
                col.addContent(styledText("Next: ${next.line} in ${nm}m", 11f, Color.parseColor("#C4C9D4")))
            }
        } else {
            col.addContent(spacer(10f))
            col.addContent(styledText("No trams soon", 16f, Color.WHITE, bold = true))
            col.addContent(spacer(4f))
            col.addContent(styledText("Tap Refresh below", 12f, Color.parseColor("#8D96A6")))
        }

        // Refresh pill
        col.addContent(spacer(10f))
        col.addContent(
            LayoutElementBuilders.Box.Builder()
                .setModifiers(
                    ModifiersBuilders.Modifiers.Builder()
                        .setBackground(
                            ModifiersBuilders.Background.Builder()
                                .setColor(ColorBuilders.argb(Color.parseColor("#232734")))
                                .setCorner(
                                    ModifiersBuilders.Corner.Builder()
                                        .setRadius(DimensionBuilders.dp(12f))
                                        .build()
                                )
                                .build()
                        )
                        .setPadding(
                            ModifiersBuilders.Padding.Builder()
                                .setStart(DimensionBuilders.dp(12f))
                                .setEnd(DimensionBuilders.dp(12f))
                                .setTop(DimensionBuilders.dp(5f))
                                .setBottom(DimensionBuilders.dp(5f))
                                .build()
                        )
                        .setClickable(
                            ModifiersBuilders.Clickable.Builder()
                                .setId("refresh_tile")
                                .setOnClick(refreshAction)
                                .build()
                        )
                        .build()
                )
                .addContent(styledText("Refresh", 11f, Color.WHITE, bold = true))
                .build()
        )

        return col.build()
    }

    private fun styledText(text: String, sizeSp: Float, color: Int, bold: Boolean = false): LayoutElementBuilders.Text {
        return LayoutElementBuilders.Text.Builder()
            .setText(text)
            .setMaxLines(1)
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(DimensionBuilders.sp(sizeSp))
                    .setColor(ColorBuilders.argb(color))
                    .setWeight(
                        if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD
                        else LayoutElementBuilders.FONT_WEIGHT_NORMAL
                    )
                    .build()
            )
            .build()
    }

    private fun spacer(dpVal: Float): LayoutElementBuilders.Spacer =
        LayoutElementBuilders.Spacer.Builder()
            .setHeight(DimensionBuilders.dp(dpVal))
            .build()

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val RESOURCES_VERSION = "1"
    }
}
