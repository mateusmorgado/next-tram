package tech.morgado.nexttram.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import tech.morgado.nexttram.shared.GeoUtils
import tech.morgado.nexttram.shared.Route
import tech.morgado.nexttram.shared.RouteMatch

/** Picks the nearest favorite stop/route using Android's built-in LocationManager. */
object LocationHelper {
    private const val MAX_AGE_MS = 30 * 60 * 1000L // 30 minutes

    fun hasLocationPermission(context: Context): Boolean {
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        return coarse == PackageManager.PERMISSION_GRANTED || fine == PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("MissingPermission")
    fun bestLastKnownLocation(context: Context): Location? {
        if (!hasLocationPermission(context)) return null
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val providers = listOf(
            LocationManager.FUSED_PROVIDER,
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
            LocationManager.PASSIVE_PROVIDER,
        ).filter {
            try { lm.allProviders.contains(it) } catch (_: Exception) { false }
        }
        val now = System.currentTimeMillis()
        var best: Location? = null
        for (p in providers) {
            val loc = try { lm.getLastKnownLocation(p) } catch (_: Exception) { null } ?: continue
            val age = now - loc.time
            if (age > MAX_AGE_MS && best != null) continue
            if (best == null || loc.accuracy < best.accuracy || (now - best.time) > MAX_AGE_MS) {
                best = loc
            }
        }
        return best
    }

    fun pickNearestRoute(context: Context, routes: List<Route>): RouteMatch? {
        val loc = bestLastKnownLocation(context) ?: return null
        return GeoUtils.nearestRouteAndDirection(routes, loc.latitude, loc.longitude)
    }
}
