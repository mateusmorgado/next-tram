package tech.morgado.nexttram.shared

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * Lightweight, zero-dependency HTTP client shared between Phone (:app) and Watch (:wear).
 * Mirrors src/transit/client.ts + src/sync/favorites-sync.ts + GitHub release checks.
 */
object TransitApi {
    private const val TIMEOUT_MS = 10_000
    private const val CACHE_TTL_MS = 45_000L
    private const val USER_AGENT = "NextTram-Android/1.0 (https://app.nexttram.morgado.tech)"

    private data class CachedDepartures(
        val fetchedAtMs: Long,
        val departures: List<Departure>,
    )

    private val planCache = ConcurrentHashMap<String, CachedDepartures>()
    private val parallelPool = Executors.newFixedThreadPool(2)

    fun normalizeCode(raw: String?): String =
        (raw ?: "").lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]"), "")

    fun isValidCode(code: String): Boolean = Regex("^[a-z0-9]{8,32}$").matches(code)

    fun formatCode(code: String): String =
        normalizeCode(code).chunked(4).joinToString("-")

    fun fetchFavorites(syncCode: String): List<Route>? {
        val clean = normalizeCode(syncCode)
        if (!isValidCode(clean)) return null
        val body = httpGet("${Defaults.APP_BASE_URL}/api/favorites?code=$clean") ?: return null
        val root = JSONObject(body)
        val arr = root.optJSONArray("routes") ?: return null
        val out = parseRoutesArray(arr)
        return out.ifEmpty { null }
    }

    fun fetchSpeechSummary(syncCode: String?, routeName: String? = null, back: Boolean = false): String? {
        val params = mutableListOf<String>()
        val clean = normalizeCode(syncCode)
        if (isValidCode(clean)) params.add("code=${enc(clean)}")
        if (!routeName.isNullOrBlank()) params.add("route=${enc(routeName)}")
        if (back) params.add("back=1")
        val lang = Locale.getDefault().language.lowercase(Locale.ROOT)
        if (lang in listOf("de", "en", "pt")) params.add("lang=$lang")
        val qs = if (params.isEmpty()) "" else "?${params.joinToString("&")}"
        return httpGet("${Defaults.APP_BASE_URL}/api/say$qs")?.trim()?.ifEmpty { null }
    }

    fun fetchLatestRelease(): ReleaseInfo? {
        val body = httpGet(Defaults.GITHUB_RELEASE_API, accept = "application/vnd.github+json") ?: return null
        val obj = JSONObject(body)
        val assets = obj.optJSONArray("assets") ?: JSONArray()
        var apkUrl: String? = null
        var wearApkUrl: String? = null
        for (i in 0 until assets.length()) {
            val a = assets.optJSONObject(i) ?: continue
            val name = a.optString("name", "")
            val url = a.optString("browser_download_url", "").ifBlank { null }
            if (name.equals("NextTram.apk", ignoreCase = true)) apkUrl = url
            else if (name.equals("NextTram-wear.apk", ignoreCase = true)) wearApkUrl = url
        }
        return ReleaseInfo(
            tagName = obj.optString("tag_name", "android-latest"),
            name = obj.optString("name", "NextTram for Android"),
            body = obj.optString("body", ""),
            publishedAt = obj.optString("published_at", ""),
            targetCommitish = obj.optString("target_commitish", ""),
            apkUrl = apkUrl,
            wearApkUrl = wearApkUrl,
        )
    }

    fun fetchPlan(route: Route, reversed: Boolean = false, forceRefresh: Boolean = false): TripPlan {
        val nowMs = System.currentTimeMillis()
        val cacheKey = "${route.id}|$reversed"
        if (!forceRefresh) {
            val cached = planCache[cacheKey]
            if (cached != null && (nowMs - cached.fetchedAtMs) < CACHE_TTL_MS) {
                return Catching.planTrips(route, reversed, cached.departures, nowMs)
            }
        }

        val bufferMin = route.buffer / 60.0
        val all = mutableListOf<Departure>()

        if (reversed) {
            val from = route.dest
            val to = route.stops.firstOrNull()?.stop ?: route.dest
            val walkBase = route.destWalk ?: 0.0
            val walk = walkBase + bufferMin
            all += fetchPair(route.city, from, to, route.modes, walk, walkBase, route.noRun, anyPlatform = true)
        } else if (route.stops.size > 1) {
            // Query both home stops in parallel to cut latency in half.
            val tasks = route.stops.map { origin ->
                Callable {
                    val walkBase = origin.walk
                    val walk = walkBase + bufferMin
                    fetchPair(route.city, origin.stop, route.dest, route.modes, walk, walkBase, route.noRun, anyPlatform = false)
                }
            }
            val futures = parallelPool.invokeAll(tasks)
            for (f in futures) {
                try {
                    all += f.get()
                } catch (_: Exception) {
                }
            }
        } else {
            for (origin in route.stops) {
                val walkBase = origin.walk
                val walk = walkBase + bufferMin
                all += fetchPair(route.city, origin.stop, route.dest, route.modes, walk, walkBase, route.noRun, anyPlatform = false)
            }
        }

        val deduped = all
            .sortedBy { it.depMs }
            .distinctBy { it.tripKey }

        if (deduped.isNotEmpty()) {
            planCache[cacheKey] = CachedDepartures(nowMs, deduped)
        }

        return Catching.planTrips(route, reversed, deduped, nowMs)
    }

    private fun fetchPair(
        cityKey: String,
        from: Stop,
        to: Stop,
        modes: String,
        walk: Double,
        walkBase: Double,
        noRun: Boolean,
        anyPlatform: Boolean,
    ): List<Departure> {
        val city = Defaults.cityOf(cityKey)
        val engines: List<() -> List<Departure>> = if (city.primary == "transitous") {
            listOf(
                { viaTransitous(cityKey, from, to, modes, walk, walkBase, noRun, anyPlatform) },
                { viaHafas(cityKey, from, to, modes, walk, walkBase, noRun) },
            )
        } else {
            listOf(
                { viaHafas(cityKey, from, to, modes, walk, walkBase, noRun) },
                { viaTransitous(cityKey, from, to, modes, walk, walkBase, noRun, anyPlatform) },
            )
        }
        for (engine in engines) {
            try {
                val result = engine()
                if (result.isNotEmpty()) return result
            } catch (_: Exception) {
                // Fall through to backup transit engine.
            }
        }
        return emptyList()
    }

    private fun viaTransitous(
        cityKey: String,
        from: Stop,
        to: Stop,
        modes: String,
        walk: Double,
        walkBase: Double,
        noRun: Boolean,
        anyPlatform: Boolean,
    ): List<Departure> {
        val fromId = if (anyPlatform && from.lat != null && from.lon != null) {
            "${from.lat},${from.lon}"
        } else {
            from.tid ?: (if (from.lat != null && from.lon != null) "${from.lat},${from.lon}" else resolveTransitousStopId(cityKey, from))
        } ?: return emptyList()

        val toId = to.tid
            ?: (if (to.lat != null && to.lon != null) "${to.lat},${to.lon}" else resolveTransitousStopId(cityKey, to))
            ?: return emptyList()

        val motisModes = when (modes) {
            "tram" -> "TRAM"
            "all" -> "TRANSIT"
            else -> "TRAM,BUS"
        }
        val isoNow = formatIsoUtc(System.currentTimeMillis())
        val maxPre = if (anyPlatform) "300" else "180"
        val url = "${Defaults.TRANSITOUS_BASE}/api/v1/plan" +
            "?fromPlace=${enc(fromId)}&toPlace=${enc(toId)}&time=${enc(isoNow)}" +
            "&transitModes=${enc(motisModes)}&maxPreTransitTime=$maxPre&numItineraries=8"

        val body = httpGet(url) ?: return emptyList()
        val itineraries = JSONObject(body).optJSONArray("itineraries") ?: return emptyList()
        val out = mutableListOf<Departure>()

        for (i in 0 until itineraries.length()) {
            val itin = itineraries.optJSONObject(i) ?: continue
            val legs = itin.optJSONArray("legs") ?: continue
            var firstTransit: JSONObject? = null
            for (j in 0 until legs.length()) {
                val l = legs.optJSONObject(j) ?: continue
                val m = l.optString("mode", "")
                if (m.isNotBlank() && m != "WALK" && m != "BIKE" && m != "CAR") {
                    firstTransit = l
                    break
                }
            }
            val leg = firstTransit ?: continue
            val product = productFromMotis(leg.optString("mode", ""), leg.optInt("routeType", -1))
            if (!modeAllowed(product, modes)) continue

            val depMs = parseIsoMs(leg.optString("startTime", "")) ?: continue
            val schedMs = parseIsoMs(leg.optString("scheduledStartTime", "")) ?: depMs
            val arrMs = parseIsoMs(itin.optString("endTime", leg.optString("endTime", "")))
            val rawLine = leg.optString("routeShortName", "").ifBlank { leg.optString("routeLongName", "") }
            val line = cleanLineLabel(rawLine, product)
            val direction = shortStopName(leg.optString("headsign", "").ifBlank {
                leg.optJSONObject("to")?.optString("name", "") ?: ""
            })
            val boardAt = shortStopName(leg.optJSONObject("from")?.optString("name", "") ?: from.name)
            val apiColor = leg.optString("routeColor", "").ifBlank { null }
            val color = Defaults.lineColor(cityKey, product, line, apiColor)
            val tripKey = leg.optString("tripId", "").ifBlank { "$line|$schedMs" }

            out.add(
                Departure(
                    tripKey = tripKey,
                    line = line,
                    product = product,
                    direction = direction,
                    depMs = depMs,
                    schedMs = schedMs,
                    delayMin = ((depMs - schedMs) / 60_000.0).roundToInt(),
                    realtime = leg.optBoolean("realTime", false),
                    arrMs = arrMs,
                    boardAt = boardAt,
                    walk = walk,
                    walkBase = walkBase,
                    noRun = noRun,
                    colorBg = color.bg,
                    colorFg = color.fg,
                    source = "transitous",
                )
            )
        }
        return out
    }

    private fun resolveTransitousStopId(cityKey: String, stop: Stop): String? {
        val city = Defaults.cityOf(cityKey)
        val q = stop.query ?: "${city.searchPrefix}, ${stop.name}"
        val body = httpGet("${Defaults.TRANSITOUS_BASE}/api/v1/geocode?text=${enc(q)}&language=de") ?: return null
        val arr = JSONArray(body)
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            if (item.optString("type") == "STOP") {
                return item.optString("id").ifBlank { null }
            }
        }
        return null
    }

    private fun viaHafas(
        cityKey: String,
        from: Stop,
        to: Stop,
        modes: String,
        walk: Double,
        walkBase: Double,
        noRun: Boolean,
    ): List<Departure> {
        val city = Defaults.cityOf(cityKey)
        val fromId = from.hafasId ?: resolveHafasId(city, from) ?: return emptyList()
        val toId = to.hafasId ?: resolveHafasId(city, to) ?: return emptyList()
        val url = "${city.hafasBase}/journeys?from=${enc(fromId)}&to=${enc(toId)}&results=8&stopovers=false&remarks=false"
        val body = httpGet(url) ?: return emptyList()
        val journeys = JSONObject(body).optJSONArray("journeys") ?: return emptyList()
        val out = mutableListOf<Departure>()

        for (i in 0 until journeys.length()) {
            val journey = journeys.optJSONObject(i) ?: continue
            val legs = journey.optJSONArray("legs") ?: continue
            var firstTransit: JSONObject? = null
            for (j in 0 until legs.length()) {
                val l = legs.optJSONObject(j) ?: continue
                if (!l.optBoolean("walking", false) && l.optJSONObject("line") != null) {
                    firstTransit = l
                    break
                }
            }
            val leg = firstTransit ?: continue
            if (leg.optBoolean("cancelled", false)) continue
            val lineObj = leg.optJSONObject("line") ?: continue
            val product = productFromHafas(lineObj.optString("product", lineObj.optString("mode", "")))
            if (!modeAllowed(product, modes)) continue

            val depStr = leg.optString("departure", "").ifBlank { leg.optString("plannedDeparture", "") }
            val depMs = parseIsoMs(depStr) ?: continue
            val schedMs = parseIsoMs(leg.optString("plannedDeparture", "")) ?: depMs
            val lastLeg = legs.optJSONObject(legs.length() - 1)
            val arrMs = lastLeg?.let {
                parseIsoMs(it.optString("arrival", "").ifBlank { it.optString("plannedArrival", "") })
            }
            val rawLine = lineObj.optString("name", "")
            val line = cleanLineLabel(rawLine, product)
            val direction = shortStopName(leg.optString("direction", "").ifBlank {
                leg.optJSONObject("destination")?.optString("name", "") ?: ""
            })
            val boardAt = shortStopName(leg.optJSONObject("origin")?.optString("name", "") ?: from.name)
            val apiColor = lineObj.optJSONObject("color")?.optString("bg", "")?.ifBlank { null }
            val color = Defaults.lineColor(cityKey, product, line, apiColor)
            val tripKey = leg.optString("tripId", "").ifBlank { "$line|$schedMs" }

            out.add(
                Departure(
                    tripKey = tripKey,
                    line = line,
                    product = product,
                    direction = direction,
                    depMs = depMs,
                    schedMs = schedMs,
                    delayMin = ((depMs - schedMs) / 60_000.0).roundToInt(),
                    realtime = leg.has("departureDelay") && !leg.isNull("departureDelay"),
                    arrMs = arrMs,
                    boardAt = boardAt,
                    walk = walk,
                    walkBase = walkBase,
                    noRun = noRun,
                    colorBg = color.bg,
                    colorFg = color.fg,
                    source = "hafas",
                )
            )
        }
        return out
    }

    private fun resolveHafasId(city: Defaults.CityConfig, stop: Stop): String? {
        val q = stop.query ?: "${city.searchPrefix}, ${stop.name}"
        val body = httpGet("${city.hafasBase}/locations?query=${enc(q)}&results=4&stops=true&addresses=false&poi=false") ?: return null
        val arr = JSONArray(body)
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val t = item.optString("type")
            if (t == "stop" || t == "station") {
                return item.optString("id").ifBlank { null }
            }
        }
        return null
    }

    fun parseRoutesArray(arr: JSONArray): List<Route> {
        val out = mutableListOf<Route>()
        for (i in 0 until arr.length()) {
            val r = arr.optJSONObject(i) ?: continue
            val dest = parseStop(r.optJSONObject("dest")) ?: continue
            val stopsArr = r.optJSONArray("stops") ?: continue
            val stops = mutableListOf<OriginStop>()
            for (j in 0 until stopsArr.length()) {
                val o = stopsArr.optJSONObject(j) ?: continue
                val s = parseStop(o.optJSONObject("stop")) ?: continue
                stops.add(OriginStop(s, o.optDouble("walk", 0.0).coerceIn(0.0, 60.0)))
            }
            if (stops.isEmpty()) continue
            val city = r.optString("city", "leipzig").let {
                if (it == "berlin" || it == "altenburg") it else "leipzig"
            }
            out.add(
                Route(
                    id = r.optString("id", "route").ifBlank { "route" },
                    label = r.optString("label", ""),
                    city = city,
                    stops = stops,
                    dest = dest,
                    modes = r.optString("modes", "tram_bus").ifBlank { "tram_bus" },
                    destWalk = if (r.has("destWalk") && !r.isNull("destWalk")) r.optDouble("destWalk", 0.0) else null,
                    noRun = r.optBoolean("noRun", false),
                    buffer = r.optInt("buffer", 0),
                )
            )
        }
        return out
    }

    fun routesToJson(routes: List<Route>): String {
        val arr = JSONArray()
        for (r in routes) {
            val o = JSONObject()
            o.put("id", r.id)
            o.put("label", r.label)
            o.put("city", r.city)
            o.put("modes", r.modes)
            if (r.destWalk != null) o.put("destWalk", r.destWalk)
            if (r.noRun) o.put("noRun", true)
            if (r.buffer > 0) o.put("buffer", r.buffer)
            o.put("dest", stopToJson(r.dest))
            val sa = JSONArray()
            for (st in r.stops) {
                val so = JSONObject()
                so.put("stop", stopToJson(st.stop))
                so.put("walk", st.walk)
                sa.put(so)
            }
            o.put("stops", sa)
            arr.put(o)
        }
        return arr.toString()
    }

    private fun parseStop(o: JSONObject?): Stop? {
        if (o == null) return null
        val name = o.optString("name", "").trim()
        if (name.isEmpty()) return null
        return Stop(
            name = name,
            query = o.optString("query", "").ifBlank { null },
            lat = if (o.has("lat") && !o.isNull("lat")) o.optDouble("lat") else null,
            lon = if (o.has("lon") && !o.isNull("lon")) o.optDouble("lon") else null,
            hafasId = o.optString("hafasId", "").ifBlank { null },
            tid = o.optString("tid", "").ifBlank { null },
        )
    }

    private fun stopToJson(s: Stop): JSONObject {
        val o = JSONObject()
        o.put("name", s.name)
        if (s.query != null) o.put("query", s.query)
        if (s.lat != null) o.put("lat", s.lat)
        if (s.lon != null) o.put("lon", s.lon)
        if (s.hafasId != null) o.put("hafasId", s.hafasId)
        if (s.tid != null) o.put("tid", s.tid)
        return o
    }

    private fun productFromMotis(mode: String, routeType: Int): String = when (mode.uppercase(Locale.ROOT)) {
        "TRAM" -> "tram"
        "BUS" -> "bus"
        "SUBWAY" -> "subway"
        "SUBURBAN" -> "suburban"
        "FERRY" -> "ferry"
        "RAIL", "REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "LONG_DISTANCE" -> "rail"
        else -> when (routeType) {
            0 -> "tram"
            1 -> "subway"
            3 -> "bus"
            4 -> "ferry"
            else -> "other"
        }
    }

    private fun productFromHafas(raw: String): String = when (raw.lowercase(Locale.ROOT)) {
        "tram" -> "tram"
        "bus" -> "bus"
        "subway" -> "subway"
        "suburban" -> "suburban"
        "ferry" -> "ferry"
        "regional", "regionalexpress", "express", "national", "nationalexpress" -> "rail"
        else -> "other"
    }

    private fun modeAllowed(product: String, filter: String): Boolean = when (filter) {
        "tram" -> product == "tram"
        "tram_bus" -> product == "tram" || product == "bus"
        else -> true
    }

    private fun cleanLineLabel(raw: String, product: String): String {
        val t = raw.trim()
        if (t.isEmpty()) return product.uppercase(Locale.ROOT).take(3)
        return t
            .replace(Regex("^(STR|Tram|Bus|SEV)\\s+", RegexOption.IGNORE_CASE), "")
            .trim()
            .ifEmpty { t }
    }

    private fun shortStopName(name: String): String =
        name.replace(Regex("^Leipzig,\\s*"), "")
            .replace(Regex("\\s*\\(Berlin\\)$"), "")
            .replace(Regex("^Altenburg \\(Thür\\.\\),\\s*"), "")
            .trim()

    fun parseIsoMs(iso: String): Long? {
        val s = iso.trim()
        if (s.isEmpty()) return null
        val normalized = s
            .replace(Regex("\\.\\d+"), "")
            .replace(Regex("Z$"), "+0000")
            .replace(Regex("([+-]\\d{2}):(\\d{2})$"), "$1$2")
        return try {
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US)
            fmt.parse(normalized)?.time
        } catch (_: Exception) {
            null
        }
    }

    private fun formatIsoUtc(ms: Long): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date(ms))
    }

    private fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")

    private fun httpGet(url: String, accept: String = "application/json"): String? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Accept", accept)
            setRequestProperty("User-Agent", USER_AGENT)
        }
        return try {
            val code = conn.responseCode
            if (code !in 200..299) return null
            BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
        } catch (_: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }
}
