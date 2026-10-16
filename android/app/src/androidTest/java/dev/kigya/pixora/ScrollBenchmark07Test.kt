package dev.kigya.pixora

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Same real inference/scroll scenario for before and after. No app profiling hooks. */
@RunWith(AndroidJUnit4::class)
class ScrollBenchmark07Test {
    @Test fun scrollDuringCpuAndGpuInference() {
        val ins=InstrumentationRegistry.getInstrumentation(); val ctx=ins.targetContext
        val ui=ins.uiAutomation;val args=InstrumentationRegistry.getArguments()
        val gpu=args.getString("backend","GPU")=="GPU"
        SessionStore.init(ctx);SessionStore.discard();NativeEngine.resetCancellation()
        val bitmap=Bitmap.createBitmap(512,384,Bitmap.Config.ARGB_8888)
        for(y in 0 until 384)for(x in 0 until 512)bitmap.setPixel(x,y,Color.rgb(x%256,y%256,(x+y)%256))
        val file=File(ctx.cacheDir,"07-scroll-input.png");ImageFiles.write(bitmap,file,"png");bitmap.recycle()
        SessionStore.replace(ImageFiles.import(ctx,Uri.fromFile(file)))
        SessionStore.update{it.put("jobId",UUID.randomUUID().toString()).put("state","PREPARING").put("profileId","standard").put("mode","standard").put("speed","quality").put("modelId",ProcessingProfiles.model("standard")).put("scale",4).put("startedAt",System.currentTimeMillis()).put("timings",JSONObject())}
        val activity=ins.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val backend=object:ProcessingBackend by OnDeviceBackend {override fun gpuAvailable()=gpu && OnDeviceBackend.gpuAvailable()}
        val worker=Thread{ImageProcessor(ctx,{},{false},backend).process()}
        try {
            worker.start();val deadline=System.currentTimeMillis()+30000
            while(SessionStore.snapshot().optString("state")!="RUNNING" && System.currentTimeMillis()<deadline)Thread.sleep(100)
            assertEquals("RUNNING",SessionStore.snapshot().getString("state"))
            assertEquals(if(gpu)"GPU" else "CPU",SessionStore.snapshot().getString("backend"))
            Thread.sleep(2000)
            for(series in 1..3) {
                ui.executeShellCommand("dumpsys gfxinfo ${ctx.packageName} reset").use{android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()}
                val end=SystemClock.uptimeMillis()+30000;var down=false
                while(SystemClock.uptimeMillis()<end) {
                    val display=ctx.resources.displayMetrics;val x=display.widthPixels*.5f
                    val from=display.heightPixels*(if(down).35f else .75f);val to=display.heightPixels*(if(down).75f else .35f)
                    val start=SystemClock.uptimeMillis()
                    fun event(action:Int,y:Float){val e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,x,y,0);try{ui.injectInputEvent(e,true)}finally{e.recycle()}}
                    event(MotionEvent.ACTION_DOWN,from)
                    for(step in 1..12){Thread.sleep(20);event(MotionEvent.ACTION_MOVE,from+(to-from)*step/12)}
                    event(MotionEvent.ACTION_UP,to);down=!down;Thread.sleep(200)
                }
                val stats=ui.executeShellCommand("dumpsys gfxinfo ${ctx.packageName} framestats").use{android.os.ParcelFileDescriptor.AutoCloseInputStream(it).bufferedReader().readText()}
                File(ctx.getExternalFilesDir(null),"scroll07-${args.getString("phase","baseline")}-${if(gpu)"gpu" else "cpu"}-$series.txt").writeText(stats)
                println("series=$series backend=${SessionStore.snapshot().optString("backend")} state=${SessionStore.snapshot().optString("state")}")
                assertTrue("Inference stays active through measurement",SessionStore.busy())
            }
        }finally{SessionStore.update{it.put("state","CANCELLING")};NativeEngine.cancel();worker.join(60000);assertFalse(worker.isAlive);ins.runOnMainSync{activity.finish()};file.delete();SessionStore.discard()}
    }
}
