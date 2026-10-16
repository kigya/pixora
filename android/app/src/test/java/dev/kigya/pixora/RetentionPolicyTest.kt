package dev.kigya.pixora

import android.app.Application
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class RetentionPolicyTest {
    @Test fun retainsCurrentSessionUntilTheNextLaunchAndProtectsExternalFiles() {
        val ctx=RuntimeEnvironment.getApplication()
        for(name in listOf("context","journal"))SessionStore::class.java.getDeclaredField(name).apply{isAccessible=true}.set(SessionStore,null)
        ctx.filesDir.deleteRecursively();ctx.filesDir.mkdirs();ctx.cacheDir.deleteRecursively();ctx.cacheDir.mkdirs();SessionStore.init(ctx)
        val outside=File(ctx.filesDir,"saved-outside-session.png").apply{writeText("keep")}
        val prefs=ctx.getSharedPreferences("settings",0)
        fun input(bytes:Long){val id=java.util.UUID.randomUUID().toString();val file=File(ctx.filesDir,"sessions/$id/source").apply{parentFile!!.mkdirs()};java.io.RandomAccessFile(file,"rw").use{it.setLength(bytes)};SessionStore.replace(JSONObject().put("id",id).put("sourcePath",file.path))}
        input(20);prefs.edit().putInt("cacheLimitMiB",-1).commit();RetentionPolicy.applyAtLaunch(ctx);assertEquals("READY",SessionStore.snapshot().getString("state"))
        prefs.edit().putInt("cacheLimitMiB",10).commit();RetentionPolicy.applyAtLaunch(ctx);assertEquals("READY",SessionStore.snapshot().getString("state"))
        File(ctx.cacheDir,"share/extra").apply{parentFile!!.mkdirs();java.io.RandomAccessFile(this,"rw").use{it.setLength(11*1048576)}}
        RetentionPolicy.applyAtLaunch(ctx);assertEquals("READY",SessionStore.snapshot().getString("state"))
        input(11*1048576);RetentionPolicy.applyAtLaunch(ctx);assertEquals("EMPTY",SessionStore.snapshot().getString("state"))
        File(ctx.filesDir,"sessions/orphan/uncommitted").apply{parentFile!!.mkdirs();writeText("partial import")}
        input(20);prefs.edit().putInt("cacheLimitMiB",0).commit();RetentionPolicy.applyAtLaunch(ctx);assertEquals("EMPTY",SessionStore.snapshot().getString("state"));assertTrue(outside.exists());assertFalse(File(ctx.filesDir,"sessions/orphan").exists())
        assertEquals(0L,RetentionPolicy.bytes(File(ctx.filesDir,"missing")));assertEquals(4L,RetentionPolicy.bytes(outside));assertTrue(RetentionPolicy.bytes(ctx.filesDir)>=4)
        prefs.edit().putInt("cacheLimitMiB",-1).commit()
    }
}
