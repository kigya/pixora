package dev.kigya.pixora

import android.content.Context
import org.json.JSONObject
import java.io.InputStream
import java.security.MessageDigest

fun interface ModelVerifier { fun valid():Boolean }
class BundledModels(
    private val fast:Boolean,
    private val manifest:()->JSONObject,
    private val open:(String)->InputStream,
):ModelVerifier {
    constructor(ctx:Context):this(BuildConfig.FAST_MODEL_ENABLED,
        {JSONObject(readAssetText(ctx,"model-manifest.json"))},
        {name->ctx.assets.open("models/$name")})
    private var checked:Boolean?=null
    override fun valid():Boolean {
        checked?.let{return it}
        val valid=try {
            val hashes=manifest()
            val names=listOf("realesrgan-x4plus.param","realesrgan-x4plus.bin") + hashes.keys().asSequence().filter{it.startsWith("realesrnet-x4plus") || it.startsWith("realesrgan-x4plus-anime") || it.startsWith("realesr-animevideov3")}.toList() + if(fast)listOf("realesr-general-x4v3.param","realesr-general-x4v3.bin") else emptyList()
            var index=0
            var matches=true
            while(index<names.size && matches) {
                val name=names[index++]
                val digest=MessageDigest.getInstance("SHA-256")
                val input=open(name)
                try {
                    val buffer=ByteArray(65536)
                    while(true){val count=input.read(buffer);if(count<0)break;digest.update(buffer,0,count)}
                } finally {input.close()}
                matches=digest.digest().joinToString(""){"%02x".format(it)}==hashes.getString(name)
            }
            matches
        }catch(_:Exception){false}
        checked=valid
        return valid
    }
}
interface JobControl { fun reset();fun cancel() }
object NativeJobControl:JobControl {
    override fun reset()=NativeEngine.resetCancellation()
    override fun cancel()=NativeEngine.cancel()
}
