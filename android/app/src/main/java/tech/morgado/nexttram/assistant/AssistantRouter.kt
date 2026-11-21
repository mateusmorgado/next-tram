package tech.morgado.nexttram.assistant

import android.content.Intent
import android.net.Uri
import tech.morgado.nexttram.shared.Defaults
import tech.morgado.nexttram.shared.Route
import tech.morgado.nexttram.shared.RouteStore
import java.util.Locale

/**
 * Resolves Google Assistant / Gemini App Actions ("next tram home", "next tram work", "back home")
 * and app shortcut intents into the exact NextTram PWA deep-link URL (?route=<id>&back=1).
 */
object AssistantRouter {
    const val EXTRA_FEATURE = "assistant_feature"
    const val EXTRA_ROUTE_ID = "route_id"
    const val EXTRA_ROUTE_BACK = "route_back"

    data class Target(
        val route: Route,
        val reversed: Boolean,
    ) {
        fun toUri(): Uri {
            val builder = Uri.parse(Defaults.APP_BASE_URL).buildUpon()
            builder.appendQueryParameter("route", route.id)
            if (reversed) builder.appendQueryParameter("back", "1")
            return builder.build()
        }
    }

    fun resolve(intent: Intent?, store: RouteStore): Target? {
        if (intent == null) return null

        // Explicit route_id from dynamic shortcuts, widgets, or notifications.
        val explicitId = intent.getStringExtra(EXTRA_ROUTE_ID)
        val explicitBack = intent.getBooleanExtra(EXTRA_ROUTE_BACK, false) ||
            intent.getStringExtra(EXTRA_ROUTE_BACK)?.equals("true", ignoreCase = true) == true
        if (!explicitId.isNullOrBlank()) {
            val route = store.findRouteByQuery(explicitId) ?: store.activeRoute()
            return Target(route, explicitBack)
        }

        // Google Assistant / Gemini OPEN_APP_FEATURE parameter ("home", "work", "back home", route label).
        val feature = intent.getStringExtra(EXTRA_FEATURE)?.trim()?.lowercase(Locale.ROOT)
        if (feature.isNullOrBlank()) {
            return if (explicitBack) Target(store.activeRoute(), true) else null
        }

        val isBack = explicitBack ||
            feature.contains("back") ||
            feature.contains("return") ||
            feature.contains("zurück") ||
            feature.contains("zurueck") ||
            feature.contains("volta") ||
            feature == "way home"

        // Strip filler words so "next tram work" or "tram to hbf" matches the route label.
        val cleaned = feature
            .replace(Regex("\\b(next|tram|bus|to|from|way|go|back|return|the|my|zurück|nach|para)\\b"), " ")
            .trim()

        if (cleaned == "home" || cleaned == "zuhause" || cleaned == "casa") {
            // If a route is literally labeled "Home", open it; otherwise open the primary route (or back home).
            val homeRoute = store.findRouteByQuery(cleaned)
            return if (homeRoute != null) Target(homeRoute, isBack)
            else Target(store.activeRoute(), isBack)
        }

        val matched = store.findRouteByQuery(cleaned) ?: store.findRouteByQuery(feature)
        if (matched != null) {
            return Target(matched, isBack)
        }
        return Target(store.activeRoute(), isBack)
    }
}
