package dev.kigya.pixora

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Debug
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

@RunWith(AndroidJUnit4::class)
class FullPipelineBenchmarkTest {
    @Test fun measurePreparedJobAndFile() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val ctx=instrumentation.targetContext
        val args=InstrumentationRegistry.getArguments()
        val size=args.getString("size")?.toInt() ?: 512
        val scale=args.getString("scale")?.toInt() ?: 4
        val height=args.getString("height")?.toInt() ?: size*3/4
        val repeats=args.getString("repeats")?.toInt() ?: 3
        val modes=(args.getString("modes") ?: "quality,fast").split(",")
        val samples=JSONArray()
        val activity=instrumentation.startActivitySync(android.content.Intent(ctx,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        SessionStore.init(ctx)
        val speeds=(args.getString("speeds") ?: "quality").split(",")
        for(mode in modes)for(speed in speeds)repeat(repeats) { iteration ->
            val fixture=Bitmap.createBitmap(size,height,Bitmap.Config.ARGB_8888)
            for(y in 0 until fixture.height)for(x in 0 until fixture.width)fixture.setPixel(x,y,Color.rgb((x*3+y)%256,(y*5)%256,(x+y*2)%256))
            val source=File(ctx.cacheDir,"benchmark-source.png")
            ImageFiles.write(fixture,source,"png");fixture.recycle()
            val temperature=ctx.registerReceiver(null,android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))?.getIntExtra("temperature",-1) ?: -1
            val thermal=ctx.getSystemService(android.os.PowerManager::class.java).currentThermalStatus
            val running=java.util.concurrent.atomic.AtomicBoolean(true)
            val peak=java.util.concurrent.atomic.AtomicLong(0)
            val monitor=Thread {while(running.get()){peak.accumulateAndGet(Debug.getPss(),Math::max);Thread.sleep(250)}}.apply{start()}
            val started=SystemClock.elapsedRealtime()
            val image=ImageFiles.import(ctx,Uri.fromFile(source));SessionStore.replace(image)
            SessionStore.update{it.put("state","PREPARING").put("jobId","benchmark-$mode-$iteration").put("profileId",if(mode in ProcessingProfiles.presets)mode else "").put("speed",speed).put("mode",mode).put("modelId",ProcessingProfiles.model(mode)).put("scale",scale).put("startedAt",System.currentTimeMillis()).put("timings",JSONObject())}
            ImageProcessor(ctx,{}, {false}).process()
            val finished=SystemClock.elapsedRealtime()
            running.set(false);monitor.join()
            val result=SessionStore.snapshot()
            val memory=Debug.MemoryInfo().also{Debug.getMemoryInfo(it)}
            assertEquals(result.toString(),"SUCCEEDED",result.getString("state"))
            assertEquals(size*scale,result.getInt("resultWidth"));assertEquals(height*scale,result.getInt("resultHeight"))
            samples.put(JSONObject().put("mode",mode).put("speed",speed).put("width",size).put("height",height).put("scale",scale).put("iteration",iteration).put("backend",result.getString("backend")).put("totalMs",finished-started).put("timings",result.getJSONObject("timings")).put("pssKiB",memory.totalPss).put("peakPssKiB",peak.get()).put("batteryTemperatureTenthsC",temperature).put("thermalStatus",thermal))
            File(ctx.getExternalFilesDir(null),"full-pipeline-benchmark.json").writeText(samples.toString(2))
            android.util.Log.i("UpseloraBenchmark",samples.getJSONObject(samples.length()-1).toString())
            source.delete()
        }
    }
}
