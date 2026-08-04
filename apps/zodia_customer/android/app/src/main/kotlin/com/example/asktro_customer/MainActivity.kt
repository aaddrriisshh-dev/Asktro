package com.example.asktro_customer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Adds an `asktro/downloads` method channel so the app can save a generated file
 * (e.g. the Kundali Match PDF) straight into the phone's public Downloads — no
 * "save to…" picker — and post a "Download complete" notification. Uses
 * MediaStore on Android 10+ (no permission needed). On older devices it throws
 * so the Dart side can fall back to the system save dialog.
 */
class MainActivity : FlutterActivity() {
    private val channelName = "asktro/downloads"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "saveToDownloads" -> {
                        try {
                            val bytes = call.argument<ByteArray>("bytes")
                                ?: throw IllegalArgumentException("bytes required")
                            val fileName = call.argument<String>("fileName") ?: "download.pdf"
                            val mime = call.argument<String>("mime") ?: "application/octet-stream"
                            saveToDownloads(bytes, fileName, mime)
                            notifyComplete(fileName)
                            result.success(fileName)
                        } catch (e: Exception) {
                            result.error("SAVE_FAILED", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun saveToDownloads(bytes: ByteArray, fileName: String, mime: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Legacy storage needs a runtime permission; let Dart fall back to the
            // system save dialog instead.
            throw UnsupportedOperationException("Pre-Q storage handled on the Dart side")
        }
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("Could not create a Downloads entry")
        resolver.openOutputStream(uri)?.use { it.write(bytes) }
            ?: throw IllegalStateException("Could not open the output stream")
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
    }

    private fun notifyComplete(fileName: String) {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val channelId = "downloads"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Downloads", NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, channelId)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        builder
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Download complete")
            .setContentText("$fileName saved to Downloads")
            .setAutoCancel(true)
        nm.notify(fileName.hashCode(), builder.build())
    }
}
