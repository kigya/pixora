package dev.kigya.pixora

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ModuleContractTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val ctx=instrumentation.targetContext
    private fun call(action:(Promise)->Unit):Any? {
        val latch=CountDownLatch(1);var value:Any?=null;var failure:String?=null
        val promise=Proxy.newProxyInstance(Promise::class.java.classLoader,arrayOf(Promise::class.java)){_,method,args ->
            if(method.name=="resolve"){value=args?.get(0);latch.countDown()}
            if(method.name=="reject"){failure=args?.get(0)?.toString();latch.countDown()};null
        } as Promise
        action(promise);assertTrue("Native promise did not settle",latch.await(30,TimeUnit.SECONDS))
        if(failure!=null)throw AppFailure(failure!!)
        return value
    }
    private fun failure(code:String,action:(Promise)->Unit) {try{call(action);fail("Expected $code")}catch(e:AppFailure){assertEquals(code,e.code)}}
    @Test fun moduleSelectionSettingsOwnershipAndExport() {
        SessionStore.init(ctx);SessionStore.discard()
        val oldSettings=SessionStore.settings(ctx)
        val activity=instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val host=(ctx.applicationContext as MainApplication).reactHost
        val ready=System.currentTimeMillis()+20000
        while(host.currentReactContext==null && System.currentTimeMillis()<ready)Thread.sleep(100)
        val react=host.currentReactContext as ReactApplicationContext
        Thread.sleep(2000) // Allow the JS TurboModule binding to install its emitter.
        val module=react.getNativeModule(UpscaleModule.NAME) as UpscaleModule
        var exportedUri:Uri?=null
        val input=File(ctx.cacheDir,"module-contract.png")
        try {
            assertEquals("NativeUpscale",module.name)
            assertNull(UpscalePackage().getModule("other",react));assertTrue(UpscalePackage().getReactModuleInfoProvider().getReactModuleInfos().containsKey("NativeUpscale"))
            val feedbackId=InstrumentationRegistry.getArguments().getString("feedbackRequestId")
            if(feedbackId!=null)assertEquals(true,call{module.sendFeedback("kirillborichevskiy@gmail.com","Upselora feedback idempotent connectivity test",4.0,feedbackId,it)})
            instrumentation.runOnMainSync{WindowLayout.publish(androidx.window.layout.WindowLayoutInfo(emptyList()),activity)}
            call(module::getCapabilities);call(module::getWindowLayout);call(module::getLegalText);call(module::getSettings);call(module::getNotificationStatus)
            val emitterField=com.facebook.react.bridge.BaseJavaModule::class.java.getDeclaredField("mEventEmitterCallback").apply{isAccessible=true}
            val bindingDeadline=System.currentTimeMillis()+20000
            while(emitterField.get(module)==null && System.currentTimeMillis()<bindingDeadline)Thread.sleep(100)
            assertNotNull("React subscriptions must bind before native availability is emitted",emitterField.get(module))
            instrumentation.runOnMainSync { ProfileAvailability.listeners.forEach { it(ProfileAvailability.snapshot()) } }
            assertNotNull(call(module::getProfileAvailability))
            for(language in Localizer.supported(ctx))call{module.updateSettings(language,"png","dark",it)}
            for(theme in listOf("system","light","dark"))call{module.updateSettings("en","jpeg",theme,it)}
            failure("INFERENCE_FAILED"){module.updateSettings("en","png","bad",it)}
            failure("INFERENCE_FAILED"){module.updateSettings("fi","png","dark",it)}
            failure("INFERENCE_FAILED"){module.updateSettings("en","gif","dark",it)}
            failure("SOURCE_UNAVAILABLE"){module.inspectSelection("none",it)}
            failure("SOURCE_UNAVAILABLE"){module.prepareSelection("none",it)}
            failure("SOURCE_UNAVAILABLE"){module.dismissNotificationHint("wrong",it)}
            failure("EXPORT_FAILED"){module.exportResult("none","png",it)}
            failure("EXPORT_FAILED"){module.openExport("none",it)}
            failure("EXPORT_FAILED"){module.shareResult("none","png",it)}
            failure("INFERENCE_FAILED"){module.startJobWithMode("none",2.0,true,"bad",it)}
            failure("INFERENCE_FAILED"){module.startJob("none",3.0,true,it)}
            call{module.cancelJob("none",it)};call(module::clearTemporaryFiles)
            val bitmap=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888).apply{eraseColor(android.graphics.Color.BLUE)}
            ImageFiles.write(bitmap,input,"png");bitmap.recycle()
            SessionStore.replace(ImageFiles.import(ctx,Uri.fromFile(input)))
            val id=SessionStore.snapshot().getJSONObject("image").getString("id")
            failure("SOURCE_UNAVAILABLE"){module.inspectSelection("wrong",it)}
            val inspected=call{module.inspectSelection(id,it)} as ReadableMap
            assertFalse(inspected.hasKey("sourcePath"));call{module.prepareSelection(id,it)}
            call{module.dismissNotificationHint(id,it)}
            SessionStore.update{it.getJSONObject("image").put("needsPreparation",true)}
            failure("PREPARATION_REQUIRED"){module.startJob(id,2.0,false,it)}
            SessionStore.update{it.getJSONObject("image").put("needsPreparation",false)}
            call{module.startJob(id,2.0,true,it)}
            failure("BUSY"){module.startJob(id,2.0,true,it)}
            failure("BUSY"){module.clearTemporaryFiles(it)}
            val deadline=System.currentTimeMillis()+180000
            var tick=0
            while((SessionStore.busy() || SessionStore.workerAlive || SessionStore.serviceAlive) && System.currentTimeMillis()<deadline) {
                if(tick++%100==0) {val current=SessionStore.snapshot();println("Module job state=${current.getString("state")} phase=${current.optString("phase")} backend=${current.optString("backend")} timings=${current.optJSONObject("timings")}")}
                Thread.sleep(100)
            }
            assertEquals(SessionStore.snapshot().toString(),"SUCCEEDED",SessionStore.snapshot().getString("state"))
            val job=SessionStore.snapshot().getString("jobId")
            val exported=call{module.exportResult(job,"png",it)} as ReadableMap
            exportedUri=Uri.parse(exported.getString("uri"))
            assertEquals(exported.getString("id"),(call{module.exportResult(job,"png",it)} as ReadableMap).getString("id"))
            assertEquals(1,SessionStore.snapshot().getJSONArray("exports").length());call(module::getCurrentSession)
            failure("EXPORT_FAILED"){module.exportResult(job,"bad",it)}
            assertEquals(SessionStore.snapshot().toString(),"SUCCEEDED",SessionStore.snapshot().getString("state"))
            failure("SHARE_FAILED"){module.shareResult(job,"bad",it)}
            ctx.contentResolver.delete(exportedUri!!,null,null);exportedUri=null
            call(module::getCurrentSession);assertEquals(0,SessionStore.snapshot().getJSONArray("exports").length())
            call(module::discardSession)
            ctx.getSharedPreferences("settings",0).edit().putBoolean("notificationAsked",true).commit()
            call(module::requestNotifications)
            // Picker cancellation is a null result; an unrelated request cannot settle it.
            val latch=CountDownLatch(1)
            val promise=Proxy.newProxyInstance(Promise::class.java.classLoader,arrayOf(Promise::class.java)){_,method,args->if(method.name=="resolve"){assertNull(args?.get(0));latch.countDown()};null} as Promise
            module.pickImage(promise);Thread.sleep(500)
            failure("BUSY"){module.pickImage(it)}
            instrumentation.runOnMainSync{react.onActivityResult(activity,0,Activity.RESULT_CANCELED,null);react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_CANCELED,null);react.onActivityResult(activity,UpscaleModule.PICK,Activity.RESULT_OK,null)}
            assertTrue(latch.await(10,TimeUnit.SECONDS))
            Thread.sleep(500)
            for(action in listOf(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.ACTION_UP))instrumentation.uiAutomation.injectInputEvent(android.view.KeyEvent(action,android.view.KeyEvent.KEYCODE_BACK),true)
            Thread.sleep(1000)
        } finally {
            exportedUri?.let{ctx.contentResolver.delete(it,null,null)}
            // Back may destroy the React host and invalidate its executor.
            // Restore test-owned preferences without calling a dead module.
            assertTrue(ctx.getSharedPreferences("settings",0).edit()
                .putString("language",oldSettings.getString("language"))
                .putString("format",oldSettings.getString("format"))
                .putString("theme",oldSettings.getString("theme"))
                .putBoolean("notificationAsked",oldSettings.getBoolean("notificationAsked"))
                .putString("notificationDismissedSession",oldSettings.getString("notificationDismissedSession")).commit())
            instrumentation.runOnMainSync{activity.finish()};input.delete()
        }
    }
}
