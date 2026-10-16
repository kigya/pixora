package dev.kigya.pixora

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.ConcurrentHashMap
import java.util.Locale

object Localizer {
    private val cache=ConcurrentHashMap<String,JSONObject>()
    private fun dictionary(ctx:Context,code:String)=cache.computeIfAbsent(code){id->JSONObject(readAssetText(ctx,"locales/$id.json"))}
    fun supported(ctx:Context):Set<String> {
        val registry=JSONArray(readAssetText(ctx,"locales/registry.json"))
        val ids=mutableSetOf<String>()
        var index=0
        while(index<registry.length()){ids.add(registry.getJSONObject(index).getString("id"));index++}
        return ids
    }
    fun resolve(ctx:Context,setting:String,system:String):String {
        val ids=supported(ctx)
        if(setting in ids)return setting
        val base=system.lowercase(Locale.ROOT).replace('_','-').substringBefore('-')
        return if(base=="zh")"zh-Hans" else if(base in ids)base else "en"
    }
    fun language(ctx:Context):String = resolve(ctx,(ctx.getSharedPreferences("settings",0).all["language"] as? String) ?: "system",ctx.resources.configuration.locales[0].toLanguageTag())
    fun text(ctx:Context,key:String):String {
        fun lookup(code:String):String {
            var node=dictionary(ctx,code)
            val parts=key.split('.')
            for(part in parts.dropLast(1))node=node.getJSONObject(part)
            return node.getString(parts.last())
        }
        return try {lookup(language(ctx))}catch(_:Exception){lookup("en")}
    }
}
