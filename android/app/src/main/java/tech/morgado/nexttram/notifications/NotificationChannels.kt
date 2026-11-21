package tech.morgado.nexttram.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object NotificationChannels {
    const val CHANNEL_LEAVE_NOW = "nexttram_leave_now"
    const val CHANNEL_DELAYS = "nexttram_delays"
    const val CHANNEL_LIVE_COUNTDOWN = "nexttram_live_countdown"
    const val CHANNEL_UPDATES = "nexttram_updates"

    fun ensureCreated(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val channels = listOf(
            NotificationChannel(
                CHANNEL_LEAVE_NOW,
                "Leave Now Alerts",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alerts when it is time to walk or run to catch your next tram."
            },
            NotificationChannel(
                CHANNEL_DELAYS,
                "Delay Alerts",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Warnings when your usual tram is delayed."
            },
            // IMPORTANCE_DEFAULT (not MIN) is required for Android 16 Promoted Live Updates.
            NotificationChannel(
                CHANNEL_LIVE_COUNTDOWN,
                "Live Tram Countdown",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Lock-screen live countdown tracker until your tram departs."
                setSound(null, null)
                enableVibration(false)
            },
            NotificationChannel(
                CHANNEL_UPDATES,
                "App Updates",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Notifies when a new NextTram APK release is available."
            },
        )
        nm.createNotificationChannels(channels)
    }
}
