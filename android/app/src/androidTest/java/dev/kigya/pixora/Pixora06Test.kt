package dev.kigya.pixora

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class Pixora06Test {
    private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun allPresetsBothScalesAndSpeedsProduceRealFiles() {
        SessionStore.init(ctx);SessionStore.discard()
        val input=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888)
        for(y in 0..7)for(x in 0..7)input.setPixel(x,y,if(x==0)Color.TRANSPARENT else Color.rgb(x*30,y*30,100))
        val file=File(ctx.cacheDir,"06-presets.png");ImageFiles.write(input,file,"png")
        try {
            val image=ImageFiles.import(ctx,Uri.fromFile(file));SessionStore.replace(image)
            for(profile in ProcessingProfiles.presets)for(scale in listOf(2,4))for(speed in if(profile=="pixel")listOf("quality") else listOf("quality","fast")) {
                NativeEngine.resetCancellation();SessionStore.update{it.put("profileId",profile).put("speed",speed).put("mode",profile).put("modelId",ProcessingProfiles.model(profile)).put("scale",scale).put("state","PREPARING").put("timings",JSONObject())}
                ImageProcessor(ctx,{},{false}).process();val state=SessionStore.snapshot();assertEquals(state.toString(),"SUCCEEDED",state.getString("state"));assertEquals(8*scale,state.getInt("resultWidth"));assertEquals(8*scale,state.getInt("resultHeight"))
                val output=BitmapFactory.decodeFile(state.getString("resultPath"));assertEquals(0,Color.alpha(output.getPixel(0,0)))
                if(profile=="pixel")for(y in 0 until output.height)for(x in 0 until output.width)assertEquals(input.getPixel(x/scale,y/scale),output.getPixel(x,y))
                output.recycle();println("profile=$profile scale=$scale speed=$speed actual pipeline passed")
            }
        }finally{input.recycle();file.delete();SessionStore.discard()}
    }
    @Test fun speedVariantsKeepTargetSizeAndExportAllFormats() {
        SessionStore.init(ctx);SessionStore.discard()
        val input=Bitmap.createBitmap(640,96,Bitmap.Config.ARGB_8888)
        for(y in 0 until input.height)for(x in 0 until input.width)input.setPixel(x,y,if(x<4)Color.TRANSPARENT else Color.rgb((x*17+y*9)%256,(y*13)%256,(x*5)%256))
        val file=File(ctx.cacheDir,"06-speed.png");ImageFiles.write(input,file,"png");input.recycle()
        val outputs=mutableListOf<Bitmap>();val exports=mutableListOf<Uri>()
        try {
            SessionStore.replace(ImageFiles.import(ctx,Uri.fromFile(file)))
            for(speed in listOf("quality","fast")) {
                NativeEngine.resetCancellation()
                SessionStore.update{it.put("profileId","lite").put("speed",speed).put("mode","lite").put("modelId",ProcessingProfiles.model("lite")).put("scale",4).put("state","PREPARING").put("timings",JSONObject())}
                ImageProcessor(ctx,{},{false}).process()
                val state=SessionStore.snapshot();assertEquals(state.toString(),"SUCCEEDED",state.getString("state"))
                assertEquals(if(speed=="fast")512 else 640,state.getInt("aiInputWidth"))
                val result=BitmapFactory.decodeFile(state.getString("resultPath"));outputs.add(result)
                assertEquals(2560,result.width);assertEquals(384,result.height);assertEquals(0,Color.alpha(result.getPixel(0,0)))
                ImageFiles.write(result,File(ctx.getExternalFilesDir(null),"06-speed-$speed.png"),"png")
                for(format in listOf("png","jpeg","webp")) {
                    val uri=Uri.parse(ImageFiles.export(ctx,state,format).getString("uri"));exports.add(uri)
                    val decoded=ctx.contentResolver.openInputStream(uri).use{BitmapFactory.decodeStream(it)}
                    assertEquals(result.width,decoded.width);assertEquals(result.height,decoded.height)
                    if(format!="jpeg")assertEquals(0,Color.alpha(decoded.getPixel(0,0))) else assertTrue(Color.red(decoded.getPixel(0,0))>=240)
                    decoded.recycle()
                }
            }
            var difference=0L
            for(y in 0 until outputs[0].height)for(x in 0 until outputs[0].width)difference+=kotlin.math.abs(Color.red(outputs[0].getPixel(x,y))-Color.red(outputs[1].getPixel(x,y)))
            assertTrue("Real fast/quality outputs differ on a detailed synthetic input",difference>0)
            println("Same target 2560x384; red-channel MAE=${difference.toDouble()/(2560*384)}")
        } finally{outputs.forEach{it.recycle()};exports.forEach{ctx.contentResolver.delete(it,null,null)};file.delete();SessionStore.discard()}
    }
    @Test fun legacyBackendAdaptersStillCallRealModels() {
        val input=Bitmap.createBitmap(4,3,Bitmap.Config.ARGB_8888).apply{eraseColor(Color.BLUE)}
        val output=Bitmap.createBitmap(16,12,Bitmap.Config.ARGB_8888)
        try{for(fast in listOf(false,true)){NativeEngine.resetCancellation();assertEquals(0,OnDeviceBackend.process(ctx,input,output,false,32,object:ProgressCallback{override fun onProgress(done:Int,total:Int)=true},fast,false))}}
        finally{input.recycle();output.recycle()}
    }
    @Test fun naturalWholeAndTiledInferenceAgreeAtEdges() {
        val input=Bitmap.createBitmap(33,19,Bitmap.Config.ARGB_8888)
        for(y in 0 until 19)for(x in 0 until 33)input.setPixel(x,y,if(x==0)Color.TRANSPARENT else Color.rgb(x*7,y*12,100))
        val whole=Bitmap.createBitmap(132,76,Bitmap.Config.ARGB_8888);val tiles=Bitmap.createBitmap(132,76,Bitmap.Config.ARGB_8888)
        try {
            val cb=object:ProgressCallback{override fun onProgress(done:Int,total:Int)=true}
            NativeEngine.resetCancellation();assertEquals(0,NativeEngine.processProfile(ctx.assets,input,whole,false,128,cb,4,false));assertEquals(0,NativeEngine.processProfile(ctx.assets,input,tiles,false,32,cb,4,false))
            for(y in 0 until 76)for(x in 0 until 132){val a=whole.getPixel(x,y);val b=tiles.getPixel(x,y);assertTrue(kotlin.math.abs(Color.red(a)-Color.red(b))<=2);assertTrue(kotlin.math.abs(Color.green(a)-Color.green(b))<=2);assertTrue(kotlin.math.abs(Color.blue(a)-Color.blue(b))<=2);assertEquals(Color.alpha(a),Color.alpha(b))}
            if(NativeEngine.gpuAvailable()){NativeEngine.resetCancellation();assertEquals(0,NativeEngine.processProfile(ctx.assets,input,tiles,true,128,cb,4,true))}
        }finally{input.recycle();whole.recycle();tiles.recycle()}
    }
}
