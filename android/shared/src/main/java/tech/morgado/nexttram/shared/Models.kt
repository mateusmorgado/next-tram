package tech.morgado.nexttram.shared

data class Stop(
    val name: String,
    val query: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val hafasId: String? = null,
    val tid: String? = null,
)

data class OriginStop(
    val stop: Stop,
    val walk: Double,
)

data class Route(
    val id: String,
    val label: String,
    val city: String,
    val stops: List<OriginStop>,
    val dest: Stop,
    val modes: String = "tram_bus",
    val destWalk: Double? = null,
    val noRun: Boolean = false,
    val buffer: Int = 0,
) {
    fun displayName(reversed: Boolean = false): String {
        val base = label.ifBlank { dest.name }
        return if (reversed) "Back from $base" else base
    }
}

data class LineColor(
    val bg: Int,
    val fg: Int,
)

data class Departure(
    val tripKey: String,
    val line: String,
    val product: String,
    val direction: String,
    val depMs: Long,
    val schedMs: Long,
    val delayMin: Int,
    val realtime: Boolean,
    val arrMs: Long?,
    val boardAt: String,
    val walk: Double,
    val walkBase: Double,
    val noRun: Boolean,
    val colorBg: Int,
    val colorFg: Int,
    val source: String,
)

data class TripPlan(
    val route: Route,
    val reversed: Boolean,
    val hero: Departure?,
    val tooTight: Departure?,
    val upcoming: List<Departure>,
    val fetchedAtMs: Long,
)

data class ReleaseInfo(
    val tagName: String,
    val name: String,
    val body: String,
    val publishedAt: String,
    val targetCommitish: String,
    val apkUrl: String?,
    val wearApkUrl: String?,
)

data class RouteMatch(
    val route: Route,
    val reversed: Boolean,
    val distanceKm: Double,
)
