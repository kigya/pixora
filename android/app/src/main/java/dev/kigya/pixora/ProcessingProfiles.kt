package dev.kigya.pixora

/** Public presets share weights deliberately; legacy IDs retain their original engine. */
object ProcessingProfiles {
    val presets=listOf("standard","lite","natural","details","balanced","sharp","art","pixel")
    val modes=listOf("quality","fast","illustration","illustration-fast")+presets
    private val engines=mapOf(
        "fast" to ("realesr-general-x4v3" to 1),
        "lite" to ("realesr-general-x4v3" to 1),
        "illustration" to ("realesrgan-x4plus-anime" to 2),
        "art" to ("realesrgan-x4plus-anime" to 2),
        "illustration-fast" to ("realesr-animevideov3-x4" to 3),
        "natural" to ("realesrnet-x4plus" to 4),
        "pixel" to ("nearest-neighbor" to 0),
    )
    fun model(mode:String)=engines[mode]?.first ?: "realesrgan-x4plus"
    fun nativeId(mode:String):Int {val engine=engines[mode] ?: return 0;return engine.second}
    private val publicIds=mapOf("quality" to "standard","fast" to "lite","illustration" to "art","illustration-fast" to "art")
    fun publicId(mode:String)=publicIds[mode] ?: mode
    fun inputSize(w:Int,h:Int,speed:String):Pair<Int,Int> {
        val factor=if(speed=="fast")minOf(1.0,512.0/maxOf(w,h)) else 1.0
        return maxOf(1,(w*factor).toInt()) to maxOf(1,(h*factor).toInt())
    }
}
