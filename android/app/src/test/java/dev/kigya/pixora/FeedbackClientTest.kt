package dev.kigya.pixora

import org.junit.Test
import org.junit.Assert.*
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

@org.junit.runner.RunWith(org.robolectric.RobolectricTestRunner::class)
@org.robolectric.annotation.Config(sdk=[35],application=android.app.Application::class)
class FeedbackClientTest {
    private val endpoint="https://script.google.com/macros/s/test_123/exec"
    private val id="a2345678-1234-4321-a123-123456789abc"
    class Connection(var status:Int=200,var body:String="",var location:String?=null):HttpURLConnection(URL("https://script.google.com")) {
        val output=ByteArrayOutputStream();var closed=false;var failWrite=false
        override fun connect(){}
        override fun disconnect(){closed=true}
        override fun usingProxy()=false
        override fun getOutputStream():java.io.OutputStream {if(failWrite)throw java.io.IOException();return output}
        override fun getInputStream()=ByteArrayInputStream(body.toByteArray())
        override fun getResponseCode()=status
        override fun getHeaderField(name:String)=location
    }
    private fun fail(code:String,action:()->Unit){try{action();fail("Expected $code")}catch(e:AppFailure){assertEquals(code,e.code)}}
    @Test fun endpointOnlyAcceptsAnAppsScriptWebApp() {
        assertTrue(FeedbackClient.validEndpoint(endpoint))
        for(url in listOf("","http://script.google.com/macros/s/a/exec","https://evil.com/macros/s/a/exec","https://a@script.google.com/macros/s/a/exec",endpoint+"?x=1",endpoint+"#a","https://script.google.com/","invalid URI"))assertFalse(FeedbackClient.validEndpoint(url))
        fail("FEEDBACK_UNAVAILABLE"){FeedbackClient("").send("me@example.com","hello",0,id)}
        val client=FeedbackClient(endpoint)
        val connect=FeedbackClient::class.java.getDeclaredField("connect").apply{isAccessible=true}.get(client) as (String)->HttpURLConnection
        val nativeConnection=connect(endpoint);assertTrue(nativeConnection is javax.net.ssl.HttpsURLConnection);nativeConnection.disconnect()
    }
    @Test fun validatesAndSendsOnlyExplicitTextFields() {
        val c=Connection(body="{\"ok\":true,\"id\":\"$id\"}");val client=FeedbackClient(endpoint){c}
        for(args in listOf(Triple("invalid","hello",0),Triple("x".repeat(255),"hello",0),Triple("a@b.com","four",0),Triple("a@b.com","a".repeat(4001),0),Triple("a@b.com","hello",6),Triple("a@b.com","hello",-1)))fail("FEEDBACK_INVALID"){client.send(args.first,args.second,args.third,id)}
        fail("FEEDBACK_INVALID"){client.send("a@b.com","hello",0,"bad")}
        assertTrue(client.send(" me@example.com "," hello ",4,id));assertTrue(c.closed)
        val payload=org.json.JSONObject(c.output.toString("UTF-8"));assertEquals("me@example.com",payload.getString("email"));assertEquals(4,payload.getInt("rating"));assertEquals(5,payload.length());assertFalse(payload.has("image"))
    }
    @Test fun redirectsUseGetAndNeverSendEmailToAnotherHost() {
        val first=Connection(302,location="https://script.googleusercontent.com/macros/echo?user_content_key=abc")
        val second=Connection(body="{\"ok\":true,\"id\":\"$id\"}")
        var calls=0;assertTrue(FeedbackClient(endpoint){if(calls++==0)first else second}.send("me@example.com","hello",0,id));assertEquals("GET",second.requestMethod);assertEquals(0,second.output.size());assertTrue(first.closed && second.closed)
        for(location in listOf(null,"http://script.googleusercontent.com/a","https://evil.com/a","https://a@script.googleusercontent.com/a")) {
            val c=Connection(303,location=location);fail("FEEDBACK_FAILED"){FeedbackClient(endpoint){c}.send("me@example.com","hello",0,id)};assertTrue(c.closed)
        }
    }
    @Test fun failuresPreserveNoPayloadInLogsAndCloseConnections() {
        for(c in listOf(Connection(500),Connection(body="bad json"),Connection(body="{}"),Connection(body="{\"ok\":true,\"id\":\"wrong\"}"),Connection(body="x".repeat(8193)),Connection().apply{failWrite=true})) {
            fail("FEEDBACK_FAILED"){FeedbackClient(endpoint){c}.send("me@example.com","hello",0,id)};assertTrue(c.closed)
        }
    }
}
