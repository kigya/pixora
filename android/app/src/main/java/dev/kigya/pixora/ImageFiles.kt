package dev.kigya.pixora

import android.content.ContentValues
import android.content.Context
import android.graphics.*
import android.net.Uri
import android.os.StatFs
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.DataInputStream
import java.util.UUID
import kotlin.math.*

object ImageFiles {
    const val MAX_BYTES = 50L * 1024 * 1024
    fun workSize(w: Int, h: Int): Pair<Int, Int> {
        val f = min(1.0, 1024.0 / max(w, h)); return max(1, floor(w * f).toInt()) to max(1, floor(h * f).toInt())
    }
    fun reserve(w: Int, h: Int, scale: Int) = max(256L * 1024 * 1024, w.toLong() * h * scale * scale * 16)
    fun space(ctx: Context): Long = StatFs(ctx.filesDir.path).availableBytes
    fun validateDimensions(w: Int, h: Int) {
        if (w <= 0 || h <= 0) throw AppFailure("DECODE_FAILED")
        if (max(w, h) > 20000 || w.toLong() * h > 50_000_000) throw AppFailure("DIMENSIONS_TOO_LARGE")
    }
    fun sniff(file: File): String {
        val bytes = ByteArray(32); val n = withClosed(FileInputStream(file)) { it.read(bytes) }
        if (n < 12) throw AppFailure("DECODE_FAILED")
        if (bytes[0].toInt() and 255 == 255 && bytes[1].toInt() and 255 == 216) return "image/jpeg"
        if (bytes.take(8).toByteArray().contentEquals(byteArrayOf(-119,80,78,71,13,10,26,10))) {
            withClosed(DataInputStream(FileInputStream(file))) { input ->
                input.skipBytes(8)
                while (input.available() >= 12) {
                    val length = input.readInt().toLong() and 0xffffffffL
                    val type = ByteArray(4); input.readFully(type)
                    if (String(type, Charsets.US_ASCII) == "acTL") throw AppFailure("ANIMATED_IMAGE")
                    if (length > MAX_BYTES || length + 4 > input.available().toLong()) throw AppFailure("DECODE_FAILED")
                    input.skipBytes((length + 4).toInt())
                }
            }
            return "image/png"
        }
        if (String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" && String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP") {
            if (String(bytes, 12, 4, Charsets.US_ASCII) == "VP8X" && bytes[20].toInt() and 2 != 0) throw AppFailure("ANIMATED_IMAGE")
            return "image/webp"
        }
        if (String(bytes,0,3,Charsets.US_ASCII) == "GIF") throw AppFailure("ANIMATED_IMAGE")
        throw AppFailure("UNSUPPORTED_FORMAT")
    }
    fun orientation(file: File) = try { ExifInterface(file).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } catch (_: Exception) { 1 }
    internal fun matrix(o: Int) = Matrix().apply {
        when(o) { 2 -> setScale(-1f,1f); 3 -> setRotate(180f); 4 -> setScale(1f,-1f)
            5 -> {setRotate(90f); postScale(-1f,1f)}; 6 -> setRotate(90f)
            7 -> {setRotate(-90f); postScale(-1f,1f)}; 8 -> setRotate(-90f) }
    }
    internal fun decode(file: File, targetW: Int, targetH: Int): Bitmap {
        val o = orientation(file); val swapped = o in 5..8
        val rawW = if(swapped) targetH else targetW; val rawH = if(swapped) targetW else targetH
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= rawW && bounds.outHeight / (sample * 2) >= rawH) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888; inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB) }
        val src = BitmapFactory.decodeFile(file.path, opts) ?: throw AppFailure("DECODE_FAILED")
        val oriented = Bitmap.createBitmap(src,0,0,src.width,src.height,matrix(o),true)
        if (oriented !== src) src.recycle()
        val result = Bitmap.createScaledBitmap(oriented,targetW,targetH,true)
        if (result !== oriented) oriented.recycle()
        return result
    }
    fun import(ctx: Context, uri: Uri): JSONObject {
        val id = UUID.randomUUID().toString(); val dir = File(ctx.filesDir,"sessions/$id").apply{mkdirs()}
        val file = File(dir,"source")
        try {
            val selectedStream=ctx.contentResolver.openInputStream(uri) ?: throw AppFailure("SOURCE_UNAVAILABLE")
            withClosed(selectedStream) { input ->
                withClosed(file.outputStream()) { output ->
                    val buffer = ByteArray(65536); var count = 0L
                    while(true) { val n = input.read(buffer); if(n < 0) break; count += n
                        if(count > MAX_BYTES) throw AppFailure("FILE_TOO_LARGE"); output.write(buffer,0,n) }
                }
            }
            val mime = sniff(file)
            val bounds = BitmapFactory.Options().apply{inJustDecodeBounds=true}
            BitmapFactory.decodeFile(file.path,bounds); validateDimensions(bounds.outWidth,bounds.outHeight)
            val swap = orientation(file) in 5..8
            val w = if(swap) bounds.outHeight else bounds.outWidth; val h = if(swap) bounds.outWidth else bounds.outHeight
            val (ww,wh) = workSize(w,h)
            val preview = decode(file,ww,wh)
            val alpha = preview.hasAlpha()
            val previewFile = File(dir,"before.png"); try {write(preview, previewFile, "png")} finally {preview.recycle()}
            return JSONObject().put("id",id).put("mime",mime).put("size",file.length()).put("width",w).put("height",h)
                .put("workWidth",ww).put("workHeight",wh).put("hasAlpha",alpha).put("previewUri",Uri.fromFile(previewFile).toString())
                .put("needsPreparation",w!=ww || h!=wh).put("sourcePath",file.path).put("workPath","")
        } catch(e: Throwable) { dir.deleteRecursively(); throw e }
    }
    fun prepare(image: JSONObject): File {
        val source = File(image.getString("sourcePath")); val work = File(source.parentFile,"work.png")
        if (!work.isFile) {
            val bitmap = decode(source,image.getInt("workWidth"),image.getInt("workHeight"))
            try { write(bitmap,work,"png") } finally { bitmap.recycle() }
        }
        return work
    }
    fun write(bitmap: Bitmap, file: File, format: String) {
        val tmp = File(file.parentFile,file.name+".partial")
        var flat: Bitmap? = null
        try {
            val target = if(format == "jpeg" && bitmap.hasAlpha()) Bitmap.createBitmap(bitmap.width,bitmap.height,Bitmap.Config.ARGB_8888).also {
                val canvas = Canvas(it); canvas.drawColor(Color.WHITE); canvas.drawBitmap(bitmap,0f,0f,null); flat = it
            } else bitmap
            withClosed(tmp.outputStream()) { if(!target.compress(when(format){"jpeg"->Bitmap.CompressFormat.JPEG;"webp"->if(android.os.Build.VERSION.SDK_INT>=30)Bitmap.CompressFormat.WEBP_LOSSLESS else Bitmap.CompressFormat.WEBP;else->Bitmap.CompressFormat.PNG},if(format=="webp")100 else 95,it)) throw AppFailure("EXPORT_FAILED") }
            if(!tmp.renameTo(file)) throw AppFailure("EXPORT_FAILED")
        } finally { flat?.recycle(); tmp.delete() }
    }
    fun preview(result: Bitmap, dir: File): String {
        val f = min(1.0,1536.0/max(result.width,result.height))
        val small = Bitmap.createScaledBitmap(result,max(1,(result.width*f).toInt()),max(1,(result.height*f).toInt()),true)
        val file = File(dir,"after.png")
        try { write(small,file,"png") } finally {releasePreview(small,result)}
        return Uri.fromFile(file).toString()
    }
    private fun releasePreview(preview:Bitmap,original:Bitmap) {
        if(preview !== original)preview.recycle()
    }
    fun export(ctx: Context, session: JSONObject, format: String): JSONObject {
        if(format !in setOf("png","jpeg","webp")) throw AppFailure("EXPORT_FAILED")
        if(session.optString("resolution")=="original" && format!="png")throw AppFailure("EXPORT_FAILED")
        val mime = if(format=="png") "image/png" else if(format=="webp") "image/webp" else "image/jpeg"
        val extension = if(format=="png") "png" else if(format=="webp") "webp" else "jpg"
        val timestamp = java.text.SimpleDateFormat("yyyyMMdd_HHmmss",java.util.Locale.US).format(java.util.Date())
        val base = "Pixora_${timestamp}_${session.getInt("scale")}x"
        var name = "$base.$extension"; var suffix = 0
        while(ctx.contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,arrayOf(MediaStore.MediaColumns._ID),"${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND ${MediaStore.MediaColumns.RELATIVE_PATH} = ?",arrayOf(name,"Pictures/Pixora/"),null)?.let{cursor->withClosed(cursor){it.count>0}} == true) { suffix++; name = "${base}_$suffix.$extension" }
        val values = ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME,name); put(MediaStore.MediaColumns.MIME_TYPE,mime); put(MediaStore.MediaColumns.RELATIVE_PATH,"Pictures/Pixora/"); put(MediaStore.MediaColumns.IS_PENDING,1) }
        val uri = ctx.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values) ?: throw AppFailure("EXPORT_FAILED")
        try {
            val bitmap = if(session.optString("resolution")=="original")null else BitmapFactory.decodeFile(session.getString("resultPath")) ?: throw AppFailure("EXPORT_FAILED")
            val staging = File(ctx.cacheDir,"export-${UUID.randomUUID()}.$extension")
            try { if(bitmap==null)File(session.getString("resultPath")).copyTo(staging,overwrite=true) else write(bitmap,staging,format)
                val output=ctx.contentResolver.openOutputStream(uri) ?: throw AppFailure("EXPORT_FAILED")
                withClosed(output) { out -> withClosed(staging.inputStream()) { it.copyTo(out) } }
                val size=staging.length(); ctx.contentResolver.update(uri,ContentValues().apply{put(MediaStore.MediaColumns.IS_PENDING,0)},null,null)
                return JSONObject().put("id",UUID.randomUUID().toString()).put("format",format).put("mime",mime).put("uri",uri.toString()).put("width",bitmap?.width ?: session.getInt("resultWidth")).put("height",bitmap?.height ?: session.getInt("resultHeight")).put("size",size).put("createdAt",System.currentTimeMillis())
            } finally { bitmap?.recycle(); staging.delete() }
        } catch(e: Throwable) { ctx.contentResolver.delete(uri,null,null); throw e }
    }
    fun shareFile(ctx: Context, session: JSONObject, format: String): File {
        if(format !in setOf("png","jpeg","webp")) throw AppFailure("SHARE_FAILED")
        val file=File(File(ctx.cacheDir,"share").apply{mkdirs()},"Pixora_${UUID.randomUUID()}.${if(format=="png") "png" else if(format=="webp") "webp" else "jpg"}")
        if(session.optString("resolution")=="original"){
            if(format!="png")throw AppFailure("SHARE_FAILED")
            try {File(session.getString("resultPath")).copyTo(file,overwrite=true);return file}catch(e:Throwable){file.delete();throw e}
        }
        val b=BitmapFactory.decodeFile(session.getString("resultPath")) ?: throw AppFailure("SHARE_FAILED")
        try {write(b,file,format)} finally {b.recycle()}; return file
    }
    fun cleanupShares(ctx: Context, all: Boolean): Long {
        var bytes=0L
        File(ctx.cacheDir,"share").listFiles()?.filter{all || System.currentTimeMillis()-it.lastModified()>86400000}?.forEach{val size=it.length();if(it.delete()) bytes+=size}
        ctx.cacheDir.listFiles()?.filter{it.name.startsWith("export-") && System.currentTimeMillis()-it.lastModified()>86400000}?.forEach{it.delete()}
        return bytes
    }
}
