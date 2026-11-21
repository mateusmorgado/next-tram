package tech.morgado.nexttram

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import tech.morgado.nexttram.assistant.AssistantRouter
import tech.morgado.nexttram.shared.RouteStore

/** Publishes dynamic long-press launcher shortcuts for the user's synced favorite routes. */
object ShortcutsManager {
    fun refreshDynamicShortcuts(context: Context) {
        val store = RouteStore(context)
        val routes = store.getRoutes().take(2)
        val shortcuts = mutableListOf<ShortcutInfoCompat>()

        for ((index, route) in routes.withIndex()) {
            val label = route.displayName(reversed = false).take(22)
            val intent = Intent(context, LauncherActivity::class.java).apply {
                action = "tech.morgado.nexttram.ACTION_SHORTCUT"
                putExtra(AssistantRouter.EXTRA_ROUTE_ID, route.id)
                putExtra(AssistantRouter.EXTRA_ROUTE_BACK, false)
            }
            shortcuts.add(
                ShortcutInfoCompat.Builder(context, "fav_route_$index")
                    .setShortLabel(label)
                    .setLongLabel("Next tram → $label")
                    .setIcon(IconCompat.createWithResource(context, R.drawable.ic_tram_notif))
                    .setIntent(intent)
                    .addCapabilityBinding(
                        "actions.intent.OPEN_APP_FEATURE",
                        "feature",
                        listOf(label, route.dest.name),
                    )
                    .build()
            )
        }

        try {
            ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
        } catch (_: Exception) {
            // Ignore on launchers that reject dynamic shortcut updates.
        }
    }
}
