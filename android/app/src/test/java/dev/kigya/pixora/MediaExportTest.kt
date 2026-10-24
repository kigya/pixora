package dev.kigya.pixora

import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.ParcelFileDescriptor
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowContentResolver
import java.io.File

/** Uses an actual ContentResolver with controlled provider faults, never a real gallery. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MediaExportTest {
    class Gallery:ContentProvider() {
        var collision=false;var nullQuery=false;var failQuery=false;var rejectInsert=false;var failOpen=false;var failUpdate=false
        var inserted:ContentValues?=null;var deletes=0;var published=false
        lateinit var output:File
        override fun onCreate()=true
        override fun getType(uri:Uri)="image/png"
        override fun query(uri:Uri,projection:Array<out String>?,selection:String?,args:Array<out String>?,order:String?):Cursor? {
            if(failQuery)throw SecurityException("controlled provider query failure")
            if(nullQuery)return null
            return MatrixCursor(arrayOf("_id")).apply{if(collision){addRow(arrayOf(1));collision=false}}
        }
        override fun insert(uri:Uri,values:ContentValues?):Uri? {inserted=ContentValues(values);return if(rejectInsert)null else Uri.parse("content://media/external/images/media/42")}
        override fun openFile(uri:Uri,mode:String):ParcelFileDescriptor? {
            if(failOpen)return null
            return ParcelFileDescriptor.open(output,ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or ParcelFileDescriptor.MODE_READ_WRITE)
        }
        override fun update(uri:Uri,values:ContentValues?,selection:String?,args:Array<out String>?):Int {if(failUpdate)throw SecurityException();published=values?.getAsInteger("is_pending")==0;return 1}
        override fun delete(uri:Uri,selection:String?,args:Array<out String>?):Int {deletes++;output.delete();return 1}
    }
    private val ctx get()=RuntimeEnvironment.getApplication()
    private lateinit var gallery:Gallery
    private lateinit var session:JSONObject
    @Before fun setup() {
        ctx.cacheDir.deleteRecursively();ctx.cacheDir.mkdirs()
        gallery=Gallery().apply{output=File(ctx.cacheDir,"gallery-output");attachInfo(ctx,android.content.pm.ProviderInfo().apply{authority="media";exported=true})};ShadowContentResolver.registerProviderInternal("media",gallery)
        val result=File(ctx.cacheDir,"result.png");val bitmap=Bitmap.createBitmap(16,12,Bitmap.Config.ARGB_8888)
        ImageFiles.write(bitmap,result,"png");bitmap.recycle();session=JSONObject().put("resultPath",result.path).put("scale",4)
    }
    private fun failure(action:()->Unit){try{action();fail("Expected export failure")}catch(_:Exception){}}
    @Test fun publicationCollisionBothFormatsAndNullableQuery() {
        for((format,mime,extension) in listOf(
            Triple("png","image/png","png"),
            Triple("jpeg","image/jpeg","jpg"),
            Triple("webp","image/webp","webp"),
        )) {
            gallery.collision=true
            val out=ImageFiles.export(ctx,session,format)
            assertEquals(format,out.getString("format"));assertEquals(mime,out.getString("mime"));assertEquals(16,out.getInt("width"));assertEquals(12,out.getInt("height"))
            assertTrue(gallery.inserted!!.getAsString("_display_name").contains("_1.$extension"));assertEquals(mime,gallery.inserted!!.getAsString("mime_type"));assertTrue(gallery.published)
            val decoded=BitmapFactory.decodeFile(gallery.output.path);assertEquals(16,decoded.width);decoded.recycle()
        }
        gallery.nullQuery=true;assertTrue(ImageFiles.export(ctx,session,"png").getLong("size")>0)
    }
    @Test fun rollbackOnInsertDecodeOpenAndPublicationFaults() {
        gallery.rejectInsert=true;failure{ImageFiles.export(ctx,session,"png")};assertEquals(0,gallery.deletes)
        gallery.rejectInsert=false
        failure{ImageFiles.export(ctx,JSONObject().put("scale",2).put("resultPath","/missing"),"png")};assertEquals(1,gallery.deletes)
        gallery.failOpen=true;failure{ImageFiles.export(ctx,session,"png")};assertEquals(2,gallery.deletes)
        gallery.failOpen=false;gallery.failUpdate=true;failure{ImageFiles.export(ctx,session,"png")};assertEquals(3,gallery.deletes)
        assertFalse(ctx.cacheDir.listFiles()!!.any{it.name.startsWith("export-")})
    }
    @Test fun originalPngExportsAndSharesPreserveBytesAndRejectOtherFormats() {
        session.put("resolution","original").put("resultWidth",16).put("resultHeight",12)
        val original=File(session.getString("resultPath")).readBytes()
        val exported=ImageFiles.export(ctx,session,"png")
        assertEquals(16,exported.getInt("width"));assertEquals(12,exported.getInt("height"))
        assertArrayEquals(original,gallery.output.readBytes())
        assertArrayEquals(original,ImageFiles.shareFile(ctx,session,"png").readBytes())
        for(format in listOf("jpeg","webp")) {
            failure{ImageFiles.export(ctx,session,format)};failure{ImageFiles.shareFile(ctx,session,format)}
        }
        File(session.getString("resultPath")).delete()
        failure{ImageFiles.shareFile(ctx,session,"png")};failure{ImageFiles.export(ctx,session,"png")}
        assertFalse(File(ctx.cacheDir,"share").listFiles()!!.any{it.length()==0L})
    }
    @Test fun atomicWriteDoesNotLeavePartialFileWhenRenameFails() {
        val bitmap=Bitmap.createBitmap(4,4,Bitmap.Config.ARGB_8888)
        val target=File(ctx.cacheDir,"occupied").apply{mkdirs();File(this,"child").writeText("keep")}
        failure{ImageFiles.write(bitmap,target,"jpeg")};bitmap.recycle()
        assertTrue(File(target,"child").exists());assertFalse(File(ctx.cacheDir,"occupied.partial").exists())
    }
}
