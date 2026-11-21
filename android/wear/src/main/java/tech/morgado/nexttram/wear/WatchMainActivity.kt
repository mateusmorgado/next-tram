package tech.morgado.nexttram.wear

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.wear.tiles.TileService
import tech.morgado.nexttram.shared.Catching
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import java.util.concurrent.Executors

/** Standalone Wear OS companion screen for live countdown, flipping direction, and sync code setup. */
class WatchMainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var store: RouteStore
    private lateinit var headerView: TextView
    private lateinit var lineBadge: TextView
    private lateinit var countdownView: TextView
    private lateinit var statusView: TextView
    private lateinit var upcomingView: TextView
    private lateinit var syncInput: EditText
    private var reversed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = RouteStore(this)
        setContentView(buildWatchUi())
        loadDepartures()
    }

    private fun buildWatchUi(): View {
        val dp = resources.displayMetrics.density
        fun px(v: Int) = (v * dp).toInt()

        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#101114"))
            isFillViewport = true
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(px(16), px(22), px(16), px(28))
        }
        scroll.addView(col)

        headerView = TextView(this).apply {
            text = store.activeRoute().displayName(reversed)
            textSize = 12f
            setTextColor(Color.parseColor("#9AA3B2"))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        col.addView(headerView)

        val heroRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, px(8), 0, px(4))
        }
        lineBadge = TextView(this).apply {
            text = "—"
            textSize = 16f
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setPadding(px(8), px(4), px(8), px(4))
            background = pillBg(Color.parseColor("#213A8F"), px(8))
        }
        countdownView = TextView(this).apply {
            text = "—m"
            textSize = 28f
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            setPadding(px(10), 0, 0, 0)
        }
        heroRow.addView(lineBadge)
        heroRow.addView(countdownView)
        col.addView(heroRow)

        statusView = TextView(this).apply {
            text = "Loading…"
            textSize = 13f
            setTextColor(Color.parseColor("#65B32E"))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        col.addView(statusView)

        upcomingView = TextView(this).apply {
            text = ""
            textSize = 11f
            setTextColor(Color.parseColor("#9AA3B2"))
            gravity = Gravity.CENTER
            setPadding(0, px(6), 0, px(10))
        }
        col.addView(upcomingView)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        btnRow.addView(watchBtn("Flip", "#232734", px) {
            reversed = !reversed
            loadDepartures()
        })
        btnRow.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(px(6), 1) })
        btnRow.addView(watchBtn("Refresh", "#213A8F", px) {
            loadDepartures()
        })
        col.addView(btnRow)

        // Sync code field for standalone watch setup
        syncInput = EditText(this).apply {
            hint = "Sync code"
            setHintTextColor(Color.parseColor("#6B7280"))
            setTextColor(Color.WHITE)
            textSize = 12f
            gravity = Gravity.CENTER
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setText(if (store.syncCode.isNotBlank()) TransitApi.formatCode(store.syncCode) else "")
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = px(12) }
        }
        col.addView(syncInput)
        col.addView(watchBtn("Sync Code", "#65B32E", px) {
            val clean = TransitApi.normalizeCode(syncInput.text.toString())
            if (TransitApi.isValidCode(clean)) {
                statusView.text = "Syncing…"
                executor.execute {
                    val routes = TransitApi.fetchFavorites(clean)
                    runOnUiThread {
                        if (!routes.isNullOrEmpty()) {
                            store.syncCode = clean
                            store.saveRoutes(routes)
                            store.activeRouteId = routes.first().id
                            loadDepartures()
                        } else {
                            statusView.text = "Code not found"
                        }
                    }
                }
            }
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = px(4) }
        })

        return scroll
    }

    private fun loadDepartures() {
        val route = store.activeRoute()
        headerView.text = route.displayName(reversed)
        statusView.text = "Updating…"
        val dp = resources.displayMetrics.density
        executor.execute {
            try {
                val plan = TransitApi.fetchPlan(route, reversed)
                val nowMs = System.currentTimeMillis()
                TileService.getUpdater(this).requestUpdate(NextTramWearTileService::class.java)
                runOnUiThread {
                    val hero = plan.hero
                    if (hero != null) {
                        val mins = Catching.minutesUntilDeparture(hero, nowMs)
                        lineBadge.text = hero.line
                        lineBadge.setTextColor(hero.colorFg)
                        lineBadge.background = pillBg(hero.colorBg, (8 * dp).toInt())
                        countdownView.text = if (mins <= 0) "now" else "${mins}m"
                        val delay = if (hero.delayMin >= 1) " (+${hero.delayMin}m)" else ""
                        statusView.text = "${Catching.statusLabel(hero, nowMs)}$delay"
                        statusView.setTextColor(
                            when (Catching.status(hero, nowMs)) {
                                Catching.Status.RUN -> Color.parseColor("#FF6B6B")
                                Catching.Status.LEAVE_NOW -> Color.parseColor("#FFCC00")
                                Catching.Status.WAIT -> Color.parseColor("#65B32E")
                            }
                        )
                        val next = plan.upcoming.filter { it.tripKey != hero.tripKey }.take(2).joinToString(" · ") {
                            "${it.line} ${Catching.minutesUntilDeparture(it, nowMs)}m"
                        }
                        upcomingView.text = if (next.isNotBlank()) "${hero.boardAt}\nNext: $next" else hero.boardAt
                    } else {
                        lineBadge.text = "—"
                        countdownView.text = "—"
                        statusView.text = "No trams soon"
                        upcomingView.text = ""
                    }
                }
            } catch (_: Exception) {
                runOnUiThread { statusView.text = "Offline" }
            }
        }
    }

    private fun watchBtn(label: String, bgHex: String, px: (Int) -> Int, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 11f
            setTextColor(Color.WHITE)
            background = pillBg(Color.parseColor(bgHex), px(12))
            setPadding(px(12), px(6), px(12), px(6))
            minHeight = 0
            minimumHeight = 0
            setOnClickListener { onClick() }
        }

    private fun pillBg(color: Int, radiusPx: Int): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusPx.toFloat()
            setColor(color)
        }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
