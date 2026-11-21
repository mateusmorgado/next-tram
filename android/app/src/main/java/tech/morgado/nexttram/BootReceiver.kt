package tech.morgado.nexttram

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import tech.morgado.nexttram.notifications.AlertWorker
import tech.morgado.nexttram.widget.NextTramWidgetProvider

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            AlertWorker.ensureScheduled(context)
            ShortcutsManager.refreshDynamicShortcuts(context)
            NextTramWidgetProvider.refreshWidgetsAsync(context)
        }
    }
}
