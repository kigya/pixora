package dev.kigya.pixora

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Looper
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import org.json.JSONObject
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.util.ReflectionHelpers
import com.google.android.play.core.review.ReviewInfo
import com.google.android.play.core.review.ReviewManager
import com.google.android.play.core.review.ReviewManagerFactory
import com.google.android.gms.tasks.Tasks
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockStatic
import org.mockito.Mockito.`when`
import org.mockito.Mockito.mockStatic
import org.mockito.stubbing.Answer
import org.mockito.Answers
import java.io.File
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@Suppress("DEPRECATION")
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ModuleUnitTest {
    private lateinit var ctx:Context
    private lateinit var react:BoundaryContext
    private lateinit var module:UpscaleModule
    private var valid=true
    private var modelFailure:Throwable?=null
    private var resets=0
    private var cancels=0
    class BoundaryContext(context:Context):BridgeReactContext(context) {
        var rejectService=false;var rejectActivity=false;var active=false
        var rejectSettingsWrite=false
        override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
            val preferences=super.getSharedPreferences(name,mode)
            if(name!="settings" || !rejectSettingsWrite)return preferences
            return object:android.content.SharedPreferences by preferences {
                override fun edit()=rejectingPreferencesEditor()
            }
        }
        override fun hasActiveReactInstance()=active
        override fun startForegroundService(intent:Intent):android.content.ComponentName? {
            if(rejectService)throw SecurityException("controlled foreground rejection")
            return super.startForegroundService(intent)
        }
        override fun startActivity(intent:Intent) {
            if(rejectActivity)throw android.content.ActivityNotFoundException()
            super.startActivity(intent)
        }
    }
    class RejectingActivity:Activity() {
        override fun startActivityForResult(intent:Intent,requestCode:Int){throw android.content.ActivityNotFoundException()}
        override fun startActivity(intent:Intent){throw android.content.ActivityNotFoundException()}
    }
    class PermissionActivity:Activity(),PermissionAwareActivity {
        var callback:PermissionListener?=null
        override fun requestPermissions(permissions:Array<String>,requestCode:Int,listener:PermissionListener?){callback=listener}
    }
    private class Reply {
        val latch=CountDownLatch(1);var value:Any?=null;var error:String?=null
        val promise=Proxy.newProxyInstance(Promise::class.java.classLoader,arrayOf(Promise::class.java)){_,method,args ->
            if(method.name=="resolve"){value=args?.get(0);latch.countDown()}
            if(method.name=="reject"){error=args?.get(0)?.toString();latch.countDown()};null
        } as Promise
        fun await():Any? {
            val deadline=System.currentTimeMillis()+10000
            while(latch.count>0 && System.currentTimeMillis()<deadline){Shadows.shadowOf(Looper.getMainLooper()).idle();Thread.sleep(5)}
            assertEquals("Native promise did not settle",0,latch.count)
            error?.let{throw AppFailure(it)}
            return value
        }
    }
    @Before fun setup() {
        ctx=RuntimeEnvironment.getApplication();resetStore()
        ctx.filesDir.deleteRecursively();ctx.filesDir.mkdirs();ctx.cacheDir.deleteRecursively();ctx.cacheDir.mkdirs();ctx.getSharedPreferences("settings",0).edit().clear().commit()
        org.robolectric.shadows.ShadowStatFs.registerStats(ctx.filesDir.path,1000000,1000000,1000000)
        memory(4L*1024*1024*1024)
        ReflectionHelpers.setStaticField(Build::class.java,"SUPPORTED_ABIS",arrayOf("arm64-v8a"))
        react=BoundaryContext(ctx)
        module=UpscaleModule(react,javaBridge,ModelVerifier{modelFailure?.let{throw it};valid},object:JobControl {override fun reset(){resets++};override fun cancel(){cancels++}},feedback=FeedbackClient("https://script.google.com/macros/s/test/exec"))
    }
    private fun memory(bytes:Long){Shadows.shadowOf(ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).setMemoryInfo(ActivityManager.MemoryInfo().apply{totalMem=bytes})}
    private fun resetStore(){for(name in listOf("context","journal"))SessionStore::class.java.getDeclaredField(name).apply{isAccessible=true}.set(SessionStore,null);SessionStore.listeners.clear();SessionStore.workerAlive=false;SessionStore.serviceAlive=false;WindowLayout.listeners.clear()}
    @After fun cleanup(){module.invalidate();Shadows.shadowOf(Looper.getMainLooper()).idle();resetStore()}
    private fun call(action:(Promise)->Unit):Any?=Reply().also{action(it.promise)}.await()
    private fun fails(code:String,action:(Promise)->Unit){try{call(action);fail("Expected $code")}catch(error:AppFailure){assertEquals(code,error.code)}}
    private fun image():String {
        val b=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888)
        val file=File(ctx.cacheDir,"input.png");ImageFiles.write(b,file,"png");b.recycle()
        val image=ImageFiles.import(ctx,Uri.fromFile(file));SessionStore.replace(image)
        return image.getString("id")
    }
    @Test fun successfulFeedbackPreservesRatingAndReplyAddressAcrossTheBridge() {
        val id="4fe7fb7f-344a-4673-b1d1-11ddb378b891"
        val output=java.io.ByteArrayOutputStream()
        var disconnected=false
        val connection=object:java.net.HttpURLConnection(java.net.URI("https://script.google.com/macros/s/test/exec").toURL()) {
            override fun connect() {}
            override fun usingProxy()=false
            override fun disconnect(){disconnected=true}
            override fun getResponseCode()=200
            override fun getOutputStream()=output
            override fun getInputStream()=java.io.ByteArrayInputStream("{\"ok\":true,\"id\":\"$id\"}".toByteArray())
        }
        module.invalidate()
        module=UpscaleModule(react,feedback=FeedbackClient("https://script.google.com/macros/s/test/exec"){connection})
        assertEquals(true,call(module::getFeedbackStatus))
        assertEquals(true,call{module.sendFeedback("reply@example.com","Test question",4.0,id,it)})
        val payload=JSONObject(output.toString("UTF-8"));assertEquals("reply@example.com",payload.getString("email"));assertEquals(4,payload.getInt("rating"));assertEquals("Test question",payload.getString("message"));assertTrue(disconnected)
    }
    @Test fun slowFeedbackDoesNotBlockCancellationOrSnapshot() {
        val executor=UpscaleModule::class.java.getDeclaredField("feedbackIo").apply{isAccessible=true}.get(module) as java.util.concurrent.ExecutorService
        val entered=CountDownLatch(1);val release=CountDownLatch(1)
        executor.execute{entered.countDown();release.await(10,TimeUnit.SECONDS)}
        assertTrue(entered.await(5,TimeUnit.SECONDS))
        val pending=Reply();module.sendFeedback("bad","hello",1.0,"bad",pending.promise)
        try {
            image();SessionStore.update{it.put("jobId","running").put("state","RUNNING")}
            val snapshot=call{module.cancelJob("running",it)} as ReadableMap
            assertEquals("CANCELLING",snapshot.getString("state"));assertEquals(1,cancels)
            assertNotNull(call(module::getCurrentSession));assertEquals(1L,pending.latch.count)
        }finally{release.countDown()}
        try{pending.await();fail("Invalid feedback must not be sent")}catch(e:AppFailure){assertTrue(e.code in listOf("FEEDBACK_INVALID","FEEDBACK_UNAVAILABLE"))}
        SessionStore.update{it.put("state","CANCELLED")}
    }
    @Test fun retentionNotificationsAndReviewDoNotGateStoreAccess() {
        for(limit in RetentionPolicy.limits)assertEquals(limit.toDouble(),(call{module.setCacheLimit(limit.toDouble(),it)} as ReadableMap).getDouble("cacheLimitMiB"),0.0)
        for(limit in listOf(2.0,10.5))fails("INFERENCE_FAILED"){module.setCacheLimit(limit,it)}
        assertFalse((call(module::getSettings) as ReadableMap).getBoolean("notificationIntroSeen"));call(module::markNotificationIntroSeen);assertTrue((call(module::getSettings) as ReadableMap).getBoolean("notificationIntroSeen"));
        repeat(4){call(module::markNotificationHint)};assertEquals(3,ctx.getSharedPreferences("settings",0).getInt("notificationHintCount",0))
        val configured=FeedbackClient("https://script.google.com/macros/s/test/exec").configured();assertEquals(configured,call(module::getFeedbackStatus));fails("FEEDBACK_INVALID"){module.sendFeedback("a@b.com","hello",1.5,"bad",it)};fails(if(configured)"FEEDBACK_INVALID" else "FEEDBACK_UNAVAILABLE"){module.sendFeedback("bad","hello",1.0,"bad",it)}
        val prefs=ctx.getSharedPreferences("settings",0)
        assertEquals(false,call{module.claimReviewPrompt("wrong",it)})
        image();SessionStore.update{it.put("jobId","review").put("state","READY")};assertEquals(false,call{module.claimReviewPrompt("review",it)})
        SessionStore.update{it.put("state","SUCCEEDED")};assertEquals(false,call{module.claimReviewPrompt("review",it)})
        prefs.edit().putInt("savedJobs",3).putInt("reviewPrompts",2).commit();assertEquals(false,call{module.claimReviewPrompt("review",it)})
        prefs.edit().putInt("reviewPrompts",0).putLong("reviewShownAt",System.currentTimeMillis()).commit();assertEquals(false,call{module.claimReviewPrompt("review",it)})
        prefs.edit().putLong("reviewShownAt",0).commit()
        react.rejectSettingsWrite=true
        assertEquals(false,call{module.claimReviewPrompt("review",it)})
        assertEquals(0,prefs.getInt("reviewPrompts",0))
        react.rejectSettingsWrite=false
        assertEquals(true,call{module.claimReviewPrompt("review",it)})
        assertEquals(false,call{module.claimReviewPrompt("review",it)})
    }
    @Test fun capabilitiesSettingsAndValidation() {
        assertEquals("NativeUpscale",module.name)
        assertTrue((call(module::getCapabilities) as ReadableMap).getBoolean("supported"));valid=false
        assertFalse((call(module::getCapabilities) as ReadableMap).getBoolean("modelValid"));valid=true
        ReflectionHelpers.setStaticField(Build::class.java,"SUPPORTED_ABIS",arrayOf("x86"));assertFalse((call(module::getCapabilities) as ReadableMap).getBoolean("supported"))
        ReflectionHelpers.setStaticField(Build::class.java,"SUPPORTED_ABIS",arrayOf("arm64-v8a"));memory(1L*1024*1024*1024);assertFalse((call(module::getCapabilities) as ReadableMap).getBoolean("supported"))
        call(module::getWindowLayout);call(module::getLegalText);call(module::getSettings);call(module::getCurrentSession)
        for(theme in listOf("light","dark","system"))call{module.updateSettings("en","png",theme,it)}
        assertEquals("pt-BR",(call{module.updateSettings("pt","jpeg","dark",it)} as ReadableMap).getString("language"))
        assertEquals("system",(call{module.updateSettings("system","png","light",it)} as ReadableMap).getString("language"))
        fails("INFERENCE_FAILED"){module.updateSettings("xx","png","light",it)};fails("INFERENCE_FAILED"){module.updateSettings("en","gif","light",it)};fails("INFERENCE_FAILED"){module.updateSettings("en","png","xx",it)}
        fails("SOURCE_UNAVAILABLE"){module.inspectSelection("none",it)};fails("SOURCE_UNAVAILABLE"){module.prepareSelection("none",it)}
        fails("SOURCE_UNAVAILABLE"){module.dismissNotificationHint("wrong",it)};call{module.dismissNotificationHint("",it)}
        call(module::clearTemporaryFiles);call{module.cancelJob("",it)};call(module::discardSession)
    }
    @Test fun startGuardsAndFixedModeLifecycle() {
        val id=image()
        fails("SOURCE_UNAVAILABLE"){module.inspectSelection("bad",it)};call{module.inspectSelection(id,it)};call{module.prepareSelection(id,it)}
        fails("INFERENCE_FAILED"){module.startJobWithMode(id,2.0,true,"other",it)}
        fails("INFERENCE_FAILED"){module.startJobWithProfile(id,2.0,"other","quality",true,it)}
        fails("INFERENCE_FAILED"){module.startJobWithProfile(id,2.0,"standard","other",true,it)}
        fails("INFERENCE_FAILED"){module.startJobWithProfile(id,2.0,"pixel","fast",true,it)}
        for(scale in listOf(1.0,3.0))fails("INFERENCE_FAILED"){module.startJob(id,scale,true,it)}
        valid=false;fails("MODEL_INVALID"){module.startJob(id,2.0,true,it)};valid=true
        memory(1L*1024*1024*1024);fails("DEVICE_UNSUPPORTED"){module.startJob(id,2.0,true,it)};memory(4L*1024*1024*1024)
        org.robolectric.shadows.ShadowStatFs.registerStats(ctx.filesDir.path,1,0,0);fails("LOW_STORAGE"){module.startJob(id,2.0,true,it)}
        org.robolectric.shadows.ShadowStatFs.registerStats(ctx.filesDir.path,1000000,1000000,1000000)
        SessionStore.update{it.getJSONObject("image").put("needsPreparation",true)};fails("PREPARATION_REQUIRED"){module.startJob(id,2.0,false,it)}
        SessionStore.update{it.getJSONObject("image").put("needsPreparation",false)};fails("SERVICE_START_FAILED"){module.startJob(id,2.0,true,it)}
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get();react.onHostResume(activity)
        SessionStore.update{it.getJSONObject("image").put("needsPreparation",true)}
        for(mode in listOf("quality","fast","standard","lite","natural","details","balanced","sharp","art","pixel")) {
            SessionStore.update{it.put("state","READY")}
            val result=call{if(mode in ProcessingProfiles.presets)module.startJobWithProfile(id,4.0,mode,if(mode=="lite")"fast" else "quality",true,it) else module.startJobWithMode(id,4.0,true,mode,it)} as ReadableMap
            assertEquals(mode,result.getString("mode"));assertEquals("PREPARING",result.getString("state"));assertTrue(resets>0)
            fails("BUSY"){module.startJob(id,2.0,true,it)};fails("BUSY"){module.clearTemporaryFiles(it)}
            call{module.cancelJob("different",it)};assertEquals("PREPARING",SessionStore.snapshot().getString("state"))
            call{module.cancelJob(result.getString("jobId")!!,it)};assertEquals("CANCELLING",SessionStore.snapshot().getString("state"));assertTrue(cancels>0)
        }
        SessionStore.update{it.put("state","READY")};activity.finish();fails("SERVICE_START_FAILED"){module.startJob(id,2.0,true,it)}
        val destroyed=Robolectric.buildActivity(Activity::class.java).setup().destroy().get();react.onHostResume(destroyed)
        assertTrue(destroyed.isDestroyed);fails("SERVICE_START_FAILED"){module.startJob(id,2.0,true,it)}
    }
    @Test fun notificationPermissionIsOptionalAndHasNoDuplicatePrompt() {
        val prefs=ctx.getSharedPreferences("settings",0)
        call(module::getNotificationStatus);call(module::openNotificationSettings)
        assertEquals(false,call(module::requestNotifications))
        val activity=Robolectric.buildActivity(PermissionActivity::class.java).setup().get();react.onHostResume(activity)
        for(grants in listOf(intArrayOf(),intArrayOf(-1),intArrayOf(0))) {
            prefs.edit().putBoolean("notificationAsked",false).commit();val reply=Reply();module.requestNotifications(reply.promise);Shadows.shadowOf(Looper.getMainLooper()).idle()
            val callback=activity.callback!!;assertFalse(callback.onRequestPermissionsResult(0,arrayOf(Manifest.permission.POST_NOTIFICATIONS),grants))
            assertTrue(callback.onRequestPermissionsResult(UpscaleModule.NOTIFY,arrayOf(Manifest.permission.POST_NOTIFICATIONS),grants));assertEquals(grants.isNotEmpty() && grants[0]==0,reply.await())
            assertEquals(false,call(module::requestNotifications));assertTrue(callback.onRequestPermissionsResult(UpscaleModule.NOTIFY,arrayOf(Manifest.permission.POST_NOTIFICATIONS),grants))
        }
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        assertEquals(true,call(module::requestNotifications))
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        prefs.edit().putBoolean("notificationAsked",false).commit();val pending=Reply();module.requestNotifications(pending.promise);Shadows.shadowOf(Looper.getMainLooper()).idle()
        prefs.edit().putBoolean("notificationAsked",false).commit();assertEquals(false,call(module::requestNotifications));module.invalidate();assertEquals(false,pending.await())
    }
    @Test fun reviewRequestHandlesNoActivityAndEachPlayTaskOutcome() {
        assertEquals(false,call(module::requestReview))
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get();react.onHostResume(activity)
        val manager=mock(ReviewManager::class.java)
        val info=mock(ReviewInfo::class.java)
        mockStatic(ReviewManagerFactory::class.java,Answer<Any?>{manager}).use {
            `when`(manager.requestReviewFlow()).thenReturn(Tasks.forResult(info))
            `when`(manager.launchReviewFlow(activity,info)).thenReturn(Tasks.forResult<Void>(null))
            assertEquals(true,call(module::requestReview))
            org.mockito.Mockito.verify(manager).requestReviewFlow()
            org.mockito.Mockito.verify(manager).launchReviewFlow(activity,info)

            `when`(manager.requestReviewFlow()).thenReturn(Tasks.forException(java.io.IOException("controlled review request failure")))
            assertEquals(false,call(module::requestReview))

            `when`(manager.requestReviewFlow()).thenReturn(Tasks.forResult(info))
            `when`(manager.launchReviewFlow(activity,info)).thenReturn(Tasks.forException(java.io.IOException("controlled review launch failure")))
            assertEquals(false,call(module::requestReview))
        }
        mockStatic(ReviewManagerFactory::class.java,Answer<Any?>{throw IllegalStateException("Play unavailable")}).use {
            assertEquals(false,call(module::requestReview))
        }
    }
    @Test @Config(sdk=[29]) fun oldAndroidNeedsNoNotificationPermission(){
        assertEquals(true,call(module::requestNotifications))
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get();react.onHostResume(activity)
        val pending=Reply();module.pickImage(pending.promise);Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertEquals(Intent.ACTION_OPEN_DOCUMENT,Shadows.shadowOf(activity).nextStartedActivity.action)
        react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_CANCELED,null);assertNull(pending.await())
    }
    @Test fun pickerCancellationMissingActivityAndBusy() {
        fails("SOURCE_UNAVAILABLE"){module.pickImage(it)}
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get();react.onHostResume(activity)
        val reply=Reply();module.pickImage(reply.promise);Shadows.shadowOf(Looper.getMainLooper()).idle();fails("BUSY"){module.pickImage(it)}
        react.onActivityResult(activity,0,Activity.RESULT_CANCELED,null);react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_CANCELED,null);assertNull(reply.await())
        react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_OK,Intent())
        val missingUri=Reply();module.pickImage(missingUri.promise);Shadows.shadowOf(Looper.getMainLooper()).idle();react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_OK,Intent());assertNull(missingUri.await())
        val accepted=Reply();module.pickImage(accepted.promise);Shadows.shadowOf(Looper.getMainLooper()).idle()
        val b=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888);val file=File(ctx.cacheDir,"picked.png");ImageFiles.write(b,file,"png");b.recycle()
        react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_OK,Intent().setData(Uri.fromFile(file)))
        assertFalse((accepted.await() as ReadableMap).hasKey("sourcePath"))
        val cancelled=Reply();module.pickImage(cancelled.promise);Shadows.shadowOf(Looper.getMainLooper()).idle();react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_OK,null);assertNull(cancelled.await())
        val abandoned=Reply();module.pickImage(abandoned.promise);Shadows.shadowOf(Looper.getMainLooper()).idle();module.invalidate();try{abandoned.await();fail()}catch(e:AppFailure){assertEquals("SOURCE_UNAVAILABLE",e.code)}
    }
    @Test fun exportContractsAndOptionalSystemActions() {
        val id=image()
        assertFalse((call{module.inspectSelection(id,it)} as ReadableMap).hasKey("workPath"))
        call{module.prepareSelection(id,it)}
        val result=File(ctx.cacheDir,"result.png");val bitmap=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888)
        ImageFiles.write(bitmap,result,"png");bitmap.recycle()
        val gallery=MediaExportTest.Gallery().apply {output=File(ctx.cacheDir,"gallery");attachInfo(ctx,android.content.pm.ProviderInfo().apply{authority="media";exported=true})}
        org.robolectric.shadows.ShadowContentResolver.registerProviderInternal("media",gallery)
        SessionStore.update{it.put("state","READY").put("jobId","job")}
        fails("EXPORT_FAILED"){module.exportResult("job","png",it)}
        SessionStore.update{it.put("state","SUCCEEDED").put("jobId","job").put("resultPath",result.path).put("resultWidth",8).put("resultHeight",8)}
        fails("EXPORT_FAILED"){module.exportResult("wrong","png",it)}
        val exported=call{module.exportResult("job","png",it)} as ReadableMap
        gallery.collision=true
        assertEquals(exported.getString("id"),(call{module.exportResult("job","png",it)} as ReadableMap).getString("id"))
        val jpeg=call{module.exportResult("job","jpeg",it)} as ReadableMap
        call{module.openExport(jpeg.getString("id")!!,it)}
        assertEquals(2,SessionStore.snapshot().getJSONArray("exports").length())
        call{module.openExport(exported.getString("id")!!,it)}
        fails("EXPORT_FAILED"){module.openExport("missing",it)}
        fails("EXPORT_FAILED"){module.exportResult("job","bad",it)}
        assertEquals("EXPORT_FAILED",SessionStore.snapshot().getString("exportState"))
        fails("SHARE_FAILED"){module.shareResult("job","bad",it)}
        fails("SHARE_FAILED"){module.shareResult("job","png",it)}
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get();react.onHostResume(activity)
        assertEquals(true,call{module.shareResult("job","jpeg",it)});assertEquals(true,call{module.shareResult("job","webp",it)})
        gallery.collision=true;call(module::getCurrentSession)
        assertEquals(1,SessionStore.snapshot().getJSONArray("exports").length())
        gallery.nullQuery=true;call(module::getCurrentSession)
        assertEquals(0,SessionStore.snapshot().getJSONArray("exports").length())
        assertEquals(true,call(module::openNotificationSettings));call(module::getNotificationStatus)
        val manager=ctx.getSystemService(android.app.NotificationManager::class.java)
        manager.createNotificationChannel(android.app.NotificationChannel("processing","Processing",android.app.NotificationManager.IMPORTANCE_NONE))
        assertEquals(false,call(module::getNotificationStatus))
        assertTrue((call(module::getLegalText) as String).contains("BSD"))
        call{module.dismissNotificationHint(id,it)};assertEquals(id,(call(module::getSettings) as ReadableMap).getString("notificationDismissedSession"))
        call(module::getCapabilities)
        org.robolectric.Shadows.shadowOf(manager).setNotificationsEnabled(false);assertEquals(false,call(module::getNotificationStatus))
        call(module::clearTemporaryFiles);call(module::discardSession)
        assertEquals("EMPTY",SessionStore.snapshot().getString("state"))
        SessionStore.update{it.put("state","SUCCEEDED").put("jobId","job").put("resultPath","/missing")}
        fails("EXPORT_FAILED"){module.exportResult("job","png",it)}
    }

    @Test fun controlledAdapterFailuresPreserveResultAndSource() {
        modelFailure=OutOfMemoryError();fails("LOW_MEMORY"){module.getCapabilities(it)}
        modelFailure=IllegalStateException();fails("INFERENCE_FAILED"){module.getCapabilities(it)};modelFailure=null
        val id=image()
        val rejecting=Robolectric.buildActivity(RejectingActivity::class.java).setup().get();react.onHostResume(rejecting)
        fails("SOURCE_UNAVAILABLE"){module.pickImage(it)}
        react.rejectService=true
        fails("SERVICE_START_FAILED"){module.startJob(id,2.0,true,it)}
        assertEquals("FAILED",SessionStore.snapshot().getString("state"));assertEquals(id,SessionStore.snapshot().getJSONObject("image").getString("id"))
        react.rejectActivity=true;assertEquals(false,call(module::openNotificationSettings))
        SessionStore.update{it.put("state","SUCCEEDED").put("jobId","job").put("resultPath",it.getJSONObject("image").getString("sourcePath"));it.getJSONArray("exports").put(JSONObject().put("id","export").put("format","png").put("uri","content://media/42"))}
        fails("EXPORT_FAILED"){module.openExport("export",it)}
        fails("SHARE_FAILED"){module.shareResult("job","png",it)}
        assertEquals("SUCCEEDED",SessionStore.snapshot().getString("state"))
    }

    @Test fun importJournalFailureKeepsPreviousSessionAndRemovesNewFiles() {
        val id=image();val previous=SessionStore.snapshot().toString()
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get();react.onHostResume(activity)
        val reply=Reply();module.pickImage(reply.promise);Shadows.shadowOf(Looper.getMainLooper()).idle()
        val source=File(ctx.cacheDir,"second.png");val bitmap=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888)
        ImageFiles.write(bitmap,source,"png");bitmap.recycle()
        val failed=object:android.util.AtomicFile(File(ctx.filesDir,"failure.json")) {
            override fun startWrite()=object:java.io.FileOutputStream(File(ctx.filesDir,"failure-stream")) {
                override fun write(bytes:ByteArray){throw java.io.IOException("controlled journal failure")}
            }
            override fun failWrite(stream:java.io.FileOutputStream?){stream?.close()}
        }
        SessionStore::class.java.getDeclaredField("journal").apply{isAccessible=true}.set(SessionStore,failed)
        react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_OK,Intent().setData(Uri.fromFile(source)))
        try{reply.await();fail()}catch(error:AppFailure){assertEquals("SOURCE_UNAVAILABLE",error.code)}
        assertEquals(previous,SessionStore.snapshot().toString())
        assertEquals(listOf(id),File(ctx.filesDir,"sessions").listFiles()!!.map{it.name})
    }
    @Test fun eventsBeforeCodegenBindingAreIgnoredAndInactiveCallbacksAreSafe() {
        ProfileAvailability.listeners.forEach{it(JSONObject().put("standard",true))}
        WindowLayout.listeners.forEach{it(JSONObject().put("width",320))}
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        react.active=true
        ProfileAvailability.listeners.forEach{it(JSONObject().put("standard",true))}
        SessionStore.update(false){it.put("state","READY")}
        WindowLayout.listeners.forEach{it(JSONObject().put("width",320))}
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertNotNull(call(module::getWindowLayout))
        module.invalidate()
        react.onActivityResult(Robolectric.buildActivity(Activity::class.java).setup().get(),UpscaleModule.PICK,Activity.RESULT_OK,Intent())
    }

    @Test fun telemetryBridgeKeepsOptOutIndependentAndRejectsMalformedPayloads() {
        val received=mutableListOf<String>()
        ctx.getSharedPreferences("telemetry",0).edit().clear().commit()
        Telemetry.init(ctx,object:TelemetrySink {
            override fun configure(analytics:Boolean,crashes:Boolean) {}
            override fun log(name:String,parameters:android.os.Bundle){received.add(name)}
        })
        ProfileAvailability.init(ctx)
        assertTrue((call(module::getProfileAvailability) as ReadableMap).getBoolean("standard"))
        val initialTelemetry=call(module::getTelemetrySettings) as ReadableMap
        assertTrue(initialTelemetry.getBoolean("analytics"));assertTrue(initialTelemetry.getBoolean("crashes"))
        assertFalse(initialTelemetry.getBoolean("noticeSeen"));assertEquals(0,initialTelemetry.getInt("consentVersion"))
        val enabled=call{module.updateTelemetrySettings(true,false,true,it)} as ReadableMap
        assertTrue(enabled.getBoolean("analytics"));assertFalse(enabled.getBoolean("crashes"));assertTrue(enabled.getBoolean("noticeSeen"));assertEquals(Telemetry.consentVersion,enabled.getInt("consentVersion"))
        module.logTelemetryEvent("ui_action","{\"action\":\"help\"}")
        module.logTelemetryEvent("ui_action","broken")
        assertEquals(listOf("ui_action"),received)
        call{module.updateTelemetrySettings(false,true,true,it)}
        module.logTelemetryEvent("ui_action","{}")
        assertEquals(1,received.size)
    }

    @Test fun finishStartupPostsAndOnlyFinishesTheCurrentMainActivity() {
        val startupReady=MainActivity::class.java.getDeclaredField("startupReady").apply { isAccessible=true }
        module.finishStartup() // No current Activity is a safe no-op.
        Shadows.shadowOf(Looper.getMainLooper()).idle()

        val activity=Robolectric.buildActivity(MainActivity::class.java).get()
        react.onHostResume(Activity())
        module.finishStartup()
        assertFalse(startupReady.getBoolean(activity))
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertFalse(startupReady.getBoolean(activity)) // A different current Activity is ignored.

        react.onHostResume(activity)
        module.finishStartup()
        assertFalse(startupReady.getBoolean(activity)) // The bridge posts to the main looper.
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertTrue(startupReady.getBoolean(activity))
    }

    @Test fun failedSettingsWritesRejectWithoutReportingSuccess() {
        val previous=call(module::getSettings) as ReadableMap
        react.rejectSettingsWrite=true
        fails("INFERENCE_FAILED"){module.updateSettings("ru","jpeg","dark",it)}
        fails("INFERENCE_FAILED"){module.setCacheLimit(10.0,it)}
        fails("INFERENCE_FAILED"){module.markNotificationIntroSeen(it)}
        react.rejectSettingsWrite=false
        val current=call(module::getSettings) as ReadableMap
        assertEquals(previous.toHashMap(),current.toHashMap())
    }

    @Test fun unavailableProfileBlocksModernAndLegacyLaunchesButKeepsResultAccess() {
        val flags=JSONObject().put("source","remote").put("updatedAt",123)
        ProcessingProfiles.presets.forEach{flags.put(it,false)}
        ctx.getSharedPreferences("remote_profiles",0).edit().putString("snapshot",flags.toString()).commit()
        ProfileAvailability.init(ctx)
        val id=image()
        fails("PROFILE_UNAVAILABLE"){module.startJobWithProfile(id,2.0,"standard","quality",true,it)}
        fails("PROFILE_UNAVAILABLE"){module.startJob(id,2.0,true,it)}
        fails("PROFILE_UNAVAILABLE"){module.startJobWithMode(id,2.0,true,"fast",it)}
        assertNotNull(call{module.inspectSelection(id,it)})
        ctx.getSharedPreferences("remote_profiles",0).edit().clear().commit();ProfileAvailability.init(ctx)
    }

    @Test fun imageRecommendationUsesPrivatePreviewMapsReasonsAndRespectsAvailability() {
        ctx.getSharedPreferences("remote_profiles",0).edit().clear().commit()
        ProfileAvailability.init(ctx)
        val id=image()
        val preview=File(ctx.cacheDir,"recommendation-preview.png")
        try {
            fails("SOURCE_UNAVAILABLE"){module.getImageRecommendation("missing",it)}
            fun previewWith(pixel:Int) {
                val bitmap=Bitmap.createBitmap(2,1,Bitmap.Config.ARGB_8888).apply { setPixel(0,0,pixel) }
                ImageFiles.write(bitmap,preview,"png");bitmap.recycle()
                SessionStore.update{it.getJSONObject("image").put("previewUri",Uri.fromFile(preview).toString())}
            }
            for ((pixel,reason,profile) in listOf(
                Triple(0xff123456.toInt(),"photo","lite"),
                Triple(0xff112233.toInt(),"art","art"),
                Triple(0xffabcdef.toInt(),"pixel","pixel"),
            )) {
                previewWith(pixel)
                assertEquals("host JNI fixture should receive the stored preview pixels",reason,RecommendationEngine.analyze(Uri.fromFile(preview).toString()))
                val suggestion=call{module.getImageRecommendation(id,it)} as ReadableMap
                assertEquals(id,suggestion.getString("imageId"));assertEquals(reason,suggestion.getString("reasonId"))
                assertEquals(profile,suggestion.getString("profileId"));assertEquals("quality",suggestion.getString("speed"))
            }
            SessionStore.update{it.getJSONObject("image").put("previewUri",Uri.fromFile(File(ctx.cacheDir,"missing-preview.png")).toString())}
            val fallback=call{module.getImageRecommendation(id,it)} as ReadableMap
            assertEquals("generic",fallback.getString("reasonId"));assertEquals("lite",fallback.getString("profileId"))

            val flags=JSONObject().put("source","test").put("updatedAt",0)
            ProcessingProfiles.presets.forEach{flags.put(it,it!="pixel")}
            ctx.getSharedPreferences("remote_profiles",0).edit().putString("snapshot",flags.toString()).commit()
            ProfileAvailability.init(ctx)
            previewWith(0xffabcdef.toInt())
            assertNull(call{module.getImageRecommendation(id,it)})
        } finally {
            preview.delete()
            ctx.getSharedPreferences("remote_profiles",0).edit().clear().commit();ProfileAvailability.init(ctx)
        }
    }

    @Test fun recommendationAnalyzerBoundsDecodeAndRejectsInvalidPreviews() {
        val file=File.createTempFile("recommendation-test",".png",ctx.cacheDir)
        try {
            assertEquals("generic",RecommendationEngine.analyze("opaque:without/path"))
            file.delete()
            try { RecommendationEngine.analyze(Uri.fromFile(file).toString());fail("missing preview should fail") }
            catch(_:IllegalArgumentException) { }
        } finally { file.delete() }
    }

    @Test fun recommendationAnalyzerUsesBoundedPixelsAndReleasesDecodedBuffers() {
        val file=File.createTempFile("recommendation-test",".png",ctx.cacheDir)
        try {
            withRecommendationDecoder(file,1200,600,null) { sample ->
                assertEquals("generic",RecommendationEngine.analyze(Uri.fromFile(file).toString()))
                assertEquals(8,sample.get())
            }
            val decoded=Bitmap.createBitmap(2,1,Bitmap.Config.ARGB_8888).apply{setPixel(0,0,0xff123456.toInt())}
            try {
                withRecommendationDecoder(file,1200,600,decoded) { sample ->
                    assertEquals("photo",RecommendationEngine.analyze(Uri.fromFile(file).toString()))
                    assertEquals(8,sample.get())
                }
                assertTrue(decoded.isRecycled)
            } finally { if(!decoded.isRecycled)decoded.recycle() }
        } finally { file.delete() }
    }

    @Test fun recommendationAnalyzerDownscalesOversizedDecodeAndPreservesIdentityResult() {
        val file=File.createTempFile("recommendation-test",".png",ctx.cacheDir)
        val decoded=Bitmap.createBitmap(320,160,Bitmap.Config.ARGB_8888)
        try {
            withRecommendationDecoder(file,320,160,decoded) {
                assertEquals("generic",RecommendationEngine.analyze(Uri.fromFile(file).toString()))
            }
            assertTrue("a distinct reduced bitmap releases the decode buffer",decoded.isRecycled)
        } finally { if(!decoded.isRecycled)decoded.recycle();file.delete() }

        file.writeBytes(byteArrayOf(1))
        val identical=Bitmap.createBitmap(320,160,Bitmap.Config.ARGB_8888)
        try {
            withRecommendationDecoder(file,320,160,identical) {
                mockStatic(Bitmap::class.java,Answer<Any?>{invocation->
                    if(invocation.method.name=="createScaledBitmap")identical else Answers.RETURNS_DEFAULTS.answer(invocation)
                }).use {
                    assertEquals("generic",RecommendationEngine.analyze(Uri.fromFile(file).toString()))
                }
            }
            assertTrue("identity output remains readable and is released after analysis",identical.isRecycled)
        } finally { if(!identical.isRecycled)identical.recycle();file.delete() }
    }

    @Test fun recommendationAnalyzerRejectsCorruptBoundsAndFallsBackWhenDecodeIsNull() {
        val file=File.createTempFile("recommendation-test",".png",ctx.cacheDir)
        try {
            for((width,height) in listOf(0 to 500,1 to 0)) {
                withRecommendationDecoder(file,width,height,null) {
                    try { RecommendationEngine.analyze(Uri.fromFile(file).toString());fail("invalid bounds should fail") }
                    catch(_:IllegalArgumentException) { }
                }
            }
            withRecommendationDecoder(file,1200,600,null) {
                assertEquals("generic",RecommendationEngine.analyze(Uri.fromFile(file).toString()))
            }
        } finally { file.delete() }
    }

    private fun withRecommendationDecoder(file:File,width:Int,height:Int,bitmap:Bitmap?,block:(java.util.concurrent.atomic.AtomicInteger)->Unit) {
        val sample=java.util.concurrent.atomic.AtomicInteger()
        val answer=Answer<Any?>{invocation->
            if(invocation.method.name!="decodeFile") return@Answer null
            if(invocation.getArgument<String>(0)!=file.path) return@Answer null
            val options=invocation.getArgument<BitmapFactory.Options>(1)
            if(options.inJustDecodeBounds) { options.outWidth=width;options.outHeight=height;null }
            else { sample.set(options.inSampleSize);bitmap }
        }
        mockStatic(BitmapFactory::class.java,answer).use { block(sample) }
    }

    @Test fun failedImportReportsAllowedFailureWithoutLeakingFileData() {
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get();react.onHostResume(activity)
        val reply=Reply();module.pickImage(reply.promise);Shadows.shadowOf(Looper.getMainLooper()).idle()
        val invalid=File(ctx.cacheDir,"invalid.png").apply{writeText("not an image")}
        react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_OK,Intent().setData(Uri.fromFile(invalid)))
        try{reply.await();fail("Invalid image must be rejected")}catch(e:AppFailure){assertEquals("UNSUPPORTED_FORMAT",e.code)}
        assertEquals("EMPTY",SessionStore.snapshot().getString("state"))
    }

    @Test fun nullAndEmptyMediaQueriesAllowManualReExport() {
        image();val gallery=MediaExportTest.Gallery().apply{output=File(ctx.cacheDir,"out");attachInfo(ctx,android.content.pm.ProviderInfo().apply{authority="media";exported=true})}
        org.robolectric.shadows.ShadowContentResolver.registerProviderInternal("media",gallery)
        SessionStore.update{it.put("state","SUCCEEDED").put("jobId","job").put("resultPath",it.getJSONObject("image").getString("sourcePath"))}
        val first=call{module.exportResult("job","png",it)} as ReadableMap
        gallery.nullQuery=true;val second=call{module.exportResult("job","png",it)} as ReadableMap
        assertNotEquals(first.getString("id"),second.getString("id"))
        gallery.nullQuery=false;val third=call{module.exportResult("job","png",it)} as ReadableMap
        assertNotEquals(second.getString("id"),third.getString("id"));call(module::getCurrentSession)
        assertEquals(0,SessionStore.snapshot().getJSONArray("exports").length())
        assertEquals("SUCCEEDED",SessionStore.snapshot().getString("state"))
    }

    @Test fun currentSessionRemovesExportsWhenProviderQueriesFail() {
        image()
        val gallery=MediaExportTest.Gallery().apply {
            output=File(ctx.cacheDir,"query-failure-output")
            failQuery=true
            attachInfo(ctx,android.content.pm.ProviderInfo().apply{authority="media-query-failure";exported=true})
        }
        org.robolectric.shadows.ShadowContentResolver.registerProviderInternal("media-query-failure",gallery)
        SessionStore.update {
            it.put("exports",org.json.JSONArray().put(JSONObject().put("id","export-id").put("format","png").put("uri","content://media-query-failure/item")))
                .put("exportState","EXPORTED")
        }
        val current=call(module::getCurrentSession) as ReadableMap
        assertEquals(0,current.getArray("exports")!!.size())
        assertEquals("EXPORT_IDLE",current.getString("exportState"))
    }

}
