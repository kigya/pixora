package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.DataOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ImageFilesTest {
    private lateinit var ctx:Context
    @Before fun setup(){ctx=RuntimeEnvironment.getApplication();ctx.cacheDir.deleteRecursively();ctx.cacheDir.mkdirs();ctx.filesDir.deleteRecursively();ctx.filesDir.mkdirs()}
    private fun fails(code:String,action:()->Unit){try{action();fail("Expected $code")}catch(e:AppFailure){assertEquals(code,e.code)}}
    @Test @Config(sdk=[29]) fun android10WebpIsLosslessAtQuality100() {
        val bitmap=Bitmap.createBitmap(3,2,Bitmap.Config.ARGB_8888).apply{eraseColor(Color.argb(128,120,80,40))}
        val file=File(ctx.cacheDir,"api29.webp");ImageFiles.write(bitmap,file,"webp");bitmap.recycle()
        val result=BitmapFactory.decodeFile(file.path);assertEquals(3,result.width);assertEquals(128,Color.alpha(result.getPixel(0,0)));result.recycle()
    }
    @Test fun limitsSignaturesAnimationsAndCorruptChunks() {
        assertEquals(8 to 4,ImageFiles.workSize(8,4));assertEquals(1024 to 512,ImageFiles.workSize(4000,2000));assertEquals(1 to 1024,ImageFiles.workSize(1,20000))
        org.robolectric.shadows.ShadowStatFs.registerStats(ctx.filesDir.path,100000,100000,100000)
        assertTrue(ImageFiles.space(ctx)>0);assertEquals(256L*1024*1024,ImageFiles.reserve(8,8,2));assertTrue(ImageFiles.reserve(4096,4096,4)>256L*1024*1024)
        for(size in listOf(0 to 10,10 to 0,-1 to 10))fails("DECODE_FAILED"){ImageFiles.validateDimensions(size.first,size.second)}
        for(size in listOf(20001 to 1,1 to 20001,10000 to 6000))fails("DIMENSIONS_TOO_LARGE"){ImageFiles.validateDimensions(size.first,size.second)}
        ImageFiles.validateDimensions(1024,1024)
        val f=File(ctx.cacheDir,"sniff")
        f.writeBytes(byteArrayOf(1));fails("DECODE_FAILED"){ImageFiles.sniff(f)}
        f.writeBytes(ByteArray(32));fails("UNSUPPORTED_FORMAT"){ImageFiles.sniff(f)}
        f.writeBytes(ByteArray(32).apply{this[0]=-1;this[1]=-40});assertEquals("image/jpeg",ImageFiles.sniff(f))
        f.writeText("GIF89a000000000000");fails("ANIMATED_IMAGE"){ImageFiles.sniff(f)}
        for(animation in listOf(false,true)) {
            val bytes=ByteArray(32);"RIFF".toByteArray().copyInto(bytes);"WEBP".toByteArray().copyInto(bytes,8);"VP8X".toByteArray().copyInto(bytes,12);bytes[20]=if(animation)2 else 0
            f.writeBytes(bytes);if(animation)fails("ANIMATED_IMAGE"){ImageFiles.sniff(f)}else assertEquals("image/webp",ImageFiles.sniff(f))
        }
        val signature=byteArrayOf(-119,80,78,71,13,10,26,10)
        for(chunk in listOf("acTL","IDAT")) {
            DataOutputStream(f.outputStream()).use{it.write(signature);it.writeInt(if(chunk=="acTL")4 else 1000);it.writeBytes(chunk);it.write(ByteArray(8))}
            fails(if(chunk=="acTL")"ANIMATED_IMAGE" else "DECODE_FAILED"){ImageFiles.sniff(f)}
        }
        DataOutputStream(f.outputStream()).use{it.write(signature);it.writeInt(25);it.writeBytes("IDAT");it.write(ByteArray(14))}
        fails("DECODE_FAILED"){ImageFiles.sniff(f)}
    }
    @Test fun allExifOrientationsLimitedDecodePreparationAndPreview() {
        val colors=listOf(Color.RED,Color.GREEN,Color.BLUE,Color.YELLOW)
        val b=Bitmap.createBitmap(96,64,Bitmap.Config.ARGB_8888)
        for(y in 0 until 64)for(x in 0 until 96)b.setPixel(x,y,colors[(if(y>=32)2 else 0)+(if(x>=48)1 else 0)])
        val corners=listOf(listOf(0,1,2,3),listOf(1,0,3,2),listOf(3,2,1,0),listOf(2,3,0,1),listOf(0,2,1,3),listOf(2,0,3,1),listOf(3,1,2,0),listOf(1,3,0,2),listOf(0,1,2,3))
        val source=File(ctx.cacheDir,"source.jpg");ImageFiles.write(b,source,"jpeg");b.recycle()
        for(o in 1..9) {
            ExifInterface(source).apply{setAttribute(ExifInterface.TAG_ORIENTATION,o.toString());saveAttributes()}
            val image=ImageFiles.import(ctx,Uri.fromFile(source))
            assertEquals(if(o in 5..8)64 else 96,image.getInt("width"));assertEquals(if(o in 5..8)96 else 64,image.getInt("height"))
            val file=ImageFiles.prepare(image);assertEquals(file,ImageFiles.prepare(image))
            val decoded=BitmapFactory.decodeFile(file.path);assertEquals(image.getInt("width"),decoded.width)
            val points=listOf(decoded.width/4 to decoded.height/4,decoded.width*3/4 to decoded.height/4,decoded.width/4 to decoded.height*3/4,decoded.width*3/4 to decoded.height*3/4)
            for((index,point) in points.withIndex()) {
                val actual=decoded.getPixel(point.first,point.second);val expected=colors[corners[o-1][index]]
                assertTrue("EXIF $o corner $index",kotlin.math.abs(Color.red(actual)-Color.red(expected))<20 && kotlin.math.abs(Color.green(actual)-Color.green(expected))<20 && kotlin.math.abs(Color.blue(actual)-Color.blue(expected))<20)
            }
            decoded.recycle()
        }
        val large=Bitmap.createBitmap(4096,2048,Bitmap.Config.ARGB_8888).apply{eraseColor(Color.BLUE)}
        val png=File(ctx.cacheDir,"large.png");ImageFiles.write(large,png,"png")
        val preview=Uri.parse(ImageFiles.preview(large,ctx.cacheDir));val small=BitmapFactory.decodeFile(preview.path);assertEquals(1536,small.width);small.recycle();large.recycle()
        val image=ImageFiles.import(ctx,Uri.fromFile(png));assertTrue(image.getBoolean("needsPreparation"));assertEquals(1024,image.getInt("workWidth"));assertEquals(512,image.getInt("workHeight"))
    }
    @Test fun alphaExportErrorsSharingAndCleanup() {
        val b=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888);val png=File(ctx.cacheDir,"result.png");val jpeg=File(ctx.cacheDir,"white.jpg")
        ImageFiles.write(b,png,"png");ImageFiles.write(b,jpeg,"jpeg");b.recycle()
        val flat=BitmapFactory.decodeFile(jpeg.path);assertTrue(Color.red(flat.getPixel(0,0))>230);ImageFiles.preview(flat,ctx.cacheDir);assertFalse(flat.isRecycled);flat.recycle()
        val s=JSONObject().put("resultPath",png.path).put("scale",2)
        for(format in listOf("png","jpeg","webp"))assertTrue(ImageFiles.shareFile(ctx,s,format).isFile)
        fails("SHARE_FAILED"){ImageFiles.shareFile(ctx,s,"gif")};fails("EXPORT_FAILED"){ImageFiles.export(ctx,s,"gif")}
        fails("SHARE_FAILED"){ImageFiles.shareFile(ctx,JSONObject().put("resultPath","/none"),"png")}
        val folder=File(ctx.cacheDir,"share");val old=File(folder,"old").apply{writeText("old");setLastModified(1)}
        val recent=File(ctx.cacheDir,"export-recent").apply{writeText("recent")}
        val stale=File(ctx.cacheDir,"export-stale").apply{writeText("stale");setLastModified(1)}
        val keep=File(ctx.cacheDir,"other").apply{writeText("keep")}
        assertTrue(ImageFiles.cleanupShares(ctx,false)>0);assertFalse(old.exists());assertFalse(stale.exists());assertTrue(keep.exists());assertTrue(recent.exists())
        assertTrue(ImageFiles.cleanupShares(ctx,true)>0);folder.deleteRecursively();assertEquals(0,ImageFiles.cleanupShares(ctx,false))
        val corrupt=File(ctx.cacheDir,"corrupt").apply{writeText("not an image of any kind")};fails("UNSUPPORTED_FORMAT"){ImageFiles.import(ctx,Uri.fromFile(corrupt))}
        assertEquals(1,ImageFiles.orientation(File(ctx.cacheDir,"missing")))
    }
    @Test fun truncatedContainersUnavailableSourceAndNarrowDecode() {
        val f=File(ctx.cacheDir,"signature")
        f.writeBytes(ByteArray(32).apply{this[0]=-1});fails("UNSUPPORTED_FORMAT"){ImageFiles.sniff(f)}
        f.writeBytes(ByteArray(32).apply{"RIFF".toByteArray().copyInto(this);"WAVE".toByteArray().copyInto(this,8)})
        fails("UNSUPPORTED_FORMAT"){ImageFiles.sniff(f)}
        f.writeBytes(ByteArray(32).apply{"RIFF".toByteArray().copyInto(this);"WEBP".toByteArray().copyInto(this,8);"VP8 ".toByteArray().copyInto(this,12)})
        assertEquals("image/webp",ImageFiles.sniff(f))
        DataOutputStream(f.outputStream()).use{it.write(byteArrayOf(-119,80,78,71,13,10,26,10));it.writeInt((ImageFiles.MAX_BYTES+1).toInt());it.writeBytes("IDAT");it.write(ByteArray(8))}
        fails("DECODE_FAILED"){ImageFiles.sniff(f)}
        val gallery=MediaExportTest.Gallery().apply{output=f;failOpen=true;attachInfo(ctx,android.content.pm.ProviderInfo().apply{authority="media";exported=true})}
        org.robolectric.shadows.ShadowContentResolver.registerProviderInternal("media",gallery)
        fails("SOURCE_UNAVAILABLE"){ImageFiles.import(ctx,Uri.parse("content://media/42"))}
        val huge=File(ctx.cacheDir,"huge");java.io.RandomAccessFile(huge,"rw").use{it.setLength(ImageFiles.MAX_BYTES+1)}
        fails("FILE_TOO_LARGE"){ImageFiles.import(ctx,Uri.fromFile(huge))};huge.delete()
        f.writeText("not a bitmap")
        fails("DECODE_FAILED"){ImageFiles.prepare(JSONObject().put("sourcePath",f.path).put("workWidth",8).put("workHeight",8))}
        val thin=Bitmap.createBitmap(4096,1,Bitmap.Config.ARGB_8888);val png=File(ctx.cacheDir,"thin.png")
        ImageFiles.write(thin,png,"png");thin.recycle()
        val image=ImageFiles.import(ctx,Uri.fromFile(png));assertEquals(1024,image.getInt("workWidth"));assertEquals(1,image.getInt("workHeight"));assertTrue(ImageFiles.prepare(image).exists())
        val tall=Bitmap.createBitmap(1,4096,Bitmap.Config.ARGB_8888);ImageFiles.write(tall,png,"png");tall.recycle()
        val vertical=ImageFiles.import(ctx,Uri.fromFile(png));assertEquals(1,vertical.getInt("workWidth"));assertEquals(1024,vertical.getInt("workHeight"));assertTrue(vertical.getBoolean("needsPreparation"))
    }
    @Test fun opaqueJpegSmallPreviewAndUnremovableCacheDirectory() {
        val bitmap=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888).apply{setHasAlpha(false);eraseColor(Color.BLUE)}
        ImageFiles.write(bitmap,File(ctx.cacheDir,"opaque.jpg"),"jpeg")
        assertTrue(File(Uri.parse(ImageFiles.preview(bitmap,ctx.cacheDir)).path!!).exists());assertFalse(bitmap.isRecycled);bitmap.recycle()
        val blocked=File(ctx.cacheDir,"share/blocked").apply{mkdirs();File(this,"child").writeText("keep")}
        assertEquals(0,ImageFiles.cleanupShares(ctx,true));assertTrue(blocked.isDirectory)
        val absent=object:android.content.ContextWrapper(ctx){override fun getCacheDir()=File(ctx.cacheDir,"absent")}
        assertEquals(0,ImageFiles.cleanupShares(absent,false))
    }

}
