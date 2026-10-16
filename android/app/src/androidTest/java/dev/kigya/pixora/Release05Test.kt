package dev.kigya.pixora

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import java.io.File
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry

@RunWith(AndroidJUnit4::class)
class Release05Test {
    private val ctx=InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun bundledIllustrationModelsKeepDimensionsAlphaAndTileEdges() {
        assertTrue(BundledModels(ctx).valid())
        val tiny=Bitmap.createBitmap(4,3,Bitmap.Config.ARGB_8888).apply{eraseColor(Color.BLUE)};val enlarged=Bitmap.createBitmap(16,12,Bitmap.Config.ARGB_8888)
        for(fast in listOf(false,true)){NativeEngine.resetCancellation();assertEquals(0,OnDeviceBackend.process(ctx,tiny,enlarged,false,32,object:ProgressCallback{override fun onProgress(done:Int,total:Int)=true},fast,false))}
        tiny.recycle();enlarged.recycle()
        val input=Bitmap.createBitmap(65,49,Bitmap.Config.ARGB_8888)
        for(y in 0 until 49)for(x in 0 until 65)input.setPixel(x,y,Color.argb(if(x==0)0 else 255,x*3,y*5,80))
        for(profile in listOf(2,3)) {
            val whole=Bitmap.createBitmap(260,196,Bitmap.Config.ARGB_8888);val tiled=Bitmap.createBitmap(260,196,Bitmap.Config.ARGB_8888)
            try {
                val callback=object:ProgressCallback{override fun onProgress(done:Int,total:Int)=true}
                NativeEngine.resetCancellation();assertEquals(0,NativeEngine.processProfile(ctx.assets,input,whole,false,128,callback,profile,false))
                assertEquals(0,NativeEngine.processProfile(ctx.assets,input,tiled,false,32,callback,profile,false))
                assertEquals(0,Color.alpha(tiled.getPixel(0,0)))
                for(y in 0 until 196)for(x in 0 until 260) {
                    val a=whole.getPixel(x,y);val b=tiled.getPixel(x,y)
                    assertTrue("Tile edge $profile $x,$y",kotlin.math.abs(Color.red(a)-Color.red(b))<=2 && kotlin.math.abs(Color.green(a)-Color.green(b))<=2 && kotlin.math.abs(Color.blue(a)-Color.blue(b))<=2)
                }
                if(NativeEngine.gpuAvailable()){NativeEngine.resetCancellation();assertEquals(0,NativeEngine.processProfile(ctx.assets,input,tiled,true,128,callback,profile,true))}
                println("profile=$profile native CPU/alpha/edges passed")
            }finally{whole.recycle();tiled.recycle()}
        }
        input.recycle()
    }
    @Test fun pixelArtHasExactBlocksAndWebpExportsKeepAlpha() {
        SessionStore.init(ctx);SessionStore.discard()
        val input=Bitmap.createBitmap(5,3,Bitmap.Config.ARGB_8888)
        for(y in 0..2)for(x in 0..4)input.setPixel(x,y,if(x==0)Color.TRANSPARENT else Color.rgb(x*40,y*70,180))
        val file=File(ctx.cacheDir,"05-pixel.png");ImageFiles.write(input,file,"png")
        try {
            val image=ImageFiles.import(ctx,Uri.fromFile(file));SessionStore.replace(image)
            for(scale in listOf(2,4)) {
                NativeEngine.resetCancellation();SessionStore.update{it.put("mode","pixel").put("modelId","nearest-neighbor").put("scale",scale).put("state","PREPARING").put("timings",org.json.JSONObject())}
                ImageProcessor(ctx,{},{false}).process();val session=SessionStore.snapshot();assertEquals("SUCCEEDED",session.getString("state"))
                val result=android.graphics.BitmapFactory.decodeFile(session.getString("resultPath"))
                for(y in 0 until result.height)for(x in 0 until result.width)assertEquals(input.getPixel(x/scale,y/scale),result.getPixel(x,y))
                val webp=File(ctx.cacheDir,"05-output.webp");ImageFiles.write(result,webp,"webp");result.recycle()
                val decoded=android.graphics.BitmapFactory.decodeFile(webp.path);assertEquals(5*scale,decoded.width);assertEquals(0,Color.alpha(decoded.getPixel(0,0)));decoded.recycle();webp.delete()
                val exported=ImageFiles.export(ctx,session,"webp");try{assertEquals("image/webp",exported.getString("mime"));assertTrue(exported.getLong("size")>0)}finally{ctx.contentResolver.delete(Uri.parse(exported.getString("uri")),null,null)}
            }
        }finally{input.recycle();file.delete();SessionStore.discard()}
    }
}
