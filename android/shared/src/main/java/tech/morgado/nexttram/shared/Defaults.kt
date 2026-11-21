package tech.morgado.nexttram.shared

import android.graphics.Color

object Defaults {
    const val APP_BASE_URL = "https://app.nexttram.morgado.tech"
    const val TRANSITOUS_BASE = "https://api.transitous.org"
    const val GITHUB_RELEASE_API = "https://api.github.com/repos/mateusmorgado/next-tram/releases/tags/android-latest"

    data class CityConfig(
        val key: String,
        val label: String,
        val primary: String,
        val hafasBase: String,
        val searchPrefix: String,
        val centerLat: Double,
        val centerLon: Double,
        val radiusKm: Double = 35.0,
    )

    val CITIES: Map<String, CityConfig> = mapOf(
        "leipzig" to CityConfig(
            key = "leipzig",
            label = "Leipzig",
            primary = "transitous",
            hafasBase = "https://v6.db.transport.rest",
            searchPrefix = "Leipzig",
            centerLat = 51.3397,
            centerLon = 12.3731,
        ),
        "berlin" to CityConfig(
            key = "berlin",
            label = "Berlin",
            primary = "hafas",
            hafasBase = "https://v6.bvg.transport.rest",
            searchPrefix = "Berlin",
            centerLat = 52.52,
            centerLon = 13.405,
        ),
        "altenburg" to CityConfig(
            key = "altenburg",
            label = "Altenburg",
            primary = "transitous",
            hafasBase = "https://v6.db.transport.rest",
            searchPrefix = "Altenburg (Thür.)",
            centerLat = 50.9876,
            centerLon = 12.4367,
            radiusKm = 12.0,
        ),
    )

    fun cityOf(key: String): CityConfig = CITIES[key] ?: CITIES.getValue("leipzig")

    val DEFAULT_ROUTES: List<Route> = listOf(
        Route(
            id = "lej-hbf",
            label = "Hbf",
            city = "leipzig",
            stops = listOf(
                OriginStop(Stop("Edlichstraße", "Leipzig, Edlichstraße", 51.3447, 12.4149), 2.0),
                OriginStop(Stop("Torgauer Platz", "Leipzig, Torgauer Platz", 51.3469, 12.4141), 4.0),
            ),
            dest = Stop("Hauptbahnhof", "Leipzig Hauptbahnhof", 51.3455, 12.3817),
        ),
        Route(
            id = "ber-strassmann",
            label = "Straßmannstr.",
            city = "berlin",
            stops = listOf(
                OriginStop(Stop("Straßmannstr.", "Straßmannstr. (Berlin)", 52.5195, 13.4567), 2.0),
            ),
            dest = Stop("U Eberswalder Str.", "U Eberswalder Str. (Berlin)", 52.5413, 13.4123, hafasId = "900110006"),
        ),
    )

    private val LEIPZIG_TRAM_COLORS = mapOf(
        "1" to "#65B32E", "1E" to "#65B32E", "3" to "#65B32E", "3E" to "#65B32E", "N17" to "#65B32E",
        "2" to "#FFCC00", "8" to "#FFCC00", "9" to "#FFCC00",
        "4" to "#213A8F", "7" to "#213A8F", "12" to "#213A8F", "15" to "#213A8F",
        "10" to "#E30613", "11" to "#E30613", "14" to "#E30613", "16" to "#E30613", "N10" to "#E30613",
    )

    private val BERLIN_SUBWAY_COLORS = mapOf(
        "U1" to "#7DAD4C", "U2" to "#DA421E", "U3" to "#16683D", "U4" to "#F0D722",
        "U5" to "#7E5330", "U6" to "#8C6DAB", "U7" to "#528DBA", "U8" to "#224F86", "U9" to "#F3791D",
    )

    private val BERLIN_SUBURBAN_COLORS = mapOf(
        "S1" to "#DA6BA2", "S2" to "#007734", "S25" to "#007734", "S26" to "#007734",
        "S3" to "#0066AD", "S41" to "#AD5937", "S42" to "#CB6418", "S45" to "#CD9C53",
        "S46" to "#CD9C53", "S47" to "#CD9C53", "S5" to "#EB7405", "S7" to "#816DA6",
        "S75" to "#816DA6", "S8" to "#66AA22", "S85" to "#66AA22", "S9" to "#992746",
    )

    private val PRODUCT_DEFAULT_HEX = mapOf(
        "tram" to "#D7262F",
        "bus" to "#7B3FA0",
        "subway" to "#1D5FB4",
        "suburban" to "#188744",
        "rail" to "#5B6170",
        "ferry" to "#1D7FB4",
        "other" to "#5B6170",
    )

    fun lineColor(city: String, product: String, line: String, apiBgHex: String? = null): LineColor {
        val key = line.trim().uppercase()
        val curatedHex = when (city) {
            "leipzig" -> if (product == "tram") LEIPZIG_TRAM_COLORS[key] else null
            "berlin" -> when (product) {
                "subway" -> BERLIN_SUBWAY_COLORS[key]
                "suburban" -> BERLIN_SUBURBAN_COLORS[key]
                else -> null
            }
            else -> null
        }

        val chosenHex = curatedHex
            ?: normalizeHex(apiBgHex)?.takeUnless { it == "#FFFFFF" || it == "#000000" }
            ?: PRODUCT_DEFAULT_HEX[product]
            ?: "#5B6170"

        val bg = Color.parseColor(chosenHex)
        val fg = contrastText(bg)
        return LineColor(bg, fg)
    }

    private fun normalizeHex(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        var h = raw.trim().removePrefix("#")
        if (h.length == 3 && h.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
            h = "${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}"
        }
        return if (h.length == 6 && h.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
            "#${h.uppercase()}"
        } else {
            null
        }
    }

    private fun contrastText(bg: Int): Int {
        fun channel(v: Int): Double {
            val s = v / 255.0
            return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
        }
        val lum = 0.2126 * channel(Color.red(bg)) +
            0.7152 * channel(Color.green(bg)) +
            0.0722 * channel(Color.blue(bg))
        return if (lum > 0.4) Color.parseColor("#111111") else Color.WHITE
    }
}
