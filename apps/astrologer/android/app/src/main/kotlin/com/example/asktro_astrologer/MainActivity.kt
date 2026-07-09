package com.example.asktro_astrologer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        createIncomingChannel()
    }

    /**
     * A high-importance channel so a NEW consultation request rings loudly with a
     * heads-up banner and our ringtone even when the app is backgrounded or
     * closed. Created once on app start; channels persist across restarts, so it
     * exists by the time a push arrives (the astrologer opens the app to go
     * online first). The backend targets this channel by id ("incoming_consult").
     */
    private fun createIncomingChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java) ?: return
            val soundUri = Uri.parse("android.resource://$packageName/raw/incoming_ring")
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val channel = NotificationChannel(
                "incoming_consult",
                "Incoming consultations",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "New chat / call requests from customers"
                setSound(soundUri, attrs)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 500, 500)
                setShowBadge(true)
            }
            manager.createNotificationChannel(channel)
        }
    }
}
