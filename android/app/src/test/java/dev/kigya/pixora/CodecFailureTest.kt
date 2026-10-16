package dev.kigya.pixora

import android.app.Application
import android.graphics.Bitmap
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.Implements
import org.robolectric.annotation.Implementation
import java.io.File
import java.io.OutputStream

@RunWith(org.robolectric.RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class,shadows=[CodecFailureTest.RejectingCodec::class])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CodecFailureTest {
    @Implements(value=Bitmap::class,callNativeMethodsByDefault=true)
    class RejectingCodec:org.robolectric.shadows.ShadowNativeBitmap() {
        companion object{val targets=mutableListOf<Bitmap>()}
        @org.robolectric.annotation.RealObject private lateinit var bitmap:Bitmap
        @Implementation @Suppress("UNUSED_PARAMETER")
        protected fun compress(format:Bitmap.CompressFormat,quality:Int,output:OutputStream):Boolean{targets.add(bitmap);return false}
    }
    @Test fun codecFailureKeepsOldFileAndRemovesPartialOutput() {
        val ctx=RuntimeEnvironment.getApplication();val bitmap=Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888)
        for(format in listOf("png","jpeg")) {
            val file=File(ctx.cacheDir,"codec.$format").apply{writeText("old")}
            try{ImageFiles.write(bitmap,file,format);fail("Codec returned false")}catch(error:AppFailure){assertEquals("EXPORT_FAILED",error.code)}
            assertEquals("old",file.readText());assertFalse(File(ctx.cacheDir,"codec.$format.partial").exists())
        }
        assertFalse(bitmap.isRecycled);bitmap.recycle()
    }
    @Test fun failedImportAndPreparationReleaseTheirDecodedBitmap() {
        val ctx=RuntimeEnvironment.getApplication();RejectingCodec.targets.clear()
        val source=File(ctx.cacheDir,"codec-source.png")
        javaClass.getResourceAsStream("/codec-source.png")!!.use{source.writeBytes(it.readBytes())}
        for(action in listOf<()->Unit>({ImageFiles.import(ctx,android.net.Uri.fromFile(source))},{ImageFiles.prepare(org.json.JSONObject().put("sourcePath",source.path).put("workWidth",32).put("workHeight",24))})) {
            try{action();fail("Expected codec failure")}catch(error:AppFailure){assertEquals("EXPORT_FAILED",error.code)}
            assertTrue(RejectingCodec.targets.last().isRecycled)
        }
        assertTrue(File(ctx.filesDir,"sessions").listFiles().orEmpty().isEmpty());assertFalse(File(ctx.cacheDir,"work.png.partial").exists())
    }

}
