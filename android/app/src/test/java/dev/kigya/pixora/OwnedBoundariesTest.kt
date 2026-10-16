package dev.kigya.pixora

import android.app.Application
import android.graphics.Bitmap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OwnedBoundariesTest {
    @Test fun nativeMetadataFactoryPreservesNestedBridgeTypesWithoutImageBuffers() {
        val values = RecordingBridgeValues()
        val json = JSONObject()
            .put("width", 8)
            .put("label", "preview")
            .put("flags", JSONArray().put(true).put(JSONObject.NULL).put(3).put("item"))
            .put("nested", JSONObject().put("height", 6).put("enabled", false))
            .put("collections", JSONArray().put(JSONObject().put("name", "tile")).put(JSONArray().put(4)))
        val result = JsonBridge(values).map(json)
        val flags = result.getArray("flags")!!
        val nested = result.getMap("nested")!!
        val collections = result.getArray("collections")!!
        assertEquals(8.0, result.getDouble("width"), 0.0)
        assertEquals("preview", result.getString("label"))
        assertTrue(flags.getBoolean(0))
        assertTrue(flags.isNull(1))
        assertEquals(3.0, flags.getDouble(2), 0.0)
        assertEquals("item", flags.getString(3))
        assertEquals(6.0, nested.getDouble("height"), 0.0)
        assertFalse(nested.getBoolean("enabled"))
        assertEquals("tile", collections.getMap(0)!!.getString("name"))
        assertEquals(4.0, collections.getArray(1)!!.getDouble(0), 0.0)
        assertEquals(3, values.mapsCreated)
        assertEquals(3, values.arraysCreated)
    }

    private class RecordingBridgeValues : BridgeValues {
        var mapsCreated = 0
        var arraysCreated = 0
        override fun map(): WritableMap { mapsCreated++; return JavaOnlyMap() }
        override fun array(): WritableArray { arraysCreated++; return JavaOnlyArray() }
    }

    @Test fun productionWorkFilesEncodeDecodeResizeAndPreviewRealPixels() {
        val context = RuntimeEnvironment.getApplication()
        val dir = File(context.cacheDir, "owned-boundaries").apply { mkdirs() }
        val input = Bitmap.createBitmap(8, 6, Bitmap.Config.ARGB_8888).apply { eraseColor(0x80804020.toInt()); setHasAlpha(true) }
        val output = AndroidWorkFiles.createOutput(input)
        assertEquals(32, output.width); assertEquals(24, output.height); assertTrue(output.hasAlpha())
        val half = AndroidWorkFiles.half(output)
        assertEquals(16, half.width); assertEquals(12, half.height)
        val path = File(dir, "sample.png")
        AndroidWorkFiles.write(input, path)
        assertEquals(8 to 6, AndroidWorkFiles.dimensions(path))
        val working=AndroidWorkFiles.prepare(JSONObject().put("sourcePath",path.path).put("workWidth",4).put("workHeight",3))
        assertEquals(4 to 3,AndroidWorkFiles.dimensions(working))
        assertEquals(8 to 6,AndroidWorkFiles.dimensions(path))
        val decoded = AndroidWorkFiles.decode(path)!!
        assertEquals(input.getPixel(0, 0), decoded.getPixel(0, 0))
        val preview = AndroidWorkFiles.preview(input, dir)
        assertTrue(preview.startsWith("file:"))
        assertTrue(File(android.net.Uri.parse(preview).path!!).isFile)
        assertNull(AndroidWorkFiles.decode(File(dir, "missing.png")))
        listOf(input, output, half, decoded).forEach { it.recycle() }
        dir.deleteRecursively()
    }

    @Test fun androidModelFactoryVerifiesEveryBundledModelAndCachesSuccess() {
        val verifier = BundledModels(RuntimeEnvironment.getApplication())
        assertTrue(verifier.valid())
        assertTrue(verifier.valid())
    }
}
