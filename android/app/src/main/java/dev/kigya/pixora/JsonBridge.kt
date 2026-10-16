package dev.kigya.pixora

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableArray
import org.json.JSONObject
import org.json.JSONArray

interface BridgeValues {
    fun map():WritableMap
    fun array():WritableArray
}
object NativeBridgeValues:BridgeValues {
    override fun map()=Arguments.createMap()
    override fun array()=Arguments.createArray()
}
/** Small metadata only. Bitmap buffers never cross this boundary. */
class JsonBridge(private val values:BridgeValues=NativeBridgeValues) {
    fun map(json:JSONObject):WritableMap=values.map().apply {
        json.keys().forEach { key ->
            when(val value=json.get(key)) {
                JSONObject.NULL->putNull(key)
                is JSONObject->putMap(key,map(value))
                is JSONArray->putArray(key,array(value))
                is Boolean->putBoolean(key,value)
                is Number->putDouble(key,value.toDouble())
                else->putString(key,value.toString())
            }
        }
    }
    fun array(json:JSONArray):WritableArray=values.array().apply {
        var index=0
        while(index<json.length()) {
            when(val value=json.get(index++)) {
                JSONObject.NULL->pushNull()
                is JSONObject->pushMap(map(value))
                is JSONArray->pushArray(array(value))
                is Boolean->pushBoolean(value)
                is Number->pushDouble(value.toDouble())
                else->pushString(value.toString())
            }
        }
    }
}
