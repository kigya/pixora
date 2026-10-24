package dev.kigya.pixora

import android.content.Context
import android.graphics.*
import android.os.SystemClock
import org.json.JSONObject
import java.io.File
import kotlin.math.*

/** Disk boundary permits deterministic failure/cancellation checks without device storage faults. */
interface OriginalRaster {
    fun create(path:String,width:Int,height:Int):Int
    fun write(path:String,width:Int,height:Int,bitmap:Bitmap,x:Int,y:Int,cx:Int,cy:Int,cw:Int,ch:Int):Int
    fun finish(path:String,png:String,width:Int,height:Int,callback:ProgressCallback):Int
}
object LocalOriginalRaster:OriginalRaster {
    override fun create(path:String,width:Int,height:Int)=NativeEngine.createRaster(path,width,height)
    override fun write(path:String,width:Int,height:Int,bitmap:Bitmap,x:Int,y:Int,cx:Int,cy:Int,cw:Int,ch:Int)=NativeEngine.writeRaster(path,width,height,bitmap,x,y,cx,cy,cw,ch)
    override fun finish(path:String,png:String,width:Int,height:Int,callback:ProgressCallback)=NativeEngine.finishRaster(path,png,width,height,callback)
}

/** Owns at most one padded source region and its 4x result, never a full-size Bitmap. */
class OriginalProcessor(private val context:Context,private val backend:ProcessingBackend,private val notice:(Boolean)->Unit,private val timedOut:()->Boolean,private val raster:OriginalRaster=LocalOriginalRaster) {
    companion object {
        fun allowed(w:Int,h:Int,scale:Int)=w>0 && h>0 && scale in setOf(2,4) && w.toLong()*scale<=16384 && h.toLong()*scale<=16384 && w.toLong()*h*scale*scale<=64_000_000L
    }
    private fun cancelled()=timedOut() || SessionStore.snapshot().optString("state")=="CANCELLING"
    private fun checkCancellation(){if(cancelled())throw AppFailure(if(timedOut())"TIME_LIMIT" else "CANCELLED")}
    private fun checked(code:Int){if(code==1)throw AppFailure(if(timedOut())"TIME_LIMIT" else "CANCELLED");if(code!=0)throw AppFailure(when(code){-4->"MODEL_INVALID";-5->"LOW_MEMORY";-7->"LOW_STORAGE";else->"INFERENCE_FAILED"})}
    fun process(job:JSONObject) {
        val started=SystemClock.elapsedRealtime();val image=job.getJSONObject("image");val source=File(image.getString("sourcePath"));val folder=source.parentFile!!
        val width=image.getInt("width");val height=image.getInt("height");val scale=job.getInt("scale");val ow=width*scale;val oh=height*scale
        if(!allowed(width,height,scale))throw AppFailure("DIMENSIONS_TOO_LARGE")
        val raw=File(folder,"original.rgba.partial");val png=File(folder,"result.png.partial");val result=File(folder,"result.png")
        @Suppress("DEPRECATION")
        val decoder=BitmapRegionDecoder.newInstance(source.path,false) ?: throw AppFailure("DECODE_FAILED")
        try {
            val orientation=ImageFiles.orientation(source)
            val transform=ImageFiles.matrix(orientation)
            val bounds=RectF(0f,0f,decoder.width.toFloat(),decoder.height.toFloat());transform.mapRect(bounds)
            if(bounds.width().roundToInt()!=width || bounds.height().roundToInt()!=height)throw AppFailure("DECODE_FAILED")
            transform.postTranslate(-bounds.left,-bounds.top)
            // ImageFiles.matrix only produces invertible EXIF rotations/reflections.
            val inverse=Matrix();transform.invert(inverse)
            val profile=job.getString("profileId");val pixel=profile=="pixel";val padding=ProcessingProfiles.padding(profile)
            var gpu=!pixel && backend.gpuAvailable();var tile=if(gpu)128 else 64;var retriedSmall=false
            while(true) {
                checkCancellation();checked(raster.create(raw.path,ow,oh))
                SessionStore.update{it.put("state","RUNNING").put("backend",if(gpu)"GPU" else "CPU").put("aiInputWidth",width).put("aiInputHeight",height).put("phase","upscaling").put("progress",0)};notice(true)
                val countX=(width+255)/256;val countY=(height+255)/256;val total=countX*countY
                var code=0;var last=0L
                outer@for(ty in 0 until countY)for(tx in 0 until countX) {
                    checkCancellation()
                    val x=tx*256;val y=ty*256;val right=min(width,x+256);val bottom=min(height,y+256)
                    val left=max(0,x-padding);val top=max(0,y-padding);val r=min(width,right+padding);val b=min(height,bottom+padding)
                    val rect=RectF(left.toFloat(),top.toFloat(),r.toFloat(),b.toFloat());inverse.mapRect(rect)
                    val nativeRect=Rect(floor(rect.left+.001f).toInt(),floor(rect.top+.001f).toInt(),ceil(rect.right-.001f).toInt(),ceil(rect.bottom-.001f).toInt())
                    val decoded=decoder.decodeRegion(nativeRect,BitmapFactory.Options().apply{inPreferredConfig=Bitmap.Config.ARGB_8888;inPreferredColorSpace=ColorSpace.get(ColorSpace.Named.SRGB)}) ?: throw AppFailure("DECODE_FAILED")
                    // Identity transforms/scales may return the same Bitmap. Own each reference once.
                    val owned=linkedSetOf(decoded)
                    try {
                        val input=Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,ImageFiles.matrix(orientation),false).also{owned.add(it)}
                        if(input.width!=r-left || input.height!=b-top)throw AppFailure("DECODE_FAILED")
                        val ordinal=ty*countX+tx
                        val full=(if(pixel)Bitmap.createScaledBitmap(input,input.width*4,input.height*4,false) else Bitmap.createBitmap(input.width*4,input.height*4,Bitmap.Config.ARGB_8888).apply{setHasAlpha(input.hasAlpha())}).also{owned.add(it)}
                        if(!pixel)code=backend.processProfile(context,input,full,gpu,tile,object:ProgressCallback {
                            override fun onProgress(done:Int,innerTotal:Int):Boolean {
                                if(cancelled())return false
                                val now=SystemClock.elapsedRealtime()
                                if(now-last>=250){last=now;SessionStore.update(false){it.put("phase","upscaling").put("completedTiles",ordinal).put("totalTiles",total).put("progress",min(99.0,(ordinal+done.toDouble()/innerTotal)/total*100)).put("elapsedMs",now-started)};notice(false)}
                                return true
                            }
                        },profile,gpu && ordinal==0)
                        if(code!=0)break@outer
                        val final=(if(scale==4)full else Bitmap.createScaledBitmap(full,input.width*2,input.height*2,!pixel)).also{owned.add(it)}
                        PresetFinisher.apply(final,input,profile){cancelled()}
                        checkCancellation();checked(raster.write(raw.path,ow,oh,final,x*scale,y*scale,(x-left)*scale,(y-top)*scale,(right-x)*scale,(bottom-y)*scale))
                        SessionStore.update(false){it.put("completedTiles",ordinal+1).put("totalTiles",total).put("progress",min(99.0,(ordinal+1.0)/total*100))}
                    } finally {owned.forEach{it.recycle()}}
                }
                if(code==-3 && gpu){gpu=false;tile=if(retriedSmall)32 else 64;SessionStore.update{it.put("error","GPU_FAILED")};continue}
                if(code==-5 && !retriedSmall){retriedSmall=true;tile=32;continue}
                checked(code);break
            }
            checkCancellation();SessionStore.update{it.put("state","FINALIZING").put("phase","writing_result").put("progress",-1)};notice(true)
            checked(raster.finish(raw.path,png.path,ow,oh,object:ProgressCallback{override fun onProgress(done:Int,total:Int)=!cancelled()}))
            checkCancellation();if(png.length()==0L)throw AppFailure("INFERENCE_FAILED")
            val dimensions=AndroidWorkFiles.dimensions(png);if(dimensions.first!=ow || dimensions.second!=oh)throw AppFailure("INFERENCE_FAILED")
            if(!png.renameTo(result))throw AppFailure("LOW_STORAGE")
            val preview=ImageFiles.decode(result,max(1,(ow*min(1.0,1536.0/max(ow,oh))).toInt()),max(1,(oh*min(1.0,1536.0/max(ow,oh))).toInt()))
            val uri=try{ImageFiles.preview(preview,folder)}finally{preview.recycle()}
            synchronized(SessionStore.lock){checkCancellation();SessionStore.update{it.put("state","SUCCEEDED").put("phase","complete").put("progress",100).put("resultPath",result.path).put("resultUri",uri).put("resultWidth",ow).put("resultHeight",oh).put("elapsedMs",SystemClock.elapsedRealtime()-started).put("error","")}}
        } finally {decoder.recycle();raw.delete();png.delete()}
    }
}
