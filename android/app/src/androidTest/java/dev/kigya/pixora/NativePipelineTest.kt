package dev.kigya.pixora

import android.content.Intent
import android.view.accessibility.AccessibilityNodeInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.io.File

@RunWith(AndroidJUnit4::class)
class NativePipelineTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val progress = object:ProgressCallback { override fun onProgress(done:Int,total:Int)=true }
    private fun source(w:Int=8,h:Int=8):Bitmap = Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888).apply {
        for(y in 0 until h)for(x in 0 until w)setPixel(x,y,Color.argb(if(x==0)0 else 255,(x*23)%256,(y*27)%256,120))
    }
    @org.junit.Before fun beginNativeCoverage() {
        NativeEngine.setCoveragePath(File(ctx.getExternalFilesDir(null),"native.profraw").path)
    }
    @org.junit.After fun finishNativeCoverage() { NativeEngine.flushCoverage() }
    @Test fun bundledTranslationsResolveAndPreserveOldPreferences() {
        val prefs=ctx.getSharedPreferences("settings",0)
        val old=prefs.getString("language","system")
        try {
            assertEquals(org.json.JSONArray(readAssetText(ctx,"locales/registry.json")).length(),Localizer.supported(ctx).size)
            val regions=mapOf("en-US" to "en","ru-RU" to "ru","zh-TW" to "zh-Hans","es-MX" to "es","hi-IN" to "hi","ar-SA" to "ar","pt-PT" to "pt-BR","fr-FR" to "fr","de-DE" to "de","ja-JP" to "ja")
            for((tag,code) in regions) {
                assertEquals(code,Localizer.resolve(ctx,"system",tag))
                prefs.edit().putString("language",code).commit()
                val dictionary=JSONObject(ctx.assets.open("locales/$code.json").bufferedReader().use{it.readText()})
                for(key in listOf("processing","cancelJob","imageReady","processingFailed","finalizing","cancelling"))assertEquals(dictionary.getString(key),Localizer.text(ctx,key))
                assertEquals(dictionary.getJSONObject("stages").getString("loading_model"),Localizer.text(ctx,"stages.loading_model"))
            }
            assertEquals("en",Localizer.resolve(ctx,"system","fi-FI"))
            assertEquals("ru",Localizer.resolve(ctx,"ru","en-US"))
            assertEquals("en",Localizer.resolve(ctx,"en","ru-RU"))
        } finally {prefs.edit().putString("language",old).commit()}
    }
    @Test fun releaseActivityStartsWithRegisteredTurboModule() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        SessionStore.init(ctx);SessionStore.discard()
        val languagePrefs=ctx.getSharedPreferences("settings",0);val oldLanguage=languagePrefs.getString("language","system");val oldTheme=languagePrefs.getString("theme","system")
        languagePrefs.edit().putString("language","en").commit()
        val activity=instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        fun contains(node:AccessibilityNodeInfo?):Boolean {
            if(node==null)return false
            if(node.text?.toString()=="Choose image" || node.contentDescription?.toString()=="Choose image")return true
            for(i in 0 until node.childCount)if(contains(node.getChild(i)))return true
            return false
        }
        try {
            instrumentation.runOnMainSync{activity.onConfigurationChanged(android.content.res.Configuration(activity.resources.configuration))}
            val deadline=System.currentTimeMillis()+20000
            while(System.currentTimeMillis()<deadline && !contains(instrumentation.uiAutomation.rootInActiveWindow))Thread.sleep(100)
            assertTrue("Release UI and TurboModule must render without Metro",contains(instrumentation.uiAutomation.rootInActiveWindow))
            for(theme in listOf("light","dark")) {
                languagePrefs.edit().putString("theme",theme).commit()
                instrumentation.runOnMainSync {
                    activity.onConfigurationChanged(android.content.res.Configuration(activity.resources.configuration))
                    WindowLayout.publish(androidx.window.layout.WindowLayoutInfo(emptyList()),activity)
                }
            }
            instrumentation.runOnMainSync{activity.recreate()}
            instrumentation.waitForIdleSync()
            Thread.sleep(500)
            val restoredDeadline=System.currentTimeMillis()+20000
            while(System.currentTimeMillis()<restoredDeadline && !contains(instrumentation.uiAutomation.rootInActiveWindow))Thread.sleep(100)
            assertTrue("Saved screen fragments must recreate safely",contains(instrumentation.uiAutomation.rootInActiveWindow))
        } finally {languagePrefs.edit().putString("language",oldLanguage).putString("theme",oldTheme).commit();instrumentation.runOnMainSync{
            ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).filterIsInstance<MainActivity>().forEach{it.finish()}
        }}
    }
    @Test fun importSnapshotCannotMutatePrivateJournal() {
        SessionStore.init(ctx)
        val file=File(ctx.cacheDir,"journal-input.png");val b=source();ImageFiles.write(b,file,"png");b.recycle()
        val image=ImageFiles.import(ctx,Uri.fromFile(file));val sourcePath=image.getString("sourcePath")
        SessionStore.replace(image)
        image.remove("sourcePath");image.remove("workPath")
        assertEquals(sourcePath,SessionStore.snapshot().getJSONObject("image").getString("sourcePath"))
        assertFalse(SessionStore.publicSnapshot().getJSONObject("image").has("sourcePath"))
        SessionStore.discard();file.delete()
    }
    @Test fun tiledInferenceMatchesWholeImageAndKeepsEdges() {
        val input=source(65,49);val whole=Bitmap.createBitmap(260,196,Bitmap.Config.ARGB_8888);val tiled=Bitmap.createBitmap(260,196,Bitmap.Config.ARGB_8888)
        try {
            NativeEngine.resetCancellation()
            assertEquals(0,NativeEngine.process(ctx.assets,input,whole,false,128,progress))
            assertEquals(0,NativeEngine.process(ctx.assets,input,tiled,false,32,progress))
            var difference=0L;var count=0
            for(y in 0 until 196)for(x in 0 until 260) {
                val a=whole.getPixel(x,y);val b=tiled.getPixel(x,y)
                assertEquals(Color.alpha(a),Color.alpha(b))
                difference+=kotlin.math.abs(Color.red(a)-Color.red(b))+kotlin.math.abs(Color.green(a)-Color.green(b))+kotlin.math.abs(Color.blue(a)-Color.blue(b));count+=3
            }
            assertTrue("Tile mean channel error: ${difference.toDouble()/count}",difference.toDouble()/count<1.0)
            assertEquals(255,Color.alpha(tiled.getPixel(259,195)))
        } finally {input.recycle();whole.recycle();tiled.recycle()}
    }
    @Test fun transparentEdgesDoNotAcquireBlackHalo() {
        val input=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888);val output=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888)
        try {
            for(y in 0..7)for(x in 1..7)input.setPixel(x,y,Color.RED)
            NativeEngine.resetCancellation()
            assertEquals(0,NativeEngine.process(ctx.assets,input,output,false,64,progress))
            val edge=output.getPixel(2,16)
            assertTrue(Color.alpha(edge) in 1..254)
            assertTrue("Straight RGB should remain red at alpha edge",Color.red(edge)>230)
        } finally {input.recycle();output.recycle()}
    }
    private fun awaitTerminal(timeout:Long=30000):JSONObject {
        val until=System.currentTimeMillis()+timeout
        while(System.currentTimeMillis()<until) {
            val s=SessionStore.snapshot()
            if(!SessionStore.workerAlive && !SessionStore.serviceAlive && s.getString("state") in setOf("SUCCEEDED","CANCELLED","FAILED"))return s
            Thread.sleep(50)
        }
        fail("Service did not reach terminal state");return JSONObject()
    }
    @Test fun foregroundServiceOwnsBackgroundTaskAndNotificationCancellation() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        SessionStore.init(ctx);SessionStore.discard()
        val activity=instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        try {
            instrumentation.waitForIdleSync()
            for(cancel in listOf(false,true)) {
                val file=File(ctx.cacheDir,"service-test.png");val b=source(if(cancel)129 else 8,if(cancel)97 else 8)
                ImageFiles.write(b,file,"png");b.recycle()
                SessionStore.replace(ImageFiles.import(ctx,Uri.fromFile(file)));file.delete()
                SessionStore.update{it.put("state","PREPARING").put("jobId",java.util.UUID.randomUUID().toString()).put("scale",if(cancel)4 else 2).put("startedAt",System.currentTimeMillis())}
                NativeEngine.resetCancellation()
                instrumentation.runOnMainSync{ctx.startForegroundService(Intent(ctx,ProcessingService::class.java).setAction("PROCESS"))}
                if(cancel) {
                    Thread.sleep(100)
                    instrumentation.runOnMainSync{ctx.startService(Intent(ctx,ProcessingService::class.java).setAction("CANCEL").putExtra("jobId",SessionStore.snapshot().getString("jobId")))}
                } else instrumentation.runOnMainSync{activity.moveTaskToBack(true)}
                val terminal=awaitTerminal()
                assertEquals("Service error: ${terminal.optString("error")}",if(cancel)"CANCELLED" else "SUCCEEDED",terminal.getString("state"))
                if(cancel)assertFalse(File(terminal.getJSONObject("image").getString("sourcePath")).parentFile!!.resolve("result.png").exists())
                else {assertEquals(16,terminal.getInt("resultWidth"));assertTrue(File(terminal.getString("resultPath")).isFile)}
                SessionStore.discard()
                if(!cancel) {
                    // singleTask reuses the Activity: startActivitySync waits for onCreate,
                    // so it is not appropriate for returning to this existing task.
                    instrumentation.runOnMainSync{ctx.startActivity(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
                    Thread.sleep(500)
                }
            }
        } finally {NativeEngine.cancel();instrumentation.runOnMainSync{activity.finish()}}
    }
    @Test fun tenCpuCallsReleaseModelMemory() {
        val input=source();val output=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888)
        try {
            NativeEngine.resetCancellation()
            var warm=0L
            for(i in 1..10) {
                var code=-99
                val worker=Thread {code=NativeEngine.process(ctx.assets,input,output,false,64,progress)}
                worker.start();worker.join(30000)
                assertFalse("Native worker did not return",worker.isAlive)
                assertEquals(0,code)
                if(i==3)warm=android.os.Debug.getNativeHeapAllocatedSize()
            }
            val growth=android.os.Debug.getNativeHeapAllocatedSize()-warm
            assertTrue("Native heap grew by $growth bytes",growth<16L*1024*1024)
        } finally {input.recycle();output.recycle()}
    }
    @Test fun realStageCallbacksAndAvailableGpu() {
        val input=source();val output=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888)
        val stages=mutableListOf<Int>();var completed=0;var total=0
        val callback=object:ProgressCallback {
            override fun onStage(stage:Int){stages.add(stage)}
            override fun onProgress(done:Int,count:Int):Boolean{completed=done;total=count;return true}
        }
        try {
            NativeEngine.resetCancellation()
            assertEquals(0,NativeEngine.process(ctx.assets,input,output,false,64,callback))
            assertEquals(listOf(0,1),stages);assertTrue(total>0);assertEquals(total,completed)
            val available=NativeEngine.gpuAvailable()
            android.util.Log.i("UpseloraDeviceTest","Vulkan available: $available")
            if(available) {
                stages.clear();output.eraseColor(0)
                val code=NativeEngine.process(ctx.assets,input,output,true,32,callback)
                android.util.Log.i("UpseloraDeviceTest","GPU self-test return: $code")
                assertEquals("GPU inference failed",0,code)
                assertNotEquals(output.getPixel(8,8),output.getPixel(27,27))
                assertEquals(listOf(0,1),stages)
            }
        } finally {NativeEngine.resetCancellation();input.recycle();output.recycle()}
    }
    @Test fun fastModelKeepsDimensionsTransparencyAndTileEdges() {
        val input=source(41,37)
        val full=Bitmap.createBitmap(164,148,Bitmap.Config.ARGB_8888)
        val tiled=Bitmap.createBitmap(164,148,Bitmap.Config.ARGB_8888)
        try {
            NativeEngine.resetCancellation()
            assertEquals(0,NativeEngine.processWithModel(ctx.assets,input,full,false,128,progress,true,false))
            assertEquals(0,NativeEngine.processWithModel(ctx.assets,input,tiled,false,32,progress,true,false))
            var error=0L
            for(y in 0 until full.height)for(x in 0 until full.width) {
                val a=full.getPixel(x,y);val b=tiled.getPixel(x,y)
                error+=kotlin.math.abs(Color.red(a)-Color.red(b))+kotlin.math.abs(Color.green(a)-Color.green(b))+kotlin.math.abs(Color.blue(a)-Color.blue(b))
            }
            assertTrue("Fast model has tile seams",error.toDouble()/(full.width*full.height*3)<1)
            assertEquals(0,Color.alpha(full.getPixel(0,0)))
            val half=Bitmap.createScaledBitmap(full,82,74,true)
            assertEquals(82,half.width);assertEquals(74,half.height);half.recycle()
        } finally {input.recycle();full.recycle();tiled.recycle();NativeEngine.resetCancellation()}
    }
    @Test fun fastModelMatchesOriginalPytorchReference() {
        val assets=InstrumentationRegistry.getInstrumentation().context.assets
        val input=assets.open("fast-input.png").use{BitmapFactory.decodeStream(it)}
        val reference=assets.open("fast-reference.png").use{BitmapFactory.decodeStream(it)}
        val output=Bitmap.createBitmap(input.width*4,input.height*4,Bitmap.Config.ARGB_8888)
        try {
            NativeEngine.resetCancellation()
            assertEquals(0,NativeEngine.processWithModel(ctx.assets,input,output,false,64,progress,true,false))
            var error=0L;var maximum=0
            for(y in 0 until output.height)for(x in 0 until output.width) {
                val a=reference.getPixel(x,y);val b=output.getPixel(x,y)
                for(channel in listOf(Color.red(a)-Color.red(b),Color.green(a)-Color.green(b),Color.blue(a)-Color.blue(b))) {
                    val delta=kotlin.math.abs(channel);error+=delta;maximum=maxOf(maximum,delta)
                }
            }
            assertTrue("Reference mean error: $error",error.toDouble()/(output.width*output.height*3)<0.1)
            assertTrue("Reference max error: $maximum",maximum<=1)
        } finally {input.recycle();reference.recycle();output.recycle()}
    }

    @Test fun geometryLimitsAndStorageBudget() {
        assertEquals(1024 to 768,ImageFiles.workSize(4000,3000))
        assertEquals(1 to 1024,ImageFiles.workSize(1,20000))
        assertEquals(268435456L,ImageFiles.reserve(1024,1024,4))
        try{ImageFiles.validateDimensions(20001,1);fail("oversized accepted")}catch(e:AppFailure){assertEquals("DIMENSIONS_TOO_LARGE",e.code)}
    }
    @Test fun cpuInferenceAlphaCancellationAndExport() {
        val input=source();val output=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888)
        try {
            NativeEngine.resetCancellation()
            assertEquals(0,NativeEngine.process(ctx.assets,input,output,false,64,progress))
            assertEquals(0,Color.alpha(output.getPixel(0,0)))
            assertEquals(255,Color.alpha(output.getPixel(31,31)))
            assertNotEquals(output.getPixel(8,8),output.getPixel(27,27))
            NativeEngine.cancel()
            assertEquals(1,NativeEngine.process(ctx.assets,input,output,false,64,progress))
            NativeEngine.resetCancellation()
            val dir=File(ctx.cacheDir,"native-test").apply{mkdirs()};val png=File(dir,"result.png");val jpg=File(dir,"result.jpg")
            ImageFiles.write(output,png,"png");ImageFiles.write(output,jpg,"jpeg")
            val p=BitmapFactory.decodeFile(png.path);val j=BitmapFactory.decodeFile(jpg.path)
            assertEquals(32,p.width);assertEquals(32,j.height);assertEquals(0,Color.alpha(p.getPixel(0,0)))
            assertTrue(Color.red(j.getPixel(0,0))>230);p.recycle();j.recycle()
            val session=JSONObject().put("resultPath",png.path).put("scale",4)
            for(format in listOf("png","jpeg")) {
                val exported=ImageFiles.export(ctx,session,format);val uri=Uri.parse(exported.getString("uri"))
                ctx.contentResolver.openInputStream(uri).use {stream->val b=BitmapFactory.decodeStream(stream);assertEquals(32,b.width);assertEquals(32,b.height);b.recycle()}
                assertEquals(1,ctx.contentResolver.delete(uri,null,null))
            }
            dir.deleteRecursively()
        } finally {NativeEngine.resetCancellation();input.recycle();output.recycle()}
    }
    @Test fun importedOrientationAndDownsizeAreExplicit() {
        val file=File(ctx.cacheDir,"orientation.jpg");val b=source(12,8)
        ImageFiles.write(b,file,"jpeg");b.recycle()
        ExifInterface(file).apply{setAttribute(ExifInterface.TAG_ORIENTATION,"6");saveAttributes()}
        val image=ImageFiles.import(ctx,Uri.fromFile(file))
        assertEquals(8,image.getInt("width"));assertEquals(12,image.getInt("height"));assertFalse(image.getBoolean("needsPreparation"))
        assertEquals("",image.getString("workPath"))
        val prepared=BitmapFactory.decodeFile(ImageFiles.prepare(image).path);assertEquals(8,prepared.width);assertEquals(12,prepared.height);prepared.recycle()
        File(image.getString("sourcePath")).parentFile!!.deleteRecursively();file.delete()
        val large=File(ctx.cacheDir,"large.png");val big=source(1200,600);ImageFiles.write(big,large,"png");big.recycle()
        val info=ImageFiles.import(ctx,Uri.fromFile(large));assertTrue(info.getBoolean("needsPreparation"));assertEquals(1024,info.getInt("workWidth"));assertEquals(512,info.getInt("workHeight"))
        assertFalse(File(File(info.getString("sourcePath")).parentFile,"work.png").exists())
        File(info.getString("sourcePath")).parentFile!!.deleteRecursively();large.delete()
    }
    @Test fun sniffAnimationAndCorruptFiles() {
        val file=File(ctx.cacheDir,"sniff-test")
        try {
            file.writeBytes("GIF89a000000000000".toByteArray())
            try{ImageFiles.sniff(file);fail()}catch(e:AppFailure){assertEquals("ANIMATED_IMAGE",e.code)}
            file.writeBytes("not a valid image of any kind".toByteArray())
            try{ImageFiles.sniff(file);fail()}catch(e:AppFailure){assertEquals("UNSUPPORTED_FORMAT",e.code)}
        } finally {file.delete()}
    }
}
