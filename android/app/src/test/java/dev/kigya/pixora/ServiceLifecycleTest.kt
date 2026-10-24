package dev.kigya.pixora

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.os.Looper
import org.junit.Test
import org.junit.Before
import org.junit.After
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import java.time.Duration
import java.util.concurrent.AbstractExecutorService
import java.util.concurrent.TimeUnit

@RunWith(org.robolectric.RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class ServiceLifecycleTest {
    open class DirectExecutor:AbstractExecutorService() {
        var rejected=false;private var closed=false
        open override fun execute(command:Runnable){if(rejected)throw java.util.concurrent.RejectedExecutionException();command.run()}
        override fun shutdown(){closed=true}
        override fun shutdownNow():MutableList<Runnable>{closed=true;return mutableListOf()}
        override fun isShutdown()=closed
        override fun isTerminated()=closed
        override fun awaitTermination(timeout:Long,unit:TimeUnit)=closed
    }
    class ManualExecutor:DirectExecutor() {
        lateinit var task:Runnable
        override fun execute(command:Runnable){task=command}
    }
    private val ctx get()=RuntimeEnvironment.getApplication()
    private var cancelled=0
    @Before fun setup() {
        cancelled=0
        for(name in listOf("context","journal"))SessionStore::class.java.getDeclaredField(name).apply{isAccessible=true}.set(SessionStore,null)
        SessionStore.listeners.clear();SessionStore.workerAlive=false;SessionStore.serviceAlive=false
        ctx.filesDir.deleteRecursively();ctx.filesDir.mkdirs();ctx.cacheDir.deleteRecursively();ctx.cacheDir.mkdirs()
        SessionStore.init(ctx)
    }
    @After fun cleanup(){SessionStore.workerAlive=false;SessionStore.serviceAlive=false;SessionStore.listeners.clear()}
    private fun create():org.robolectric.android.controller.ServiceController<ProcessingService> {
        val controller=Robolectric.buildService(ProcessingService::class.java).create()
        controller.get().apply {executor.shutdown();executor=DirectExecutor();control=object:JobControl{override fun reset(){};override fun cancel(){cancelled++}}}
        return controller
    }
    private fun stage(state:String,phase:String="upscaling",progress:Double=-1.0){SessionStore.update{it.put("jobId","job").put("state",state).put("phase",phase).put("progress",progress)}}
    @Test fun defaultWorkerProcessesPreCancelledSessionAndPublishesTerminalCancellation() {
        val source=java.io.File(ctx.filesDir,"sessions/default-worker/source").apply { parentFile!!.mkdirs(); writeText("source") }
        SessionStore.replace(org.json.JSONObject().put("id","default-worker").put("sourcePath",source.path))
        stage("CANCELLING")
        val controller=create();val service=controller.get();val worker=ManualExecutor();service.executor=worker

        service.onStartCommand(Intent().setAction("PROCESS"),0,1)
        worker.task.run()
        Shadows.shadowOf(Looper.getMainLooper()).idle()

        assertEquals("CANCELLED",SessionStore.snapshot().getString("state"))
        assertEquals("",SessionStore.snapshot().getString("error"))
        assertFalse(SessionStore.workerAlive)
        assertTrue(Shadows.shadowOf(service).isForegroundStopped)
        controller.destroy()
    }
    @Test fun foregroundProgressTitlesThrottlingAndRelease() {
        val controller=create();val service=controller.get()
        assertNull(service.onBind(null));stage("PREPARING")
        service.runWork={_,notice,timeout ->
            assertFalse(timeout())
            val manager=Shadows.shadowOf(ctx.getSystemService(NotificationManager::class.java))
            for(state in listOf("RUNNING","FINALIZING","CANCELLING","FAILED","SUCCEEDED")) {
                stage(state,if(state=="RUNNING")"loading_model" else "unknown",50.0)
                notice(true);assertNotNull(manager.getNotification(1001))
                notice(false)
                org.robolectric.shadows.ShadowSystemClock.advanceBy(Duration.ofMillis(1001));notice(false)
            }
        }
        assertEquals(android.app.Service.START_NOT_STICKY,service.onStartCommand(Intent().setAction("PROCESS"),0,1))
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertFalse(SessionStore.workerAlive);assertTrue(Shadows.shadowOf(service).isForegroundStopped)
        val ready=Shadows.shadowOf(ctx.getSystemService(NotificationManager::class.java)).getNotification(1002)
        assertEquals(Localizer.text(ctx,"imageReady"),ready.extras.getCharSequence(Notification.EXTRA_TITLE))
        controller.destroy();assertFalse(SessionStore.serviceAlive)
    }
    @Test fun ignoredCommandsCancelIdentityAndDeadline() {
        val controller=create();val service=controller.get()
        service.onStartCommand(null,0,1);service.onStartCommand(Intent().setAction("OTHER"),0,2)
        stage("RUNNING");SessionStore.workerAlive=true
        service.onStartCommand(Intent().setAction("PROCESS"),0,3)
        service.onStartCommand(Intent().setAction("CANCEL").putExtra("jobId","wrong"),0,4);assertEquals(0,cancelled)
        service.onStartCommand(Intent().setAction("CANCEL").putExtra("jobId","job"),0,5);assertEquals(1,cancelled)
        assertEquals("CANCELLING",SessionStore.snapshot().getString("state"))
        stage("READY");SessionStore.workerAlive=false
        service.onStartCommand(Intent().setAction("CANCEL").putExtra("jobId","job"),0,6);assertEquals(2,cancelled)
        assertEquals("READY",SessionStore.snapshot().getString("state"))
        service.onTimeout(7,0);assertEquals(3,cancelled)
        controller.destroy()
        val deadlineController=create();val deadlineService=deadlineController.get();stage("PREPARING")
        deadlineService.runWork={_,_,_->Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(30));assertEquals("CANCELLING",SessionStore.snapshot().getString("state"))}
        deadlineService.onStartCommand(Intent().setAction("PROCESS"),0,8);Shadows.shadowOf(Looper.getMainLooper()).idle();deadlineController.destroy()
    }
    @Test fun recreateRunsPastEnhancementDeadlineThenCancelsAtItsOwnLimit() {
        assertEquals(30L*60*1000,ProcessingService.timeoutFor("enhance"))
        assertEquals(30L*60*1000,ProcessingService.timeoutFor(""))
        assertEquals(45L*60*1000,ProcessingService.timeoutFor("recreate"))
        assertEquals(30L*1000,ProcessingService.WAKE_LOCK_GRACE_MS)
        assertEquals("TIME_LIMIT",timeoutErrorCode("enhance"))
        assertEquals("RECREATE_TIME_LIMIT",timeoutErrorCode("recreate"))

        val controller=create();val service=controller.get();stage("PREPARING")
        SessionStore.update{it.put("processingKind","recreate")}
        service.executor=ManualExecutor();service.onStartCommand(Intent().setAction("PROCESS"),0,9)
        val wake=ProcessingService::class.java.getDeclaredField("wake").apply{isAccessible=true}.get(service) as android.os.PowerManager.WakeLock

        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(30))
        val expiredAtThirtyMinutes=ProcessingService::class.java.getDeclaredField("timeLimit").apply{isAccessible=true}.getBoolean(service)
        assertFalse(expiredAtThirtyMinutes)
        assertEquals("PREPARING",SessionStore.snapshot().getString("state"))
        assertEquals(0,cancelled)
        assertTrue(wake.isHeld)

        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(15))
        val expiredAtFortyFiveMinutes=ProcessingService::class.java.getDeclaredField("timeLimit").apply{isAccessible=true}.getBoolean(service)
        assertTrue(expiredAtFortyFiveMinutes)
        assertEquals("CANCELLING",SessionStore.snapshot().getString("state"))
        assertEquals(1,cancelled)
        assertTrue(wake.isHeld)

        controller.destroy()
        assertFalse(wake.isHeld)
    }
    @Test @Config(sdk=[29]) fun olderForegroundTypeAndStartupFailures() {
        for(error in listOf(SecurityException("denied"),IllegalStateException("failed"))) {
            val controller=create();val service=controller.get();stage("PREPARING")
            Shadows.shadowOf(service).setThrowInStartForeground(error)
            service.onStartCommand(Intent().setAction("PROCESS"),0,1)
            assertEquals("SERVICE_START_FAILED",SessionStore.snapshot().getString("error"));assertFalse(SessionStore.workerAlive)
            controller.destroy()
        }
        val controller=create();val service=controller.get();stage("PREPARING");(service.executor as DirectExecutor).rejected=true
        service.onStartCommand(Intent().setAction("PROCESS"),0,2)
        assertEquals("FAILED",SessionStore.snapshot().getString("state"));controller.destroy()
    }
    @org.robolectric.annotation.Implements(NotificationManager::class)
    class RejectingNotifications:org.robolectric.shadows.ShadowNotificationManager() {
        companion object{var refuse=false}
        @org.robolectric.annotation.Implementation @Suppress("UNUSED_PARAMETER")
        protected override fun notify(id:Int,notification:Notification){if(refuse)throw SecurityException("controlled notification refusal");super.notify(id,notification)}
    }
    @Test @Config(shadows=[RejectingNotifications::class]) fun notificationRefusalDoesNotStopTheTaskOrLeakItsWakeLock() {
        val controller=create();val service=controller.get();stage("PREPARING")
        val worker=ManualExecutor();service.executor=worker
        var noticeAfterFinish:((Boolean)->Unit)?=null
        service.runWork={_,notice,_->RejectingNotifications.refuse=true;noticeAfterFinish=notice;notice(true);stage("SUCCEEDED")}
        assertNotNull(service.control);assertNotNull(service.runWork)
        service.onStartCommand(Intent().setAction("PROCESS"),0,1)
        val lock=ProcessingService::class.java.getDeclaredField("wake").apply{isAccessible=true}.get(service) as android.os.PowerManager.WakeLock
        lock.release();worker.task.run()
        Shadows.shadowOf(Looper.getMainLooper()).idle();noticeAfterFinish!!(true)
        assertEquals("SUCCEEDED",SessionStore.snapshot().getString("state"));assertFalse(SessionStore.workerAlive);controller.destroy()
        RejectingNotifications.refuse=false
        val interrupted=create();val current=interrupted.get();current.executor=ManualExecutor();stage("PREPARING")
        current.runWork={_,_,_->}
        current.onStartCommand(Intent().setAction("PROCESS"),0,2)
        val pendingLock=ProcessingService::class.java.getDeclaredField("wake").apply{isAccessible=true}.get(current) as android.os.PowerManager.WakeLock
        pendingLock.release();interrupted.destroy();(current.executor as ManualExecutor).task.run();Shadows.shadowOf(Looper.getMainLooper()).idle()
        val killed=create();val active=killed.get();active.executor=ManualExecutor();active.runWork={_,_,_->};stage("PREPARING");active.onStartCommand(Intent().setAction("PROCESS"),0,3)
        val held=ProcessingService::class.java.getDeclaredField("wake").apply{isAccessible=true}.get(active) as android.os.PowerManager.WakeLock
        assertTrue(held.isHeld);killed.destroy();assertFalse(held.isHeld)
    }

}
