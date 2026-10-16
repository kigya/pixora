package dev.kigya.pixora

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Debug
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Synthetic inputs only. Run separately from lifecycle/UI automation. */
@RunWith(AndroidJUnit4::class)
class BenchmarkTest {
    @Test fun measureSyntheticInference() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val activity=instrumentation.startActivitySync(android.content.Intent(context,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        val arguments = InstrumentationRegistry.getArguments()
        val sizes = (arguments.getString("sizes") ?: "128,256").split(",").map { it.toInt() }
        val tiles = (arguments.getString("tiles") ?: "64,128").split(",").map { it.toInt() }
        val repeats = arguments.getString("repeats")?.toInt() ?: 3
        val gpu = arguments.getString("gpu") == "true"
        val fast = arguments.getString("mode") == "fast"
        val samples = JSONArray()
        for (size in sizes) for (tile in tiles) repeat(repeats) { iteration ->
            val input = Bitmap.createBitmap(size, size * 3 / 4, Bitmap.Config.ARGB_8888)
            for (y in 0 until input.height) for (x in 0 until input.width) {
                input.setPixel(x, y, Color.rgb((x * 3 + y) % 256, (y * 5) % 256, (x + y * 2) % 256))
            }
            val output = Bitmap.createBitmap(input.width * 4, input.height * 4, Bitmap.Config.ARGB_8888)
            val started = SystemClock.elapsedRealtime()
            var loaded = started
            try {
                NativeEngine.resetCancellation()
                val code = NativeEngine.processWithModel(context.assets, input, output, gpu, tile, object : ProgressCallback {
                    override fun onStage(stage: Int) { if (stage == 1) loaded = SystemClock.elapsedRealtime() }
                    override fun onProgress(done: Int, total: Int) = true
                }, fast, true)
                val finished = SystemClock.elapsedRealtime()
                val memory = Debug.MemoryInfo().also { Debug.getMemoryInfo(it) }
                samples.put(JSONObject().put("width", input.width).put("height", input.height)
                    .put("tile", tile).put("backend", if (gpu) "GPU" else "CPU").put("iteration", iteration)
                    .put("mode",if(fast)"fast" else "quality").put("loadMs", loaded - started).put("inferenceMs", finished - loaded)
                    .put("totalMs", finished - started).put("pssKiB", memory.totalPss).put("code", code))
                File(context.getExternalFilesDir(null), "benchmark-${if(fast)"fast" else "quality"}-${if(gpu)"gpu" else "cpu"}.json").writeText(samples.toString(2))
                android.util.Log.i("UpseloraBenchmark", samples.getJSONObject(samples.length()-1).toString())
                assertEquals(0, code)
            } finally { input.recycle(); output.recycle(); NativeEngine.resetCancellation() }
        }
    }
}
