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
        profiles: Int,
    ): String

    // Same stable bit order as recommendation.h. Take a single atomic snapshot.
    private fun profileMask(): Int {
        val flags = ProfileAvailability.snapshot()
        return listOf("standard", "balanced", "natural", "lite", "art", "pixel")
            .foldIndexed(0) { bit, mask, id ->
                if (flags.optBoolean(id, false)) mask or (1 shl bit) else mask
            }
    }

    fun fallback(): String = analyzeRecommendation(0, 0, intArrayOf(), profileMask())

    fun analyze(previewUri: String): String {
        val profiles = profileMask()
        val path = Uri.parse(previewUri).path ?: return analyzeRecommendation(0, 0, intArrayOf(), profiles)
        val file = File(path)
        require(file.isFile)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0)
        var sample = 1
        while (ceil(max(bounds.outWidth, bounds.outHeight).toDouble() / sample) > 1024)
            sample *= 2
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = BitmapFactory.decodeFile(path, options) ?: return analyzeRecommendation(0, 0, intArrayOf(), profiles)
        var bitmap = decoded
        return try {
            if (max(decoded.width, decoded.height) > 1024) {
                bitmap = Bitmap.createScaledBitmap(
                    decoded,
                    max(1, decoded.width * 1024 / max(decoded.width, decoded.height)),
                    max(1, decoded.height * 1024 / max(decoded.width, decoded.height)),
                    false,
                )
                if (bitmap !== decoded) decoded.recycle()
            }
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            analyzeRecommendation(bitmap.width, bitmap.height, pixels, profiles)
        } finally {
            if (!decoded.isRecycled) decoded.recycle()
            if (bitmap !== decoded) bitmap.recycle()
        }
    }
}
