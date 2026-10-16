package dev.kigya.pixora

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

/** The only network feature: a user-submitted question. Never used by inference. */
class FeedbackClient(private val endpoint:String,private val connect:(String)->HttpURLConnection={URI(it).toURL().openConnection() as HttpURLConnection}) {
    fun configured():Boolean = validEndpoint(endpoint)
    fun send(email:String,message:String,rating:Int,id:String):Boolean {
        if(!configured())throw AppFailure("FEEDBACK_UNAVAILABLE")
        val replyAddress=email.trim()
        if((replyAddress.isNotEmpty() && (replyAddress.length>254 || !Regex("^[^\\s@<>\\r\\n]+@[^\\s@<>\\r\\n]+\\.[^\\s@<>\\r\\n]+$").matches(replyAddress))) || message.trim().length !in 5..4000 || rating !in 0..5 || !Regex("^[a-f0-9-]{36}$").matches(id))throw AppFailure("FEEDBACK_INVALID")
        val payload=JSONObject().put("email",replyAddress).put("message",message.trim()).put("rating",rating).put("id",id).put("version",BuildConfig.VERSION_NAME).put("platform","android").toString().toByteArray(Charsets.UTF_8)
        val first=connect(endpoint)
        try {
            first.connectTimeout=15000;first.readTimeout=20000;first.instanceFollowRedirects=false
            first.requestMethod="POST";first.doOutput=true;first.setRequestProperty("Content-Type","application/json; charset=utf-8");first.setFixedLengthStreamingMode(payload.size)
            withClosed(first.outputStream){it.write(payload)}
            if(first.responseCode in listOf(302,303)) {
                val location=first.getHeaderField("Location") ?: throw AppFailure("FEEDBACK_FAILED")
                val uri=URI(location)
                if(uri.scheme!="https" || uri.host!="script.googleusercontent.com" || uri.userInfo!=null)throw AppFailure("FEEDBACK_FAILED")
                val second=connect(location)
                try {second.connectTimeout=15000;second.readTimeout=20000;second.instanceFollowRedirects=false;return response(second,id)}finally{second.disconnect()}
            }
            return response(first,id)
        }catch(e:AppFailure){throw e}catch(_:Exception){throw AppFailure("FEEDBACK_FAILED")}finally{first.disconnect()}
    }
    private fun response(connection:HttpURLConnection,id:String):Boolean {
        if(connection.responseCode!=200)throw AppFailure("FEEDBACK_FAILED")
        val body=withClosed(connection.inputStream){input->
            val buffer=ByteArray(8193);var count=0
            while(count<buffer.size){val n=input.read(buffer,count,buffer.size-count);if(n<0)break;count+=n}
            buffer.copyOf(count)
        }
        if(body.size>8192)throw AppFailure("FEEDBACK_FAILED")
        val result=JSONObject(String(body,Charsets.UTF_8))
        if(!result.optBoolean("ok") || result.optString("id")!=id)throw AppFailure("FEEDBACK_FAILED")
        return true
    }
    companion object {
        fun validEndpoint(value:String):Boolean=try {val uri=URI(value);uri.scheme=="https" && uri.host=="script.google.com" && uri.userInfo==null && uri.query==null && uri.fragment==null && Regex("^/macros/s/[A-Za-z0-9_-]+/exec$").matches(uri.path)}catch(_:Exception){false}
    }
}
