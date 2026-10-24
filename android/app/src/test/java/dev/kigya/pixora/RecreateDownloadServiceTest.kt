package dev.kigya.pixora

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.os.Build
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.util.ReflectionHelpers
import org.robolectric.annotation.Config

@RunWith(org.robolectric.RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class RecreateDownloadServiceTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private var started = 0
    private var cancelled = 0
    private val failures = mutableListOf<String>()

    @Before fun reset() {
        RecreateDownloadService.finish(context)
        started = 0
        cancelled = 0
        failures.clear()
    }

    @After fun releaseCallbacks() {
        RecreateDownloadService.finish(context)
    }

    private fun install() = RecreateDownloadService.installCallbacks(
        cancel = { cancelled++ },
        started = { started++ },
        failed = { failures.add(it) },
    )

    @Test fun foregroundTransferStartsEvenWhenNotificationPermissionIsDeniedAndCanBeCancelled() {
        Shadows.shadowOf(context.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)
        install()
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        assertEquals(android.app.Service.START_NOT_STICKY, service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1))
        assertEquals(1, started)
        assertTrue(failures.isEmpty())
        assertTrue(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        assertEquals(RecreateDownloadService.NOTIFICATION_ID,Shadows.shadowOf(service).lastForegroundNotificationId)
        val manager = Shadows.shadowOf(context.getSystemService(NotificationManager::class.java))
        val notification = manager.getNotification(RecreateDownloadService.NOTIFICATION_ID)
        assertNotNull(notification)
        assertEquals(0, notification!!.extras.getInt(Notification.EXTRA_PROGRESS))
        assertEquals(Localizer.text(context, "recreate.downloading"), notification.extras.getCharSequence(Notification.EXTRA_TITLE))
        assertTrue(notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("1.88 GB"))
        assertEquals(RecreateDownloadService.CHANNEL, notification.channelId)

        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_CANCEL), 0, 2)
        assertEquals(1, cancelled)
        val cancelling = manager.getNotification(RecreateDownloadService.NOTIFICATION_ID)!!
        assertEquals(Localizer.text(context, "cancelling"), cancelling.extras.getCharSequence(Notification.EXTRA_TEXT))
        assertEquals("", failures.joinToString())
        controller.destroy()
    }

    @Test fun progressUpdatesAreThrottledButStateChangesPublishImmediately() {
        install()
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)
        val manager = Shadows.shadowOf(context.getSystemService(NotificationManager::class.java))
        val initial = manager.getNotification(RecreateDownloadService.NOTIFICATION_ID)!!.extras.getCharSequence(Notification.EXTRA_TEXT).toString()
        RecreateDownloadService.update(context, org.json.JSONObject().put("state", "downloading").put("downloadedBytes", 500_000_000L).put("totalBytes", RecreateModelStore.TOTAL))
        assertEquals(initial, manager.getNotification(RecreateDownloadService.NOTIFICATION_ID)!!.extras.getCharSequence(Notification.EXTRA_TEXT).toString())

        org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(1_000))
        RecreateDownloadService.update(context, org.json.JSONObject().put("state", "downloading").put("downloadedBytes", 500_000_000L).put("totalBytes", RecreateModelStore.TOTAL))
        assertTrue(manager.getNotification(RecreateDownloadService.NOTIFICATION_ID)!!.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("0.50 / 1.88 GB"))

        RecreateDownloadService.update(context, org.json.JSONObject().put("state", "verifying").put("downloadedBytes", RecreateModelStore.TOTAL).put("totalBytes", RecreateModelStore.TOTAL))
        assertEquals(100, manager.getNotification(RecreateDownloadService.NOTIFICATION_ID)!!.extras.getInt(Notification.EXTRA_PROGRESS))
        RecreateDownloadService.update(context, org.json.JSONObject().put("state", "small-package").put("downloadedBytes", 23_000_000L).put("totalBytes", 100_000_000L))
        assertTrue(manager.getNotification(RecreateDownloadService.NOTIFICATION_ID)!!.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("23.00 / 100.00 MB"))
        controller.destroy()
    }

    @Test fun bindReturnsNullAndFinishedForegroundIgnoresLaterProgress() {
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        assertNull(service.onBind(null))
        val manager = Shadows.shadowOf(context.getSystemService(NotificationManager::class.java))
        context.getSystemService(NotificationManager::class.java).cancel(RecreateDownloadService.NOTIFICATION_ID)

        RecreateDownloadService.finish(context)
        RecreateDownloadService.update(context, org.json.JSONObject().put("state", "downloading").put("downloadedBytes", 1L).put("totalBytes", 10L))

        assertNull(manager.getNotification(RecreateDownloadService.NOTIFICATION_ID))
        controller.destroy()
    }

    @Test fun foregroundAdapterForwardsStartUpdateCancelAndFinish() {
        var captured: Intent? = null
        val adapterContext = object : ContextWrapper(context) {
            override fun startForegroundService(service: Intent): ComponentName? {
                captured = service
                return ComponentName(packageName, RecreateDownloadService::class.java.name)
            }
        }
        var adapterCancelled = 0
        var adapterStarted = 0
        var adapterFailed = ""
        AndroidRecreateDownloadForeground.start(adapterContext, { adapterCancelled++ }, { adapterStarted++ }, { adapterFailed = it })
        assertEquals(RecreateDownloadService.ACTION_START, captured?.action)
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        assertEquals(android.app.Service.START_NOT_STICKY, service.onStartCommand(captured, 0, 1))
        assertEquals(1, adapterStarted)
        AndroidRecreateDownloadForeground.update(adapterContext, org.json.JSONObject().put("state", "verifying").put("downloadedBytes", 4L).put("totalBytes", 4L))
        AndroidRecreateDownloadForeground.showCancelling(adapterContext)
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_CANCEL), 0, 2)
        assertEquals(1, adapterCancelled)
        assertEquals("", adapterFailed)
        AndroidRecreateDownloadForeground.finish(adapterContext)
        controller.destroy()
    }

    @Test fun foregroundStartSkipsOptionalChannelCreationWhenNotificationManagerIsMissing() {
        var captured: Intent? = null
        val noManagerContext = object : ContextWrapper(context) {
            override fun getSystemService(name: String): Any? =
                if (name == Context.NOTIFICATION_SERVICE) null else super.getSystemService(name)

            override fun startForegroundService(service: Intent): ComponentName? {
                captured = service
                return ComponentName(packageName, RecreateDownloadService::class.java.name)
            }
        }

        AndroidRecreateDownloadForeground.start(noManagerContext, {}, {}, {})

        assertEquals(RecreateDownloadService.ACTION_START, captured?.action)
        RecreateDownloadService.finish(context)
    }

    @Test fun finishContainsStopServiceFailureAfterClearingForegroundState() {
        install()
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)
        val failingContext = object : ContextWrapper(context) {
            override fun stopService(name: Intent): Boolean = throw SecurityException("service already gone")
        }

        RecreateDownloadService.finish(failingContext)
        RecreateDownloadService.update(context, org.json.JSONObject().put("state", "verifying"))

        assertTrue(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        controller.destroy()
    }

    @Test fun foregroundStartFailureReportsSafeCodeAndDoesNotStartWorker() {
        install()
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        Shadows.shadowOf(service).setThrowInStartForeground(SecurityException("permission denied"))
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)
        assertEquals(0, started)
        assertEquals(listOf("SERVICE_START_FAILED"), failures)
        assertFalse(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        controller.destroy()
    }

    @Test fun foregroundStartFailureIsContainedWhenNoFailureCallbackWasRegistered() {
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        Shadows.shadowOf(service).setThrowInStartForeground(SecurityException("notification permission denied"))

        val result = service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)

        assertEquals(android.app.Service.START_NOT_STICKY, result)
        assertFalse(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        assertTrue(failures.isEmpty())
        controller.destroy()
    }

    @Test fun timeoutWithoutARegisteredCancelCallbackStillStopsTheForegroundService() {
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)

        service.onTimeout(2, 0)

        assertFalse(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        assertEquals(0, started)
        assertTrue(failures.isEmpty())
        controller.destroy()
    }

    @Test fun timeoutCancelsTransferAndUnknownCommandStopsWithoutStartingIt() {
        install()
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction("unexpected"), 0, 1)
        assertEquals(0, started)
        assertEquals(0, cancelled)
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 2)
        assertEquals(1, started)
        service.onTimeout(3, 0)
        assertEquals(1, cancelled)
        assertFalse(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        controller.destroy()
    }

    @Test fun destroyWhileForegroundCancelsTransferAndCancellationCallbackFailuresAreContained() {
        var callbackCount = 0
        RecreateDownloadService.installCallbacks(
            cancel = { callbackCount++; throw IllegalStateException("worker already stopped") },
            started = { started++ },
            failed = { failures.add(it) },
        )
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)

        controller.destroy()

        assertEquals(1, callbackCount)
        assertEquals(1, started)
        assertTrue(failures.isEmpty())
    }

    @Test fun timeoutContainsCancellationCallbackFailureAndClearsForegroundState() {
        RecreateDownloadService.installCallbacks(
            cancel = { throw IllegalStateException("worker already stopped") },
            started = { started++ },
            failed = { failures.add(it) },
        )
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)

        service.onTimeout(2, 0)
        RecreateDownloadService.finish(context)

        assertEquals(1, started)
        assertTrue(failures.isEmpty())
        assertFalse(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        controller.destroy()
    }

    @Test fun preOreoChannelGuardSkipsChannelCreationWithoutChangingRuntimeSdk() {
        val originalSdk = Build.VERSION.SDK_INT
        try {
            ReflectionHelpers.setStaticField(Build.VERSION::class.java, "SDK_INT", 25)
            val companion = RecreateDownloadService::class.java.getField("Companion").get(null)
            val createChannel = companion.javaClass.getDeclaredMethod(
                "access\$createChannel", companion.javaClass, android.content.Context::class.java,
            )
                .apply { isAccessible = true }
            createChannel.invoke(null, companion, context)
        } finally {
            ReflectionHelpers.setStaticField(Build.VERSION::class.java, "SDK_INT", originalSdk)
        }

        assertNull(context.getSystemService(NotificationManager::class.java)
            .getNotificationChannel(RecreateDownloadService.CHANNEL))
    }

    @Test fun updateDoesNothingAfterForegroundIsStoppedEvenWhenNotificationManagerIsUnavailable() {
        install()
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)
        val noNotifications = object : ContextWrapper(context) {
            override fun getSystemService(name: String): Any? =
                if (name == Context.NOTIFICATION_SERVICE || name == NotificationManager::class.java.name) null
                else super.getSystemService(name)
        }

        RecreateDownloadService.update(noNotifications, org.json.JSONObject().put("state", "verifying"))

        assertTrue(failures.isEmpty())
        RecreateDownloadService.finish(context)
        controller.destroy()
    }

    @Test fun permissionRevocationDuringProgressNotificationDoesNotAbortTheDownloadWorker() {
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)
        val deniedManager = org.mockito.Mockito.mock(NotificationManager::class.java)
        org.mockito.Mockito.doThrow(SecurityException("notifications disabled"))
            .`when`(deniedManager).notify(
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.any(Notification::class.java),
            )
        val deniedContext = object : ContextWrapper(context) {
            override fun getSystemService(name: String): Any? =
                if (name == Context.NOTIFICATION_SERVICE) deniedManager else super.getSystemService(name)
        }

        RecreateDownloadService.update(
            deniedContext,
            org.json.JSONObject().put("state", "verifying").put("downloadedBytes", 10L).put("totalBytes", 10L),
        )

        org.mockito.Mockito.verify(deniedManager).notify(
            org.mockito.ArgumentMatchers.anyInt(),
            org.mockito.ArgumentMatchers.any(Notification::class.java),
        )
        assertTrue(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        controller.destroy()
    }

    @Test fun cancelCommandContainsWorkerCallbackFailure() {
        RecreateDownloadService.installCallbacks(
            cancel = { throw IllegalStateException("worker already stopped") },
            started = { started++ },
            failed = { failures.add(it) },
        )
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 1)

        val result = service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_CANCEL), 0, 2)

        assertEquals(android.app.Service.START_NOT_STICKY, result)
        assertEquals(1, started)
        assertTrue(failures.isEmpty())
        assertTrue(Shadows.shadowOf(service).isLastForegroundNotificationAttached)
        controller.destroy()
    }

    @Test fun nullCommandAndUnregisteredCallbacksDoNotStartOrCancelWork() {
        val controller = Robolectric.buildService(RecreateDownloadService::class.java).create()
        val service = controller.get()
        assertEquals(android.app.Service.START_NOT_STICKY, service.onStartCommand(null, 0, 1))
        assertNull(service.onBind(null))
        assertEquals(android.app.Service.START_NOT_STICKY, service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_CANCEL), 0, 2))
        assertEquals(android.app.Service.START_NOT_STICKY, service.onStartCommand(Intent().setAction(RecreateDownloadService.ACTION_START), 0, 3))
        controller.destroy()
        assertTrue(failures.isEmpty())
    }
}
