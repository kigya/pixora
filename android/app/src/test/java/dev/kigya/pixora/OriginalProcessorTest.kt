package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OriginalProcessorTest {
 private lateinit var ctx:Context
 @Before fun setup(){ctx=RuntimeEnvironment.getApplication();reset();ctx.filesDir.deleteRecursively();ctx.filesDir.mkdirs();SessionStore.init(ctx)}
 @After fun reset(){for(name in listOf("context","journal"))SessionStore::class.java.getDeclaredField(name).apply{isAccessible=true}.set(SessionStore,null);SessionStore.listeners.clear();SessionStore.workerAlive=false;SessionStore.serviceAlive=false}
 private fun seed(profile:String="standard",scale:Int=2):JSONObject {
  SessionStore.update{it.put("state","EMPTY")}
  val source=File(ctx.filesDir,"sessions/${java.util.UUID.randomUUID()}/source");source.parentFile!!.mkdirs()
  val bitmap=Bitmap.createBitmap(270,258,Bitmap.Config.ARGB_8888);bitmap.eraseColor(0xff4080c0.toInt());ImageFiles.write(bitmap,source,"png");bitmap.recycle()
  SessionStore.replace(JSONObject().put("id","original").put("sourcePath",source.path).put("width",270).put("height",258).put("workWidth",270).put("workHeight",258))
  SessionStore.update{it.put("state","PREPARING").put("profileId",profile).put("mode",profile).put("resolution","original").put("speed","quality").put("scale",scale)}
  return SessionStore.snapshot()
 }
 private class Backend:ProcessingBackend {
  val attempts=mutableListOf<Pair<Boolean,Int>>();val failures=mutableListOf<Int>();var stop=false;var gpu=true;var progressAction:()->Unit={};var fail:Throwable?=null
  override fun gpuAvailable()=gpu
  override fun process(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,fast:Boolean,testGPU:Boolean)=0
  override fun processProfile(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,mode:String,testGPU:Boolean):Int {
   attempts.add(gpu to tile);fail?.let{throw it}
   if(failures.isNotEmpty())return failures.removeAt(0)
   progressAction()
   output.eraseColor(0xff4080c0.toInt());if(stop)SessionStore.update{it.put("state","CANCELLING")}
   return if(callback.onProgress(1,1))0 else 1
  }
 }
 @Test fun boundedRegionsProduceExactOutputAndARealPngWithoutWholeOutputBitmap() {
  for(profile in listOf("standard","details","sharp","balanced","pixel"))for(scale in listOf(2,4)) {
   val job=seed(profile,scale);val backend=Backend();OriginalProcessor(ctx,backend,{}, {false}).process(job)
   val result=SessionStore.snapshot();assertEquals("SUCCEEDED",result.getString("state"));val file=File(result.getString("resultPath"));assertEquals(270*scale to 258*scale,AndroidWorkFiles.dimensions(file));assertTrue(File(java.net.URI(result.getString("resultUri"))).isFile)
   if(profile=="pixel")assertTrue(backend.attempts.isEmpty())else assertEquals(4,backend.attempts.size)
   assertFalse(File(file.parentFile,"original.rgba.partial").exists());assertFalse(File(file.parentFile,"result.png.partial").exists())
  }
 }
 @Test fun gpuAndMemoryFallbackRestartTheRasterAndCancellationDoesNotPublish() {
  val job=seed();val backend=Backend();backend.failures.addAll(listOf(-5,-3));OriginalProcessor(ctx,backend,{}, {false}).process(job)
  assertEquals(listOf(true to 128,true to 32,false to 32),backend.attempts.take(3))
  val cancelled=seed();val stopping=Backend().apply{stop=true}
  try{OriginalProcessor(ctx,stopping,{}, {false}).process(cancelled);fail("cancel must stop")}catch(error:AppFailure){assertEquals("CANCELLED",error.code)}
  assertFalse(File(File(cancelled.getJSONObject("image").getString("sourcePath")).parentFile,"original.rgba.partial").exists())
 }
 @Test fun failuresAndTimeoutNeverPublishSuccess() {
  for(code in listOf(-4,-6,-5,-3)) {
   val job=seed();val backend=Backend().apply{failures.addAll(listOf(code,code))}
   try{OriginalProcessor(ctx,backend,{}, {false}).process(job);fail("failure expected")}catch(error:AppFailure){assertEquals(if(code==-4)"MODEL_INVALID" else if(code==-5)"LOW_MEMORY" else "INFERENCE_FAILED",error.code)}
  }
  val job=seed();try{OriginalProcessor(ctx,Backend(),{}, {true}).process(job);fail("timeout expected")}catch(error:AppFailure){assertEquals("TIME_LIMIT",error.code)}
 }
 private fun failure(code:String,action:()->Unit){try{action();fail("Expected $code")}catch(e:AppFailure){assertEquals(code,e.code)}}
 @Test fun sourceDimensionsDecodeAndDiskFailuresNeverPublishPartialResults() {
  val oversized=seed().apply{getJSONObject("image").put("width",8193)}
  failure("DIMENSIONS_TOO_LARGE"){OriginalProcessor(ctx,Backend(),{}, {false}).process(oversized)}
  for(key in listOf("width","height")) {
   val mismatched=seed().apply{getJSONObject("image").put(key,271)}
   failure("DECODE_FAILED"){OriginalProcessor(ctx,Backend(),{}, {false}).process(mismatched)}
  }
  for(stage in listOf("create","write","finish")) {
   val job=seed();val broken=object:OriginalRaster by LocalOriginalRaster {
    override fun create(path:String,width:Int,height:Int)=if(stage=="create")-7 else LocalOriginalRaster.create(path,width,height)
    override fun write(path:String,width:Int,height:Int,bitmap:Bitmap,x:Int,y:Int,cx:Int,cy:Int,cw:Int,ch:Int)=if(stage=="write")-7 else LocalOriginalRaster.write(path,width,height,bitmap,x,y,cx,cy,cw,ch)
    override fun finish(path:String,png:String,width:Int,height:Int,callback:ProgressCallback)=if(stage=="finish")-7 else LocalOriginalRaster.finish(path,png,width,height,callback)
   }
   failure("LOW_STORAGE"){OriginalProcessor(ctx,Backend(),{}, {false},broken).process(job)}
   val folder=File(job.getJSONObject("image").getString("sourcePath")).parentFile!!
   assertFalse(File(folder,"original.rgba.partial").exists());assertFalse(File(folder,"result.png.partial").exists())
  }
  val blocked=seed();val folder=File(blocked.getJSONObject("image").getString("sourcePath")).parentFile!!
  File(folder,"result.png").apply{mkdirs();File(this,"keep").writeText("owned")}
  failure("LOW_STORAGE"){OriginalProcessor(ctx,Backend(),{}, {false}).process(blocked)}
 }
 @Test fun cancellationAtRegionAndPngBoundariesAndCpuFallbackStayCooperative() {
  val job=seed();val backend=Backend().apply{gpu=false;progressAction={org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(300))}}
  var progress=0;OriginalProcessor(ctx,backend,{if(!it)progress++}, {false}).process(job);assertTrue(progress>0);assertEquals(false to 64,backend.attempts.first())
  val fallback=seed();val gpuBackend=Backend().apply{failures.add(-3)};OriginalProcessor(ctx,gpuBackend,{}, {false}).process(fallback);assertEquals(false to 64,gpuBackend.attempts[1])
  val beforeRegion=seed();failure("CANCELLED"){OriginalProcessor(ctx,Backend(),{if(it)SessionStore.update{j->j.put("state","CANCELLING")}}, {false}).process(beforeRegion)}
  val timeoutJob=seed();var timeout=false;val timingBackend=Backend().apply{progressAction={timeout=true}}
  failure("TIME_LIMIT"){OriginalProcessor(ctx,timingBackend,{}, {timeout}).process(timeoutJob)}
  for(timeoutInPng in listOf(false,true)) {
   val pngJob=seed();var expired=false
   val finishing=object:OriginalRaster by LocalOriginalRaster {
    override fun finish(path:String,png:String,width:Int,height:Int,callback:ProgressCallback):Int {
     expired=timeoutInPng
     if(!timeoutInPng)SessionStore.update{it.put("state","CANCELLING")}
     assertFalse(callback.onProgress(0,1));return 1
    }
   }
   failure(if(timeoutInPng)"TIME_LIMIT" else "CANCELLED"){OriginalProcessor(ctx,Backend(),{}, {expired},finishing).process(pngJob)}
  }
  val cancelledAfter=seed();val finishing=object:OriginalRaster by LocalOriginalRaster {
   override fun finish(path:String,png:String,width:Int,height:Int,callback:ProgressCallback):Int {
    val result=LocalOriginalRaster.finish(path,png,width,height,callback);SessionStore.update{it.put("state","CANCELLING")};return result
   }
  }
  failure("CANCELLED"){OriginalProcessor(ctx,Backend(),{}, {false},finishing).process(cancelledAfter)}
 }
 @Test fun invalidFinishedPngAndOuterProcessorErrorsUseExistingTerminalStates() {
  for(kind in listOf("width","height","empty")) {
   val job=seed();val invalid=object:OriginalRaster by LocalOriginalRaster {
    override fun finish(path:String,png:String,width:Int,height:Int,callback:ProgressCallback):Int {
     val bitmap=Bitmap.createBitmap(if(kind=="width")1 else width,if(kind=="height")1 else height,Bitmap.Config.ARGB_8888)
     ImageFiles.write(bitmap,File(png),"png");bitmap.recycle()
     if(kind=="empty")File(png).writeBytes(byteArrayOf())
     return 0
    }
   }
   failure("INFERENCE_FAILED"){OriginalProcessor(ctx,Backend(),{}, {false},invalid).process(job)}
  }
  seed();ImageProcessor(ctx,{}, {false},Backend()).process();assertEquals("SUCCEEDED",SessionStore.snapshot().getString("state"))
  seed();ImageProcessor(ctx,{}, {false},Backend().apply{fail=OutOfMemoryError()}).process();assertEquals("LOW_MEMORY",SessionStore.snapshot().getString("error"))
 }
 @Test fun exifRotationPreservesOrientedDimensionsAndPixelGrid() {
  val job=seed("pixel",4);val source=File(job.getJSONObject("image").getString("sourcePath"))
  val b=Bitmap.createBitmap(270,258,Bitmap.Config.ARGB_8888)
  b.eraseColor(0xff0000ff.toInt());b.setPixel(0,0,0xffff0000.toInt());ImageFiles.write(b,source,"png");b.recycle()
  androidx.exifinterface.media.ExifInterface(source).apply{setAttribute(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,"6");saveAttributes()}
  job.getJSONObject("image").put("width",258).put("height",270)
  // Robolectric's region decoder returns blank buffers. Replace this boundary with
  // a real host bitmap crop; this checks our transform/crop/PNG path, not Android decoding.
  val rawBitmap=BitmapFactory.decodeFile(source.path)
  org.mockito.Mockito.mockStatic(android.graphics.BitmapRegionDecoder::class.java).use { factory ->
   val decoder=org.mockito.Mockito.mock(android.graphics.BitmapRegionDecoder::class.java)
   org.mockito.Mockito.`when`(decoder.width).thenReturn(270);org.mockito.Mockito.`when`(decoder.height).thenReturn(258)
   org.mockito.Mockito.`when`(decoder.decodeRegion(org.mockito.ArgumentMatchers.any(android.graphics.Rect::class.java),org.mockito.ArgumentMatchers.any(BitmapFactory.Options::class.java))).thenAnswer { call ->
    val rect=call.getArgument<android.graphics.Rect>(0);Bitmap.createBitmap(rawBitmap,rect.left,rect.top,rect.width(),rect.height())
   }
   factory.`when`<android.graphics.BitmapRegionDecoder>{android.graphics.BitmapRegionDecoder.newInstance(source.path,false)}.thenReturn(decoder)
   OriginalProcessor(ctx,Backend(),{}, {false}).process(job)
  }
  rawBitmap.recycle()
  val output=BitmapFactory.decodeFile(SessionStore.snapshot().getString("resultPath"));assertEquals(1032,output.width);assertEquals(1080,output.height)
  assertEquals(0xffff0000.toInt(),output.getPixel(output.width-1,0));assertEquals(0xff0000ff.toInt(),output.getPixel(0,0));output.recycle()
 }
 @Test fun decoderRefusalsReleaseResourcesAndReportDecodeFailure() {
  val job=seed();val source=job.getJSONObject("image").getString("sourcePath")
  org.mockito.Mockito.mockStatic(android.graphics.BitmapRegionDecoder::class.java).use { factory ->
   factory.`when`<android.graphics.BitmapRegionDecoder>{android.graphics.BitmapRegionDecoder.newInstance(source,false)}.thenReturn(null)
   failure("DECODE_FAILED"){OriginalProcessor(ctx,Backend(),{}, {false}).process(job)}
   val decoder=org.mockito.Mockito.mock(android.graphics.BitmapRegionDecoder::class.java)
   org.mockito.Mockito.`when`(decoder.width).thenReturn(270);org.mockito.Mockito.`when`(decoder.height).thenReturn(258)
   factory.`when`<android.graphics.BitmapRegionDecoder>{android.graphics.BitmapRegionDecoder.newInstance(source,false)}.thenReturn(decoder)
   failure("DECODE_FAILED"){OriginalProcessor(ctx,Backend(),{}, {false}).process(job)}
   org.mockito.Mockito.verify(decoder).recycle()
   org.mockito.Mockito.`when`(decoder.decodeRegion(org.mockito.ArgumentMatchers.any(android.graphics.Rect::class.java),org.mockito.ArgumentMatchers.any(BitmapFactory.Options::class.java))).thenReturn(Bitmap.createBitmap(1,1,Bitmap.Config.ARGB_8888))
   failure("DECODE_FAILED"){OriginalProcessor(ctx,Backend(),{}, {false}).process(job)}
   org.mockito.Mockito.`when`(decoder.decodeRegion(org.mockito.ArgumentMatchers.any(android.graphics.Rect::class.java),org.mockito.ArgumentMatchers.any(BitmapFactory.Options::class.java))).thenReturn(Bitmap.createBitmap(270,1,Bitmap.Config.ARGB_8888))
   failure("DECODE_FAILED"){OriginalProcessor(ctx,Backend(),{}, {false}).process(job)}
  }
 }
}
