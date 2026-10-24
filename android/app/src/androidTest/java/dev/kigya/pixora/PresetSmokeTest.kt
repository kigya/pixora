package dev.kigya.pixora

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Real bundled networks and finishers, without changing the user's session. */
@RunWith(AndroidJUnit4::class)
class PresetSmokeTest {
    @Test fun everyPresetProducesBothScalesAndPreservesAlpha() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val source = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
        for (y in 0..7) for (x in 0..7) {
            source.setPixel(x, y, Color.argb(if (x == 0) 0 else 255, x * 30, y * 30, 90))
        }
        try {
            for (profile in ProcessingProfiles.presets) {
                val full = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888)
                try {
                    if (profile == "pixel") {
                        val nearest = Bitmap.createScaledBitmap(source, 32, 32, false)
                        try { full.setPixels(IntArray(1024).also { nearest.getPixels(it, 0, 32, 0, 0, 32, 32) }, 0, 32, 0, 0, 32, 32) }
                        finally { nearest.recycle() }
                    } else {
                        NativeEngine.resetCancellation()
                        val progress = object : ProgressCallback {
                            override fun onProgress(done: Int, total: Int): Boolean {
                                assertTrue(done in 1..total)
                                return true
                            }
                        }
                        assertEquals(profile, 0, NativeEngine.processProfile(context.assets, source, full,
                            false, 64, progress, ProcessingProfiles.nativeId(profile), false))
                    }
                    PresetFinisher.apply(full, source, profile) { false }
                    for (scale in listOf(2, 4)) {
                        val output = Bitmap.createScaledBitmap(full, 8 * scale, 8 * scale, profile != "pixel")
                        try {
                            assertEquals(profile, 8 * scale, output.width)
                            assertEquals(profile, 8 * scale, output.height)
                            assertEquals(profile, 0, Color.alpha(output.getPixel(0, output.height / 2)))
                            assertEquals(profile, 255, Color.alpha(output.getPixel(output.width - 1, output.height / 2)))
                            assertNotEquals(profile, output.getPixel(4 * scale, scale), output.getPixel(6 * scale, 6 * scale))
                        } finally { if (output !== full) output.recycle() }
                    }
                } finally { full.recycle() }
            }
        } finally { source.recycle() }
    }
}
