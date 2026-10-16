package dev.kigya.pixora

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import kotlin.math.ceil
import kotlin.math.max

/** Reads only the private before-preview already created during import. */
internal object RecommendationEngine {
    init { System.loadLibrary("upscale") }

    @JvmStatic private external fun analyzeRecommendation(
        width: Int,
        height: Int,
        argb: IntArray,
    ): String

    fun analyze(previewUri: String): String {
        val path = Uri.parse(previewUri).path ?: return "generic"
        val file = File(path)
        require(file.isFile)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0)
        var sample = 1
        while (ceil(max(bounds.outWidth, bounds.outHeight).toDouble() / sample) > 256)
            sample *= 2
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = BitmapFactory.decodeFile(path, options) ?: return "generic"
        val bitmap = if (max(decoded.width, decoded.height) > 256) {
            Bitmap.createScaledBitmap(
                decoded,
                max(1, decoded.width * 256 / max(decoded.width, decoded.height)),
                max(1, decoded.height * 256 / max(decoded.width, decoded.height)),
                false,
            ).also { if (it !== decoded) decoded.recycle() }
        } else decoded
        return try {
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            analyzeRecommendation(bitmap.width, bitmap.height, pixels)
        } finally {
            bitmap.recycle()
        }
    }
}
