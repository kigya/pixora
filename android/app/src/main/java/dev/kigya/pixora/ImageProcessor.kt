package dev.kigya.pixora

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import java.io.File
import kotlin.math.min

/** Owns image buffers for one job; the service owns lifetime and notifications. */
class ImageProcessor(private val context:Context, private val notice:(Boolean)->Unit, private val timedOut:()->Boolean, private val backend:ProcessingBackend=OnDeviceBackend, private val files:WorkFiles=AndroidWorkFiles) {
    private var lastProgress=0L
    private lateinit var estimate:TimeEstimator
    fun process() {
        var input: Bitmap?=null; var full: Bitmap?=null; var result: Bitmap?=null; var original:Bitmap?=null
        val start=SystemClock.elapsedRealtime()
        val snapshot=SessionStore.snapshot(); val image=snapshot.getJSONObject("image"); val dir=File(image.getString("sourcePath")).parentFile!!
        val partial=File(dir,"result.png")
        try {
            if(SessionStore.snapshot().getString("state")=="CANCELLING") throw AppFailure("CANCELLED")
            SessionStore.update{it.put("phase","preparing_image").put("completedTiles",0).put("totalTiles",0)}
            if(snapshot.optString("resolution")=="original"){OriginalProcessor(context,backend,notice,timedOut).process(snapshot);return}
            val prepareStart=SystemClock.elapsedRealtime()
            val work=files.prepare(image)
            input=files.decode(work) ?: throw AppFailure("DECODE_FAILED")
            original=input
            val profile=snapshot.optString("profileId")
            val speed=snapshot.optString("speed","quality")
            val targetWidth=input.width*snapshot.getInt("scale");val targetHeight=input.height*snapshot.getInt("scale")
            if(profile.isNotEmpty() && profile!="pixel" && speed=="fast") {
                val size=ProcessingProfiles.inputSize(input.width,input.height,speed)
                if(size.first!=input.width || size.second!=input.height)input=Bitmap.createScaledBitmap(input,size.first,size.second,true)
            }
            full=files.createOutput(input)
            SessionStore.update{it.put("aiInputWidth",input.width).put("aiInputHeight",input.height)}
            SessionStore.update{it.put("phase","checking_device");it.getJSONObject("timings").put("prepareMs",SystemClock.elapsedRealtime()-prepareStart)}
            val pixel=snapshot.optString("mode")=="pixel"
            var gpu=!pixel && backend.gpuAvailable()
            if(SessionStore.snapshot().getString("state")=="CANCELLING") throw AppFailure("CANCELLED")
            SessionStore.update{it.put("state","RUNNING").put("backend",if(gpu)"GPU" else "CPU").put("progress",0); it.getJSONObject("image").put("workPath",work.path)}
            notice(true)
            var tile=if(gpu)128 else 64
            var usedSmallTile=false
            var code=if(pixel)pixelScale(input,full) else runModel(input,full,gpu,tile,start,targetWidth.toLong()*targetHeight)
            while((code==-3 && gpu) || (code==-5 && !usedSmallTile)) {
                full.eraseColor(0)
                if(code==-3) {
                    gpu=false;tile=if(usedSmallTile)32 else 64
                    SessionStore.update{it.put("backend","CPU").put("progress",0).put("error","GPU_FAILED")};notice(true)
                } else {
                    usedSmallTile=true;tile=32
                    SessionStore.update{it.put("progress",0)}
                }
                code=runModel(input,full,gpu,tile,start,targetWidth.toLong()*targetHeight)
            }
            if(code==1 || SessionStore.snapshot().getString("state")=="CANCELLING") throw AppFailure(if(timedOut())"TIME_LIMIT" else "CANCELLED")
            if(code!=0) throw AppFailure(when(code){-4->"MODEL_INVALID";-5->"LOW_MEMORY";else->"INFERENCE_FAILED"})
            SessionStore.update{it.put("state","FINALIZING").put("phase","building_result").put("progress",-1).put("error","")}; notice(true)
            val resultStart=SystemClock.elapsedRealtime()
            result=if(profile.isNotEmpty()) {if(full.width==targetWidth && full.height==targetHeight)full else Bitmap.createScaledBitmap(full,targetWidth,targetHeight,!pixel)} else if(snapshot.getInt("scale")==2) {if(pixel)Bitmap.createScaledBitmap(full,full.width/2,full.height/2,false) else files.half(full)} else full
            PresetFinisher.apply(result,original,profile){timedOut() || SessionStore.snapshot().optString("state")=="CANCELLING"}
            SessionStore.update{it.remove("remainingLowMs");it.remove("remainingHighMs");it.put("phase","writing_result");it.getJSONObject("timings").put("resizeMs",SystemClock.elapsedRealtime()-resultStart)}
            val writeStart=SystemClock.elapsedRealtime()
            files.write(result,partial)
            val bounds=files.dimensions(partial)
            if(bounds.first!=result.width || bounds.second!=result.height || partial.length()==0L) throw AppFailure("INFERENCE_FAILED")
            if(SessionStore.snapshot().getString("state")=="CANCELLING") throw AppFailure(if(timedOut())"TIME_LIMIT" else "CANCELLED")
            val uri=files.preview(result,dir)
            synchronized(SessionStore.lock) {
                if(SessionStore.snapshot().getString("state")=="CANCELLING") throw AppFailure(if(timedOut())"TIME_LIMIT" else "CANCELLED")
                SessionStore.update{it.put("state","SUCCEEDED").put("phase","complete").put("progress",100).put("resultPath",partial.path).put("resultUri",uri)
                    .put("timings",it.getJSONObject("timings").put("writeAndPreviewMs",SystemClock.elapsedRealtime()-writeStart)).put("resultWidth",result.width).put("resultHeight",result.height).put("elapsedMs",SystemClock.elapsedRealtime()-start).put("error","")}
            }
            if(!pixel) {val metrics=SessionStore.snapshot().getJSONObject("timings");estimate.remember(metrics.optDouble("inferenceMs",0.0)+metrics.optDouble("preprocessingMs",0.0)+metrics.optDouble("assemblyMs",0.0),metrics.optLong("resizeMs",0)+metrics.optLong("writeAndPreviewMs",0),metrics.optDouble("modelLoadMs",0.0)+metrics.optDouble("gpuCheckMs",0.0))}
        } catch(e: Throwable) {
            partial.delete(); File(dir,"result.png.partial").delete(); File(dir,"after.png").delete()
            val code=if(e is AppFailure){if(e.code=="CANCELLED" && timedOut())"TIME_LIMIT" else e.code} else if(e is OutOfMemoryError)"LOW_MEMORY" else "INFERENCE_FAILED"
            val terminal:(org.json.JSONObject)->Unit={it.put("state",if(code=="CANCELLED")"CANCELLED" else "FAILED").put("error",if(code=="CANCELLED")"" else code)
                .put("progress",-1).put("elapsedMs",SystemClock.elapsedRealtime()-start)}
            SessionStore.updateProcessingState(terminal)
        } finally {
            releaseBitmaps(result,full,input)
            if(original!=null && original !== input)original.recycle()
        }
    }
    private fun pixelScale(input:Bitmap,output:Bitmap):Int {
        SessionStore.update{it.put("phase","upscaling")};notice(true)
        val source=IntArray(input.width);val row=IntArray(output.width)
        for(y in 0 until input.height) {
            if(timedOut() || SessionStore.snapshot().optString("state")=="CANCELLING")return 1
            input.getPixels(source,0,input.width,0,y,input.width,1)
            for(x in source.indices)for(i in 0..3)row[x*4+i]=source[x]
            for(i in 0..3)output.setPixels(row,0,output.width,0,y*4+i,output.width,1)
            val now=SystemClock.elapsedRealtime()
            if(now-lastProgress>=250 || y==input.height-1){lastProgress=now;SessionStore.update(false){it.put("progress",min(99.0,(y+1.0)/input.height*100))};notice(false)}
        }
        return 0
    }
    private fun releaseBitmaps(result:Bitmap?,full:Bitmap?,input:Bitmap?) {
        if(result!=null && result !== full)result.recycle()
        full?.recycle();input?.recycle()
    }
    private fun runModel(input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,start:Long,outputPixels:Long):Int {
        val state=SessionStore.snapshot()
        val tracker=TimeEstimator(context,state.optString("modelId"),if(gpu)"GPU" else "CPU",input.width,input.height,tile,state.optString("profileId",state.optString("mode")),state.optString("speed","quality"),state.optInt("scale",4),outputPixels){SystemClock.elapsedRealtime()-start}
        estimate=tracker
        return backend.processProfile(context,input,output,gpu,tile,object:ProgressCallback {
        override fun onTiming(stage:Int,milliseconds:Double) {
            val key=listOf("modelLoadMs","gpuCheckMs","preprocessingMs","inferenceMs","assemblyMs")[stage]
            SessionStore.update(false){val metrics=it.optJSONObject("timings") ?: org.json.JSONObject().also{m->it.put("timings",m)};metrics.put(key,milliseconds)}
        }
        override fun onStage(stage:Int) { tracker.begin(stage==0); SessionStore.update{if(stage==0)it.put("completedTiles",0).put("totalTiles",0);it.put("phase",if(stage==0)"loading_model" else "upscaling").put("progress",if(stage==0)-1 else 0)};notice(true) }
        override fun onProgress(done:Int,total:Int):Boolean {
            if(timedOut() || SessionStore.snapshot().getString("state")=="CANCELLING") return false
            tracker.tileDone(done)
            val now=SystemClock.elapsedRealtime()
            if(now-lastProgress>=250 || done==total) {
                lastProgress=now;SessionStore.update(false){it.put("restrictAnimation",MotionPolicy.restricted(context)).put("phase","upscaling").put("completedTiles",done).put("totalTiles",total).put("progress",min(99.0,done.toDouble()/total*100)).put("elapsedMs",now-start)};notice(false)
            }
            return true
        }
    },SessionStore.snapshot().optString("mode","quality"),gpu)
    }
}
