package dev.kigya.pixora

import android.content.Context

/** Always closes the non-null stream supplied by Android, including read failures. */
fun readAssetText(context:Context,path:String):String {
    val stream=context.assets.open(path)
    try {return stream.reader(Charsets.UTF_8).readText()}
    finally {stream.close()}
}
