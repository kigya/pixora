package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import org.json.JSONObject
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowSystemClock
import java.io.File
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class ProcessorTest {
    private lateinit var ctx:Context
    private var timeout=false
    @Before fun before() {
        ctx=RuntimeEnvironment.getApplication();reset();ctx.filesDir.deleteRecursively();ctx.filesDir.mkdirs();SessionStore.init(ctx)
        val source=File(ctx.filesDir,"sessions/test/source").apply{parentFile!!.mkdirs();writeText("input")}
        SessionStore.replace(JSONObject().put("id","test").put("sourcePath",source.path))
        SessionStore.update{it.put("state","PREPARING").put("scale",4)}
        timeout=false
    }
    @After fun reset() {
        for(name in listOf("context","journal"))SessionStore::class.java.getDeclaredField(name).apply{isAccessible=true}.set(SessionStore,null)
        SessionStore.listeners.clear();SessionStore.workerAlive=false;SessionStore.serviceAlive=false
    }
    private class Files:WorkFiles {
        var fail="";var cancelAt="";var empty=false;var bounds=32 to 32;var inputSize=8 to 8;var dynamicOutput=false
        var hook:(String)->Unit={}
        val bitmaps=mutableListOf<Bitmap>()
        fun check(stage:String){hook(stage);if(cancelAt==stage)SessionStore.update{it.put("state","CANCELLING")};if(fail==stage)throw AppFailure("DECODE_FAILED")}
        override fun prepare(image:JSONObject):File {check("prepare");return File(image.getString("sourcePath"))}
        override fun decode(file:File):Bitmap? {if(fail=="decode")return null;return Bitmap.createBitmap(inputSize.first,inputSize.second,Bitmap.Config.ARGB_8888).also{bitmaps.add(it)}}
        override fun createOutput(input:Bitmap):Bitmap {if(fail=="memory")throw OutOfMemoryError();return Bitmap.createBitmap(if(dynamicOutput)input.width*4 else 32,if(dynamicOutput)input.height*4 else 32,Bitmap.Config.ARGB_8888).also{bitmaps.add(it)}}
        override fun half(full:Bitmap)=Bitmap.createBitmap(16,16,Bitmap.Config.ARGB_8888).also{bitmaps.add(it);bounds=16 to 16}
        override fun write(bitmap:Bitmap,file:File){check("write");file.writeText(if(empty)"" else "result")}
        override fun dimensions(file:File)=bounds
        override fun preview(bitmap:Bitmap,dir:File):String {check("preview");return "file:///after.png"}
    }
    private class Backend:ProcessingBackend {
        var gpu=false;var cancelAt="";var failure:Throwable?=null;var codes=mutableListOf(0)
        var omitMetrics=false;var attempts=mutableListOf<Pair<Boolean,Int>>()
        override fun gpuAvailable():Boolean {if(cancelAt=="device")SessionStore.update{it.put("state","CANCELLING")};return gpu}
        override fun process(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,fast:Boolean,testGPU:Boolean):Int {
            attempts.add(gpu to tile);failure?.let{throw it}
            if(omitMetrics)SessionStore.update(false){it.remove("timings")}
            callback.onStage(0);callback.onStage(1)
            for(stage in 0..4)callback.onTiming(stage,1.0)
            ShadowSystemClock.advanceBy(Duration.ofSeconds(1))
            if(cancelAt=="progress")SessionStore.update{it.put("state","CANCELLING")}
            if(!callback.onProgress(1,2))return 1
            if(!callback.onProgress(1,2))return 1
            if(!callback.onProgress(2,2))return 1
            if(cancelAt=="after")SessionStore.update{it.put("state","CANCELLING")}
            return codes.removeAt(0)
        }
    }
    private fun run(files:Files=Files(),backend:Backend=Backend()):JSONObject {
        ImageProcessor(ctx,{}, {timeout},backend,files).process()
        assertTrue(files.bitmaps.all{it.isRecycled})
        return SessionStore.snapshot()
    }
    @Test fun legacyBackendAdapterPreservesModeAndExecutionArguments() {
        val input=Bitmap.createBitmap(2,2,Bitmap.Config.ARGB_8888)
        val output=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888)
        val modes=mutableListOf<Boolean>()
        val backend=object:ProcessingBackend {
            override fun gpuAvailable()=false
            override fun process(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,fast:Boolean,testGPU:Boolean):Int {
                assertSame(ctx,context);assertFalse(gpu);assertEquals(64,tile);assertTrue(testGPU)
                modes.add(fast);return 7
            }
        }
        try {
            for(mode in listOf("fast","quality"))assertEquals(7,backend.processProfile(ctx,input,output,false,64,object:ProgressCallback{override fun onProgress(done:Int,total:Int)=true},mode,true))
            assertEquals(listOf(true,false),modes)
        }finally{input.recycle();output.recycle()}
    }
    @Test fun newPresetsKeepTargetSizeAndBoundFastInput() {
        for(profile in ProcessingProfiles.presets)for(speed in listOf("quality","fast"))for(scale in listOf(2,4)) {
            SessionStore.update{it.put("state","PREPARING").put("profileId",profile).put("speed",speed).put("mode",profile).put("scale",scale)}
            val files=Files().apply{bounds=8*scale to 8*scale;dynamicOutput=true}
            assertEquals("SUCCEEDED",run(files).getString("state"))
        }
        // A very wide but low-area source exercises downsampling and source ownership.
        for(size in listOf(600 to 2,2 to 600,600 to 1,1 to 600)) {
            SessionStore.update{it.put("state","PREPARING").put("profileId","standard").put("speed","fast").put("mode","standard").put("scale",2)}
            val files=Files().apply{inputSize=size;bounds=size.first*2 to size.second*2;dynamicOutput=true}
            val state=run(files);assertEquals("SUCCEEDED",state.getString("state"));assertEquals(512,kotlin.math.max(state.getInt("aiInputWidth"),state.getInt("aiInputHeight")))
        }
        SessionStore.update{it.put("state","PREPARING").put("profileId","sharp").put("speed","quality").put("mode","sharp").put("scale",4)}
        var notices=0
        ImageProcessor(ctx,{if(++notices==6)timeout=true},{timeout},Backend(),Files()).process()
        assertEquals("TIME_LIMIT",SessionStore.snapshot().getString("error"))
        timeout=false;notices=0;SessionStore.update{it.put("state","PREPARING")}
        ImageProcessor(ctx,{if(++notices==6)SessionStore.update{it.put("state","CANCELLING")}},{false},Backend(),Files()).process()
        assertEquals("CANCELLED",SessionStore.snapshot().getString("state"))
    }
    @Test fun profilesPixelCancellationAndBothScales() {
        for(mode in ProcessingProfiles.modes){assertTrue(ProcessingProfiles.model(mode).isNotEmpty());assertTrue(ProcessingProfiles.nativeId(mode) in 0..4)}
        SessionStore.update{it.put("mode","fast").put("state","PREPARING")};assertEquals("SUCCEEDED",run().getString("state"))
        for(scale in listOf(2,4)) {
            SessionStore.update{it.put("mode","pixel").put("scale",scale).put("state","PREPARING")}
            val files=Files().apply{bounds=8*scale to 8*scale}
            assertEquals("SUCCEEDED",run(files).getString("state"))
        }
        SessionStore.update{it.put("mode","pixel").put("state","PREPARING")};timeout=true;assertEquals("TIME_LIMIT",run().getString("error"));timeout=false
        SessionStore.update{it.put("mode","pixel").put("state","PREPARING")}
        var notices=0
        ImageProcessor(ctx,{if(notices++==1)SessionStore.update{it.put("state","CANCELLING")}}, {false},Backend(),Files()).process()
        assertEquals("CANCELLED",SessionStore.snapshot().getString("state"))
    }
    @Test fun successBothScalesAndMetrics() {
        for(scale in listOf(2,4)) {
            SessionStore.update{it.put("scale",scale).put("state","PREPARING")}
            val backend=Backend().apply{omitMetrics=true}
            val snapshot=run(backend=backend)
            assertEquals("SUCCEEDED",snapshot.getString("state"));assertEquals(scale*8,snapshot.getInt("resultWidth"));assertEquals(100,snapshot.getInt("progress"));assertEquals(1.0,snapshot.getJSONObject("timings").getDouble("inferenceMs"),0.0)
        }
    }
    @Test fun controlledFallbackAndLowMemoryRetry() {
        for(codes in listOf(listOf(-3,0),listOf(-5,0),listOf(-3,-5,0),listOf(-5,-3,0))) {
            SessionStore.update{it.put("state","PREPARING")};val backend=Backend().apply{gpu=true;this.codes=codes.toMutableList()}
            assertEquals("SUCCEEDED",run(backend=backend).getString("state"));assertEquals(codes.size,backend.attempts.size)
            if(codes.contains(-3))assertEquals(false,backend.attempts.last().first)
            if(codes.contains(-5))assertEquals(32,backend.attempts.last().second)
        }
    }
    @Test fun inferenceFailuresAndThrownErrorsKeepNoPartialResult() {
        for((code,error) in listOf(-3 to "INFERENCE_FAILED",-4 to "MODEL_INVALID",-5 to "LOW_MEMORY",-6 to "INFERENCE_FAILED",1 to "")) {
            SessionStore.update{it.put("state","PREPARING")};val backend=Backend().apply{codes=mutableListOf(code,code)}
            val result=run(backend=backend);assertEquals(error,result.getString("error"));assertEquals(if(code==1)"CANCELLED" else "FAILED",result.getString("state"))
        }
        for(error in listOf(OutOfMemoryError(),IllegalStateException(),AppFailure("LOW_STORAGE"))) {
            SessionStore.update{it.put("state","PREPARING")};val result=run(backend=Backend().apply{failure=error});assertEquals(if(error is OutOfMemoryError)"LOW_MEMORY" else if(error is AppFailure)"LOW_STORAGE" else "INFERENCE_FAILED",result.getString("error"))
        }
    }
    @Test fun decodeValidationWritingAndPublishFailures() {
        for(fail in listOf("prepare","decode","memory","write","preview")) {
            SessionStore.update{it.put("state","PREPARING")};assertEquals("FAILED",run(Files().apply{this.fail=fail}).getString("state"))
        }
        for(bounds in listOf(1 to 32,32 to 1)) {SessionStore.update{it.put("state","PREPARING")};assertEquals("INFERENCE_FAILED",run(Files().apply{this.bounds=bounds}).getString("error"))}
        SessionStore.update{it.put("state","PREPARING")};assertEquals("INFERENCE_FAILED",run(Files().apply{empty=true}).getString("error"))
    }
    @Test fun diskFailureStillPublishesTerminalStateAndLateTimeoutIsHonest() {
        val journalField=SessionStore::class.java.getDeclaredField("journal").apply{isAccessible=true}
        val original=journalField.get(SessionStore)
        val failed=object:android.util.AtomicFile(File(ctx.filesDir,"failed-journal")) {
            override fun startWrite():java.io.FileOutputStream {throw java.io.IOException("controlled full disk")}
        }
        journalField.set(SessionStore,failed)
        assertEquals("FAILED",run().getString("state"));assertFalse(SessionStore.busy())
        journalField.set(SessionStore,original)
        for(stage in listOf("write","preview")) {
            timeout=false;SessionStore.update{it.put("state","PREPARING")}
            val files=Files().apply{hook={if(it==stage){timeout=true;SessionStore.update{j->j.put("state","CANCELLING")}}}}
            assertEquals("TIME_LIMIT",run(files).getString("error"))
        }
    }
    @Test fun cancellationAtEachOwnershipBoundaryAndTimeout() {
        SessionStore.update{it.put("state","CANCELLING")};assertEquals("CANCELLED",run().getString("state"))
        for(stage in listOf("device","progress","after")) {SessionStore.update{it.put("state","PREPARING")};assertEquals("CANCELLED",run(backend=Backend().apply{cancelAt=stage}).getString("state"))}
        for(stage in listOf("write","preview")) {SessionStore.update{it.put("state","PREPARING")};assertEquals("CANCELLED",run(Files().apply{cancelAt=stage}).getString("state"))}
        for(stage in listOf("progress","write","preview")) {SessionStore.update{it.put("state","PREPARING")};timeout=stage!="progress";val backend=Backend();if(stage=="progress")timeout=true;assertEquals("TIME_LIMIT",run(Files().apply{cancelAt=stage},backend).getString("error"))}
    }
}
