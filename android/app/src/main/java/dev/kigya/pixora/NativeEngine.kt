package dev.kigya.pixora
import android.content.res.AssetManager
import android.graphics.Bitmap
object NativeEngine {
    init { System.loadLibrary("upscale") }
    external fun createRaster(path: String, width: Int, height: Int): Int
    external fun writeRaster(path: String, width: Int, height: Int, image: Bitmap, x: Int, y: Int, cropX: Int, cropY: Int, copyWidth: Int, copyHeight: Int): Int
    external fun finishRaster(raw: String, png: String, width: Int, height: Int, callback: ProgressCallback): Int
    external fun feedbackEndpoint(): String
    external fun setCoveragePath(path: String)
    external fun flushCoverage()
    external fun resetCancellation()
    external fun cancel()
    external fun gpuAvailable(): Boolean
    external fun process(assets: AssetManager, input: Bitmap, output: Bitmap, gpu: Boolean, tile: Int, callback: ProgressCallback): Int
    external fun processProfile(assets: AssetManager, input: Bitmap, output: Bitmap, gpu: Boolean, tile: Int, callback: ProgressCallback, profile: Int, testGPU: Boolean): Int
    external fun processWithModel(assets: AssetManager, input: Bitmap, output: Bitmap, gpu: Boolean, tile: Int, callback: ProgressCallback, fast: Boolean, testGPU: Boolean): Int
}
@kotlin.jvm.JvmDefaultWithoutCompatibility
interface ProgressCallback { fun onTiming(stage: Int, milliseconds: Double) {}
 fun onStage(stage: Int) {}
 fun onProgress(done: Int, total: Int): Boolean }
