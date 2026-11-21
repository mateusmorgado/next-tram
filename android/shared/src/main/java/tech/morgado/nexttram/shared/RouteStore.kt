package tech.morgado.nexttram.shared

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray

/** SharedPreferences persistence for routes, sync code, alert toggles, and update state. */
class RouteStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var syncCode: String
        get() = prefs.getString(KEY_SYNC_CODE, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SYNC_CODE, TransitApi.normalizeCode(value)).apply()

    var activeRouteId: String?
        get() = prefs.getString(KEY_ACTIVE_ROUTE, null)
        set(value) = prefs.edit().putString(KEY_ACTIVE_ROUTE, value).apply()

    var leaveNowEnabled: Boolean
        get() = prefs.getBoolean(KEY_LEAVE_NOW, false)
        set(value) = prefs.edit().putBoolean(KEY_LEAVE_NOW, value).apply()

    var delayAlertsEnabled: Boolean
        get() = prefs.getBoolean(KEY_DELAY_ALERTS, false)
        set(value) = prefs.edit().putBoolean(KEY_DELAY_ALERTS, value).apply()

    var locationAutoSwitch: Boolean
        get() = prefs.getBoolean(KEY_LOCATION_AUTO, false)
        set(value) = prefs.edit().putBoolean(KEY_LOCATION_AUTO, value).apply()

    var autoUpdateEnabled: Boolean
        get() = prefs.getBoolean(KEY_AUTO_UPDATE, true)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_UPDATE, value).apply()

    var lastUpdateCheckMs: Long
        get() = prefs.getLong(KEY_LAST_UPDATE_CHECK, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_UPDATE_CHECK, value).apply()

    var lastNotifiedReleaseKey: String
        get() = prefs.getString(KEY_LAST_NOTIFIED_RELEASE, "") ?: ""
        set(value) = prefs.edit().putString(KEY_LAST_NOTIFIED_RELEASE, value).apply()

    var lastLeaveAlertKey: String
        get() = prefs.getString(KEY_LAST_LEAVE_ALERT, "") ?: ""
        set(value) = prefs.edit().putString(KEY_LAST_LEAVE_ALERT, value).apply()

    var lastDelayAlertKey: String
        get() = prefs.getString(KEY_LAST_DELAY_ALERT, "") ?: ""
        set(value) = prefs.edit().putString(KEY_LAST_DELAY_ALERT, value).apply()

    fun getRoutes(): List<Route> {
        val raw = prefs.getString(KEY_ROUTES_JSON, null) ?: return Defaults.DEFAULT_ROUTES
        return try {
            val parsed = TransitApi.parseRoutesArray(JSONArray(raw))
            parsed.ifEmpty { Defaults.DEFAULT_ROUTES }
        } catch (_: Exception) {
            Defaults.DEFAULT_ROUTES
        }
    }

    fun saveRoutes(routes: List<Route>) {
        if (routes.isEmpty()) return
        prefs.edit().putString(KEY_ROUTES_JSON, TransitApi.routesToJson(routes)).apply()
    }

    fun activeRoute(): Route {
        val routes = getRoutes()
        val id = activeRouteId
        return routes.firstOrNull { it.id == id } ?: routes.first()
    }

    fun findRouteByQuery(query: String?): Route? {
        if (query.isNullOrBlank()) return null
        val q = query.trim().lowercase()
        val routes = getRoutes()
        return routes.firstOrNull { it.id.equals(q, ignoreCase = true) }
            ?: routes.firstOrNull { it.label.lowercase() == q }
            ?: routes.firstOrNull { it.label.lowercase().contains(q) || it.dest.name.lowercase().contains(q) }
            ?: routes.firstOrNull { r -> r.stops.any { it.stop.name.lowercase().contains(q) } }
    }

    /** Refreshes routes from /api/favorites if a valid sync code is saved. */
    fun syncFromRemoteIfConfigured(): Boolean {
        val code = syncCode
        if (!TransitApi.isValidCode(code)) return false
        val remote = TransitApi.fetchFavorites(code) ?: return false
        saveRoutes(remote)
        return true
    }

    companion object {
        private const val PREFS_NAME = "nexttram_native_prefs"
        private const val KEY_SYNC_CODE = "sync_code"
        private const val KEY_ROUTES_JSON = "routes_json"
        private const val KEY_ACTIVE_ROUTE = "active_route_id"
        private const val KEY_LEAVE_NOW = "leave_now_enabled"
        private const val KEY_DELAY_ALERTS = "delay_alerts_enabled"
        private const val KEY_LOCATION_AUTO = "location_auto_switch"
        private const val KEY_AUTO_UPDATE = "auto_update_enabled"
        private const val KEY_LAST_UPDATE_CHECK = "last_update_check_ms"
        private const val KEY_LAST_NOTIFIED_RELEASE = "last_notified_release"
        private const val KEY_LAST_LEAVE_ALERT = "last_leave_alert_key"
        private const val KEY_LAST_DELAY_ALERT = "last_delay_alert_key"
    }
}
