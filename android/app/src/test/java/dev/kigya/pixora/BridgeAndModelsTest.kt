package dev.kigya.pixora

import android.app.Application
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.JavaOnlyArray
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.security.MessageDigest

val javaBridge=JsonBridge(object:BridgeValues {
    override fun map()=JavaOnlyMap()
    override fun array()=JavaOnlyArray()
})
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class BridgeAndModelsTest {
    @Test @Suppress("DEPRECATION") fun newArchitectureDoesNotProvideALegacyHost() {
        try{MainApplication().reactNativeHost;fail("Legacy host must not be used")}catch(error:RuntimeException){assertTrue(error.message!!.contains("New Architecture"))}
        val callback=object:ProgressCallback{override fun onProgress(done:Int,total:Int)=true}
        callback.onTiming(0,0.0);callback.onStage(0);assertTrue(callback.onProgress(1,1))
    }
    @Test fun metadataPreservesTypesAndNestedValues() {
        val json=JSONObject().put("null",JSONObject.NULL).put("flag",false).put("size",42L).put("text","picture")
            .put("object",JSONObject().put("id","image"))
            .put("list",JSONArray().put(JSONObject.NULL).put(true).put(4.5).put("value").put(JSONObject().put("x",1)).put(JSONArray().put(2)))
        val out=javaBridge.map(json)
        assertTrue(out.isNull("null"));assertFalse(out.getBoolean("flag"));assertEquals(42.0,out.getDouble("size"),0.0);assertEquals("picture",out.getString("text"))
        assertEquals("image",out.getMap("object")!!.getString("id"))
        val list=out.getArray("list")!!;assertTrue(list.isNull(0));assertTrue(list.getBoolean(1));assertEquals(4.5,list.getDouble(2),0.0);assertEquals("value",list.getString(3));assertEquals(1.0,list.getMap(4)!!.getDouble("x"),0.0);assertEquals(2.0,list.getArray(5)!!.getDouble(0),0.0)
        assertEquals(0,javaBridge.array(JSONArray()).size());assertEquals(0,javaBridge.map(JSONObject()).toHashMap().size)
    }
    @Test fun modelChecksumsAreCachedForBothModelsAndFailures() {
        val bytes="original weights".toByteArray()
        val hash=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
        val names=listOf("realesrgan-x4plus.param","realesrgan-x4plus.bin","realesr-general-x4v3.param","realesr-general-x4v3.bin","realesrnet-x4plus.param","realesrgan-x4plus-anime.bin","realesr-animevideov3-x4.bin","other.bin")
        val manifest=JSONObject().apply{names.forEach{put(it,hash)}}
        for(fast in listOf(false,true)) {
            var opens=0
            val models=BundledModels(fast,{manifest},{opens++;bytes.inputStream()})
            assertTrue(models.valid());assertTrue(models.valid());assertEquals(if(fast)7 else 5,opens)
        }
        assertFalse(BundledModels(true,{manifest},{"tampered".byteInputStream()}).valid())
        assertFalse(BundledModels(false,{throw java.io.IOException("missing manifest")},{bytes.inputStream()}).valid())
        assertFalse(BundledModels(false,{manifest},{throw java.io.IOException("missing weights")}).valid())
    }
}
