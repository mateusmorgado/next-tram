package tech.morgado.nexttram.shared

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Mirrors src/transit/catching.ts so Android widgets, alerts, and Watch match the PWA exactly. */
object Catching {
    const val RUN_SAVES_SECS = 60.0

    enum class Status { WAIT, LEAVE_NOW, RUN }

    fun runSaveSecs(dep: Departure): Double {
        if (dep.noRun) return 0.0
        val base = if (dep.walkBase > 0.0) dep.walkBase else dep.walk
        return min(RUN_SAVES_SECS, base * 30.0)
    }

    fun isCatchable(dep: Departure, nowMs: Long): Boolean {
        val minRequiredMs = dep.walk * 60_000.0 - runSaveSecs(dep) * 1000.0
        return (dep.depMs - nowMs) >= minRequiredMs
    }

    fun needsRun(dep: Departure, nowMs: Long): Boolean {
        return isCatchable(dep, nowMs) && (dep.depMs - nowMs) < dep.walk * 60_000.0
    }

    /** Milliseconds until you should start walking (<= 0 means leave now or run). */
    fun leaveInMs(dep: Departure, nowMs: Long): Long {
        val walkMs = (dep.walk * 60_000.0).toLong()
        return (dep.depMs - walkMs) - nowMs
    }

    fun leaveInMinutes(dep: Departure, nowMs: Long): Int {
        return max(0, floor(leaveInMs(dep, nowMs) / 60_000.0).toInt())
    }

    fun minutesUntilDeparture(dep: Departure, nowMs: Long): Int {
        return max(0, floor((dep.depMs - nowMs) / 60_000.0).toInt())
    }

    fun status(dep: Departure, nowMs: Long): Status {
        if (needsRun(dep, nowMs)) return Status.RUN
        if (leaveInMs(dep, nowMs) <= 60_000L) return Status.LEAVE_NOW
        return Status.WAIT
    }

    fun statusLabel(dep: Departure, nowMs: Long): String {
        return when (status(dep, nowMs)) {
            Status.RUN -> "Run now!"
            Status.LEAVE_NOW -> "Leave now"
            Status.WAIT -> {
                val mins = leaveInMinutes(dep, nowMs)
                if (mins <= 1) "Leave in 1 min" else "Leave in $mins min"
            }
        }
    }

    fun planTrips(
        route: Route,
        reversed: Boolean,
        departures: List<Departure>,
        nowMs: Long = System.currentTimeMillis(),
    ): TripPlan {
        val upcoming = departures
            .filter { it.depMs > nowMs }
            .sortedBy { it.depMs }

        val catchable = upcoming.filter { isCatchable(it, nowMs) }
        val hero = if (reversed) {
            catchable.minByOrNull { it.arrMs ?: Long.MAX_VALUE }
        } else {
            catchable.firstOrNull()
        }

        val limit = hero?.depMs ?: Long.MAX_VALUE
        val tooTight = upcoming.firstOrNull { !isCatchable(it, nowMs) && it.depMs <= limit }

        return TripPlan(
            route = route,
            reversed = reversed,
            hero = hero,
            tooTight = tooTight,
            upcoming = upcoming.take(12),
            fetchedAtMs = nowMs,
        )
    }
}
