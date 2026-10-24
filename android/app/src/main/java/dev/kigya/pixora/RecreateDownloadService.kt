package dev.kigya.pixora

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/** Narrow adapter lets the native module start/update/finish the OS-visible transfer independently. */
interface RecreateDownloadForeground {
    fun start(context: Context, cancel: () -> Unit, started: () -> Unit, failed: (String) -> Unit)
    fun update(context: Context, state: JSONObject)
    fun showCancelling(context: Context)
    fun finish(context: Context)
}

internal object AndroidRecreateDownloadForeground : RecreateDownloadForeground {
    override fun start(context: Context, cancel: () -> Unit, started: () -> Unit, failed: (String) -> Unit) =
        RecreateDownloadService.start(context, cancel, started, failed)
    override fun update(context: Context, state: JSONObject) = RecreateDownloadService.update(context, state)
    override fun showCancelling(context: Context) = RecreateDownloadService.showCancelling(context)
    override fun finish(context: Context) = RecreateDownloadService.finish(context)
}

/** Foreground transfer notification. Model bytes remain in RecreateModelStore, never in cache. */
class RecreateDownloadService : Service() {
    companion object {
        internal const val ACTION_START = "dev.kigya.pixora.RECREATE_DOWNLOAD_START"
        internal const val ACTION_CANCEL = "dev.kigya.pixora.RECREATE_DOWNLOAD_CANCEL"
        internal const val CHANNEL = "recreate_model_download"
        internal const val NOTIFICATION_ID = 1003
        @Volatile private var cancelWork: (() -> Unit)? = null
        @Volatile private var onStarted: (() -> Unit)? = null
        @Volatile private var onStartFailure: ((String) -> Unit)? = null
        @Volatile private var foreground = false
        @Volatile private var cancelling = false
        @Volatile private var lastNotificationAt = Long.MIN_VALUE
        @Volatile private var lastNotificationState = ""

        internal fun installCallbacks(cancel: () -> Unit, started: () -> Unit, failed: (String) -> Unit) {
            cancelWork = cancel; onStarted = started; onStartFailure = failed
            cancelling = false
        }

        internal fun start(context: Context, cancel: () -> Unit, started: () -> Unit, failed: (String) -> Unit) {
            installCallbacks(cancel, started, failed)
            createChannel(context)
            ContextCompat.startForegroundService(context, Intent(context, RecreateDownloadService::class.java).setAction(ACTION_START))
        }

        internal fun update(context: Context, state: JSONObject) {
            if (!foreground) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            val stateKey = state.optString("state") + if (cancelling) ":cancelling" else ""
            val now = SystemClock.elapsedRealtime()
            if (stateKey == lastNotificationState && lastNotificationAt != Long.MIN_VALUE && now - lastNotificationAt < 1_000L) return
            try {
                manager.notify(NOTIFICATION_ID, notification(context, state, cancelling))
                lastNotificationAt = now
                lastNotificationState = stateKey
            } catch (_: SecurityException) {}
        }

        internal fun showCancelling(context: Context) {
            cancelling = true
            update(context, JSONObject().put("state", "downloading").put("downloadedBytes", 0L).put("totalBytes", RecreateModelStore.TOTAL))
        }

        internal fun finish(context: Context) {
            foreground = false; cancelling = false
            lastNotificationAt = Long.MIN_VALUE; lastNotificationState = ""
            cancelWork = null; onStarted = null; onStartFailure = null
            try { context.stopService(Intent(context, RecreateDownloadService::class.java)) } catch (_: Exception) {}
        }

        private fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(CHANNEL, Localizer.text(context, "recreate.downloading"), NotificationManager.IMPORTANCE_LOW).apply {
                    setSound(null, null); enableVibration(false); lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                }
                context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
            }
        }

        private fun notification(context: Context, state: JSONObject, isCancelling: Boolean): Notification {
            val downloaded = state.optLong("downloadedBytes", 0L).coerceAtLeast(0L)
            val total = state.optLong("totalBytes", RecreateModelStore.TOTAL).coerceAtLeast(1L)
            val progress = ((downloaded.coerceAtMost(total) * 100L) / total).toInt()
            val giga = total >= 1_000_000_000L
            val divisor = if (giga) 1_000_000_000.0 else 1_000_000.0
            val number = NumberFormat.getNumberInstance(Locale.forLanguageTag(Localizer.language(context))).apply {
                minimumFractionDigits = 2; maximumFractionDigits = 2
            }
            val unit = if (giga) "GB" else "MB"
            val body = if (isCancelling) Localizer.text(context, "cancelling") else "${number.format(downloaded / divisor)} / ${number.format(total / divisor)} $unit"
            val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val builder = NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(Localizer.text(context, "recreate.downloading"))
                .setContentText(body)
                .setContentIntent(open)
                .setOngoing(true)
                .setSilent(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setProgress(100, progress, state.optString("state") == "verifying" || isCancelling)
            if (!isCancelling) {
                val cancel = PendingIntent.getService(context, NOTIFICATION_ID,
                    Intent(context, RecreateDownloadService::class.java).setAction(ACTION_CANCEL),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                builder.addAction(0, Localizer.text(context, "cancelJob"), cancel)
            }
            return builder.build()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_CANCEL) {
            showCancelling(this)
            try { cancelWork?.invoke() } catch (_: Exception) {}
            return START_NOT_STICKY
        }
        if (intent?.action != ACTION_START) { stopSelf(startId); return START_NOT_STICKY }
        return try {
            createChannel(this)
            ServiceCompat.startForeground(this, NOTIFICATION_ID,
                notification(this, JSONObject().put("state", "downloading").put("downloadedBytes", 0).put("totalBytes", RecreateModelStore.TOTAL), cancelling),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            foreground = true
            lastNotificationAt = SystemClock.elapsedRealtime()
            lastNotificationState = "downloading" + if (cancelling) ":cancelling" else ""
            onStarted?.also { onStarted = null }?.invoke()
            START_NOT_STICKY
        } catch (_: Exception) {
            foreground = false
            onStartFailure?.also { onStartFailure = null }?.invoke("SERVICE_START_FAILED")
            stopSelf(startId)
            START_NOT_STICKY
        }
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        try { cancelWork?.invoke() } catch (_: Exception) {}
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        foreground = false
        stopSelf(startId)
    }

    override fun onDestroy() {
        if (foreground) try { cancelWork?.invoke() } catch (_: Exception) {}
        foreground = false
        super.onDestroy()
    }
}
