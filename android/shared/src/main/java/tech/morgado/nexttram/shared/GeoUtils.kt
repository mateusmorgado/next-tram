package tech.morgado.nexttram.shared

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

object GeoUtils {
    private const val EARTH_RADIUS_KM = 6371.0

    fun distanceKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return 2.0 * EARTH_RADIUS_KM * asin(sqrt(a.coerceIn(0.0, 1.0)))
    }

    /**
     * Picks the favorite route whose origin or destination stop is closest to the user.
     * If the user is closer to a route's destination stop (e.g. at Work/Hbf), returns `reversed = true`
     * so NextTram opens directly on the trip back home!
     */
    fun nearestRouteAndDirection(routes: List<Route>, lat: Double, lon: Double, maxKm: Double = 25.0): RouteMatch? {
        var best: RouteMatch? = null
        for (route in routes) {
            for (origin in route.stops) {
                val sLat = origin.stop.lat ?: continue
                val sLon = origin.stop.lon ?: continue
                val d = distanceKm(lat, lon, sLat, sLon)
                if (d <= maxKm && (best == null || d < best.distanceKm)) {
                    best = RouteMatch(route = route, reversed = false, distanceKm = d)
                }
            }
            val dLat = route.dest.lat
            val dLon = route.dest.lon
            if (dLat != null && dLon != null) {
                val d = distanceKm(lat, lon, dLat, dLon)
                if (d <= maxKm && (best == null || d < best.distanceKm)) {
                    best = RouteMatch(route = route, reversed = true, distanceKm = d)
                }
            }
        }
        return best
    }
}
