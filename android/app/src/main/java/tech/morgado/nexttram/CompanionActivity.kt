package tech.morgado.nexttram

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import tech.morgado.nexttram.assistant.AssistantRouter
import tech.morgado.nexttram.location.LocationHelper
import tech.morgado.nexttram.notifications.AlertWorker
import tech.morgado.nexttram.notifications.LiveCountdownService
import tech.morgado.nexttram.notifications.NotificationChannels
import tech.morgado.nexttram.shared.Catching
import tech.morgado.nexttram.shared.Route
import tech.morgado.nexttram.shared.RouteStore
import tech.morgado.nexttram.shared.TransitApi
import tech.morgado.nexttram.updater.AppUpdater
import tech.morgado.nexttram.widget.NextTramWidgetProvider
import java.util.concurrent.Executors

/**
 * Native NextTram Control Center (reached via long-press shortcut "Alerts & sync",
 * Quick Settings tile long-press, Widget settings icon, or update notifications).
 */
class CompanionActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var store: RouteStore

    private lateinit var syncInput: EditText
    private lateinit var syncStatusText: TextView
    private lateinit var routeTitleText: TextView
    private lateinit var livePreviewText: TextView
    private lateinit var updateStatusText: TextView
    private lateinit var switchLocation: Switch
    private lateinit var switchLeaveNow: Switch
    private lateinit var switchDelays: Switch
    private lateinit var switchAutoUpdate: Switch

    private var previewReversed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NotificationChannels.ensureCreated(this)
        store = RouteStore(this)

        setContentView(buildUi())
        refreshLivePreview()

        if (intent?.getBooleanExtra(EXTRA_TRIGGER_UPDATE, false) == true) {
            checkAndInstallUpdate()
        }
    }

    private fun buildUi(): View {
        val dp = resources.displayMetrics.density
        fun px(v: Int) = (v * dp).toInt()

        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#101114"))
            isFillViewport = true
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(18), px(44), px(18), px(32))
        }
        scroll.addView(root)

        // Header
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val titleCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleCol.addView(text("NextTram", 24f, Color.WHITE, bold = true))
        titleCol.addView(text("Android Companion · v${BuildConfig.VERSION_NAME}", 12f, Color.parseColor("#8D96A6")))
        headerRow.addView(titleCol)
        headerRow.addView(pillButton("Open App", "#65B32E", "#101114") {
            val open = Intent(this, LauncherActivity::class.java).apply {
                putExtra(AssistantRouter.EXTRA_ROUTE_ID, store.activeRoute().id)
                putExtra(AssistantRouter.EXTRA_ROUTE_BACK, previewReversed)
            }
            startActivity(open)
        })
        root.addView(headerRow)

        // 1. Live Departures & Lock-Screen Live Updates Card
        val liveCard = card(px)
        liveCard.addView(sectionLabel("LIVE DEPARTURES & LOCK-SCREEN TRACKER"))
        routeTitleText = text(store.activeRoute().displayName(previewReversed), 17f, Color.WHITE, bold = true)
        liveCard.addView(routeTitleText)
        livePreviewText = text("Loading live departures…", 14f, Color.parseColor("#C4C9D4")).apply {
            setPadding(0, px(6), 0, px(12))
        }
        liveCard.addView(livePreviewText)

        val liveBtnRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        liveBtnRow.addView(
            pillButton("Start Live Update", "#213A8F", "#FFFFFF") {
                ensureNotificationPermission {
                    LiveCountdownService.start(this, store.activeRoute().id, previewReversed)
                    Toast.makeText(this, "Live countdown active on lock screen", Toast.LENGTH_SHORT).show()
                }
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = px(8)
                }
            }
        )
        liveBtnRow.addView(
            pillButton("Stop", "#2A2F3D", "#FFFFFF") {
                LiveCountdownService.stop(this)
                Toast.makeText(this, "Live countdown stopped", Toast.LENGTH_SHORT).show()
            }
        )
        liveCard.addView(liveBtnRow)

        val routeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, px(8), 0, 0)
        }
        routeRow.addView(
            pillButton("Switch Route", "#232734", "#E2E6EE") {
                cycleActiveRoute()
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = px(8)
                }
            }
        )
        routeRow.addView(
            pillButton("Flip Direction", "#232734", "#E2E6EE") {
                previewReversed = !previewReversed
                refreshLivePreview()
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
        )
        liveCard.addView(routeRow)
        root.addView(liveCard)

        // 2. Favorites Sync Card
        val syncCard = card(px)
        syncCard.addView(sectionLabel("SYNC FAVORITES FROM PWA"))
        syncCard.addView(
            text(
                "Paste your personal NextTram sync code (from Assistants in the app) so widgets, alerts, shortcuts, and Wear OS use your saved stops.",
                12f,
                Color.parseColor("#9AA3B2"),
            ).apply { setPadding(0, px(2), 0, px(8)) }
        )
        syncInput = EditText(this).apply {
            hint = "e.g. k7qm-2xrd-p9vt"
            setHintTextColor(Color.parseColor("#6B7280"))
            setTextColor(Color.WHITE)
            setText(if (store.syncCode.isNotBlank()) TransitApi.formatCode(store.syncCode) else "")
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            background = roundedBox("#101114", "#2F3545", px(10))
            setPadding(px(12), px(10), px(12), px(10))
        }
        syncCard.addView(syncInput)
        syncStatusText = text("${store.getRoutes().size} route(s) ready", 12f, Color.parseColor("#65B32E")).apply {
            setPadding(0, px(6), 0, px(8))
        }
        syncCard.addView(syncStatusText)
        syncCard.addView(pillButton("Sync Favorites Now", "#65B32E", "#101114") { syncFavorites() })
        root.addView(syncCard)

        // 3. Smart Alerts & Location Card
        val featuresCard = card(px)
        featuresCard.addView(sectionLabel("SMART ALERTS & LOCATION"))

        switchLeaveNow = toggleRow(
            featuresCard,
            "“Leave now” notifications",
            "Alerts when it's time to walk or run for your tram",
            store.leaveNowEnabled,
            px,
        ) { checked ->
            if (checked) {
                ensureNotificationPermission {
                    store.leaveNowEnabled = true
                    AlertWorker.ensureScheduled(this)
                }
            } else {
                store.leaveNowEnabled = false
            }
        }

        switchDelays = toggleRow(
            featuresCard,
            "Delay alerts",
            "Background check warns when your tram is 3+ min late",
            store.delayAlertsEnabled,
            px,
        ) { checked ->
            if (checked) {
                ensureNotificationPermission {
                    store.delayAlertsEnabled = true
                    AlertWorker.ensureScheduled(this)
                }
            } else {
                store.delayAlertsEnabled = false
            }
        }

        switchLocation = toggleRow(
            featuresCard,
            "Location-aware stops",
            "Automatically opens the nearest favorite stop (or way home)",
            store.locationAutoSwitch,
            px,
        ) { checked ->
            if (checked) {
                ensureLocationPermission {
                    store.locationAutoSwitch = true
                    NextTramWidgetProvider.refreshWidgetsAsync(this)
                }
            } else {
                store.locationAutoSwitch = false
            }
        }

        switchAutoUpdate = toggleRow(
            featuresCard,
            "Auto-check APK updates",
            "Checks GitHub android-latest release in the background",
            store.autoUpdateEnabled,
            px,
        ) { checked ->
            store.autoUpdateEnabled = checked
            if (checked) AlertWorker.ensureScheduled(this)
        }
        root.addView(featuresCard)

        // 4. App Updates Card
        val updateCard = card(px)
        updateCard.addView(sectionLabel("APP UPDATES"))
        updateStatusText = text("Installed build: ${BuildConfig.VERSION_NAME} (${BuildConfig.GIT_SHA.take(7)})", 13f, Color.parseColor("#C4C9D4")).apply {
            setPadding(0, px(4), 0, px(10))
        }
        updateCard.addView(updateStatusText)
        updateCard.addView(pillButton("Check & Install Update", "#2A2F3D", "#FFFFFF") { checkAndInstallUpdate() })
        root.addView(updateCard)

        // 5. Quick Tips Card
        val tipsCard = card(px)
        tipsCard.addView(sectionLabel("SHORTCUTS, WIDGET, ASSISTANT & WATCH"))
        tipsCard.addView(
            text(
                "• Home Widget: Long-press home screen → Widgets → NextTram\n" +
                    "• Quick Settings: Pull down twice → Edit → add NextTram tile\n" +
                    "• App Shortcuts: Long-press the NextTram app icon for Home / Way Home\n" +
                    "• Google Assistant / Gemini: Say “Open home in NextTram” or “Open back home in NextTram”\n" +
                    "• Wear OS Watch: Install NextTram-wear.apk from the android-latest release",
                12f,
                Color.parseColor("#9AA3B2"),
            ).apply { setLineSpacing(4f, 1.15f) }
        )
        root.addView(tipsCard)

        return scroll
    }

    private fun cycleActiveRoute() {
        val routes = store.getRoutes()
        if (routes.size <= 1) {
            Toast.makeText(this, "Only 1 route saved — sync your favorites to add more", Toast.LENGTH_SHORT).show()
            return
        }
        val currentIdx = routes.indexOfFirst { it.id == store.activeRoute().id }.coerceAtLeast(0)
        val next: Route = routes[(currentIdx + 1) % routes.size]
        store.activeRouteId = next.id
        NextTramWidgetProvider.refreshWidgetsAsync(this)
        refreshLivePreview()
    }

    private fun refreshLivePreview() {
        val route = store.activeRoute()
        routeTitleText.text = route.displayName(previewReversed)
        livePreviewText.text = "Fetching live departures…"
        executor.execute {
            try {
                val plan = TransitApi.fetchPlan(route, previewReversed)
                val nowMs = System.currentTimeMillis()
                val textOut = if (plan.hero != null) {
                    val h = plan.hero
                    val depMins = Catching.minutesUntilDeparture(h, nowMs)
                    val delay = if (h.delayMin >= 1) " (+${h.delayMin} min late)" else ""
                    val nextStr = plan.upcoming.filter { it.tripKey != h.tripKey }.take(2).joinToString(" · ") {
                        "${it.line} in ${Catching.minutesUntilDeparture(it, nowMs)}m"
                    }
                    buildString {
                        append("${h.line} → ${h.direction}\n")
                        append("${Catching.statusLabel(h, nowMs)} · departs in ${depMins} min$delay\n")
                        append("From ${h.boardAt}")
                        if (nextStr.isNotBlank()) append("\nNext: $nextStr")
                    }
                } else {
                    "No catchable trams right now for ${route.displayName(previewReversed)}."
                }
                NextTramWidgetProvider.renderPlanToAllWidgets(this, plan)
                runOnUiThread { livePreviewText.text = textOut }
            } catch (_: Exception) {
                runOnUiThread { livePreviewText.text = "Could not fetch live departures (offline?)." }
            }
        }
    }

    private fun syncFavorites() {
        val raw = syncInput.text.toString()
        val clean = TransitApi.normalizeCode(raw)
        if (!TransitApi.isValidCode(clean)) {
            syncStatusText.text = "Enter an 8–32 character sync code from the NextTram app."
            syncStatusText.setTextColor(Color.parseColor("#FF6B6B"))
            return
        }
        syncStatusText.text = "Syncing…"
        syncStatusText.setTextColor(Color.parseColor("#FFCC00"))
        executor.execute {
            val routes = TransitApi.fetchFavorites(clean)
            runOnUiThread {
                if (routes != null && routes.isNotEmpty()) {
                    store.syncCode = clean
                    store.saveRoutes(routes)
                    store.activeRouteId = routes.first().id
                    syncInput.setText(TransitApi.formatCode(clean))
                    syncStatusText.text = "Synced ${routes.size} favorite route(s)!"
                    syncStatusText.setTextColor(Color.parseColor("#65B32E"))
                    ShortcutsManager.refreshDynamicShortcuts(this)
                    NextTramWidgetProvider.refreshWidgetsAsync(this)
                    refreshLivePreview()
                } else {
                    syncStatusText.text = "No favorites found under that code."
                    syncStatusText.setTextColor(Color.parseColor("#FF6B6B"))
                }
            }
        }
    }

    private fun checkAndInstallUpdate() {
        updateStatusText.text = "Checking GitHub android-latest…"
        executor.execute {
            val release = TransitApi.fetchLatestRelease()
            if (release == null || release.apkUrl.isNullOrBlank()) {
                runOnUiThread { updateStatusText.text = "Could not reach GitHub releases." }
                return@execute
            }
            if (!AppUpdater.isUpdateAvailable(release)) {
                runOnUiThread {
                    updateStatusText.text = "You're already on the latest build (${BuildConfig.VERSION_NAME})."
                }
                return@execute
            }
            runOnUiThread { updateStatusText.text = "New build found — downloading NextTram.apk…" }
            val file = AppUpdater.downloadApk(this, release.apkUrl) { pct ->
                runOnUiThread { updateStatusText.text = "Downloading NextTram.apk… $pct%" }
            }
            runOnUiThread {
                if (file == null) {
                    updateStatusText.text = "Download failed. Try again."
                } else {
                    val launched = AppUpdater.installApk(this, file)
                    updateStatusText.text = if (launched) {
                        "Installer opened — tap Update to finish."
                    } else {
                        "Enable 'Install unknown apps' for NextTram, then tap Check & Install again."
                    }
                }
            }
        }
    }

    private fun ensureNotificationPermission(onGranted: () -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            onGranted()
            return
        }
        pendingNotifAction = onGranted
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
    }

    private fun ensureLocationPermission(onGranted: () -> Unit) {
        if (LocationHelper.hasLocationPermission(this)) {
            onGranted()
            return
        }
        pendingLocationAction = onGranted
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION),
            REQ_LOCATION,
        )
    }

    private var pendingNotifAction: (() -> Unit)? = null
    private var pendingLocationAction: (() -> Unit)? = null

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        when (requestCode) {
            REQ_NOTIF -> {
                if (granted) pendingNotifAction?.invoke()
                else {
                    switchLeaveNow.isChecked = store.leaveNowEnabled
                    switchDelays.isChecked = store.delayAlertsEnabled
                    Toast.makeText(this, "Notification permission is needed for alerts", Toast.LENGTH_SHORT).show()
                }
                pendingNotifAction = null
            }
            REQ_LOCATION -> {
                if (granted) pendingLocationAction?.invoke()
                else {
                    switchLocation.isChecked = false
                    store.locationAutoSwitch = false
                    Toast.makeText(this, "Location permission is needed for nearest-stop detection", Toast.LENGTH_SHORT).show()
                }
                pendingLocationAction = null
            }
        }
    }

    private fun card(px: (Int) -> Int): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = roundedBox("#181B22", "#262B38", px(16))
        setPadding(px(16), px(14), px(16), px(14))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = px(14) }
    }

    private fun sectionLabel(label: String): TextView =
        text(label, 11f, Color.parseColor("#7D8798"), bold = true).apply {
            letterSpacing = 0.08f
        }

    private fun text(content: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView =
        TextView(this).apply {
            text = content
            textSize = sizeSp
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
        }

    private fun pillButton(label: String, bgHex: String, fgHex: String, onClick: () -> Unit): Button {
        val dp = resources.displayMetrics.density
        return Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 13f
            setTextColor(Color.parseColor(fgHex))
            setTypeface(typeface, Typeface.BOLD)
            background = roundedBox(bgHex, bgHex, (12 * dp).toInt())
            setPadding((14 * dp).toInt(), (10 * dp).toInt(), (14 * dp).toInt(), (10 * dp).toInt())
            setOnClickListener { onClick() }
        }
    }

    private fun toggleRow(
        parent: LinearLayout,
        title: String,
        subtitle: String,
        initial: Boolean,
        px: (Int) -> Int,
        onToggle: (Boolean) -> Unit,
    ): Switch {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, px(10), 0, px(4))
        }
        val textCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = px(12)
            }
        }
        textCol.addView(text(title, 15f, Color.WHITE, bold = true))
        textCol.addView(text(subtitle, 12f, Color.parseColor("#8D96A6")))
        val sw = Switch(this).apply {
            isChecked = initial
            setOnCheckedChangeListener { _, isChecked -> onToggle(isChecked) }
        }
        row.addView(textCol)
        row.addView(sw)
        parent.addView(row)
        return sw
    }

    private fun roundedBox(fillHex: String, strokeHex: String, radiusPx: Int): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusPx.toFloat()
            setColor(Color.parseColor(fillHex))
            setStroke(2, Color.parseColor(strokeHex))
        }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_TRIGGER_UPDATE = "trigger_update_check"
        private const val REQ_NOTIF = 1001
        private const val REQ_LOCATION = 1002
    }
}
