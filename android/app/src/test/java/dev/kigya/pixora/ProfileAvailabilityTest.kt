package dev.kigya.pixora

import android.app.Application
import android.content.Context
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35], application=Application::class)
class ProfileAvailabilityTest {
    private lateinit var context: Context
    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences("remote_profiles", 0).edit().clear().commit()
        ProfileAvailability.listeners.clear()
        (ProfileAvailability::class.java.getDeclaredField("fetched").apply{isAccessible=true}.get(ProfileAvailability) as java.util.concurrent.atomic.AtomicBoolean).set(false)
    }
    @Test fun firstOfflineLaunchEnablesEveryProfileAndCopiesSnapshot() {
        ProfileAvailability.init(context)
        for (id in ProcessingProfiles.presets) assertTrue(ProfileAvailability.allowed(id))
        for (id in listOf("quality", "fast", "illustration", "illustration-fast")) assertTrue(ProfileAvailability.allowed(id))
        assertFalse(ProfileAvailability.allowed("unrecognised"))
        // Unknown identifiers must not inherit a legacy alias's availability,
        // even when their Java string hash is identical.
        for (id in listOf("rVality", "gBst", "jMlustration", "jMlustration-fast")) {
            assertFalse(ProfileAvailability.allowed(id))
        }
        val snapshot = ProfileAvailability.snapshot()
        assertEquals("default", snapshot.getString("source"))
        snapshot.put("standard", false)
        assertTrue(ProfileAvailability.allowed("standard"))
    }
    @Test fun cachedSnapshotSurvivesRestartAndHonoursAllEightToggles() {
        val snapshot = JSONObject().put("source", "remote").put("updatedAt", 123L)
        ProcessingProfiles.presets.forEach { snapshot.put(it, it == "pixel") }
        context.getSharedPreferences("remote_profiles", 0).edit().putString("snapshot", snapshot.toString()).commit()
        ProfileAvailability.init(context)
        assertEquals("cache", ProfileAvailability.snapshot().getString("source"))
        assertEquals(123L, ProfileAvailability.snapshot().getLong("updatedAt"))
        for (id in ProcessingProfiles.presets) assertEquals(id == "pixel", ProfileAvailability.allowed(id))
        for (id in listOf("quality", "fast", "illustration", "illustration-fast")) assertFalse(ProfileAvailability.allowed(id))
    }
    @Test fun fetchPublishesCompleteSnapshotOnceAndKeepsItAcrossOfflineRestart() {
        ProfileAvailability.init(context)
        var complete: ((Result<Map<String,Boolean>>) -> Unit)? = null
        var requests = 0
        val source = ProfileConfigSource { callback -> requests++; complete=callback }
        var notifications = 0
        ProfileAvailability.listeners.add { notifications++; assertFalse(it.getBoolean("standard")) }
        ProfileAvailability.fetchOnce(source);ProfileAvailability.fetchOnce(source)
        assertEquals(1,requests);assertEquals(0,notifications)
        complete!!(Result.success(ProcessingProfiles.presets.associateWith { false }))
        assertEquals(1,notifications)
        assertEquals("remote",ProfileAvailability.snapshot().getString("source"))
        assertTrue(ProfileAvailability.snapshot().getLong("updatedAt")>0)
        ProcessingProfiles.presets.forEach{assertFalse(ProfileAvailability.allowed(it))}
        ProfileAvailability.init(context)
        assertEquals("cache",ProfileAvailability.snapshot().getString("source"))
        ProcessingProfiles.presets.forEach{assertFalse(ProfileAvailability.allowed(it))}
    }
    @Test fun networkErrorOrIncompleteFetchNeverReplacesCachedFlags() {
        for (result in listOf(Result.failure<Map<String,Boolean>>(java.io.IOException("offline")),Result.success(mapOf("standard" to false)))) {
            setup();ProfileAvailability.init(context)
            var notifications=0;ProfileAvailability.listeners.add{notifications++}
            ProfileAvailability.fetchOnce(ProfileConfigSource{it(result)})
            assertEquals(0,notifications);assertEquals("default",ProfileAvailability.snapshot().getString("source"))
            assertTrue(ProfileAvailability.allowed("standard"))
        }
    }
    @Test fun failedPersistenceNeverPublishesRemoteValues() {
        val preferences=context.getSharedPreferences("remote_profiles",0)
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int)=object:android.content.SharedPreferences by preferences {
                override fun edit()=object:android.content.SharedPreferences.Editor by preferences.edit() {
                    override fun putString(key:String?,value:String?):android.content.SharedPreferences.Editor=this
                    override fun putBoolean(key:String?,value:Boolean):android.content.SharedPreferences.Editor=this
                    override fun commit()=false
                }
            }
        }
        ProfileAvailability.init(wrapped)
        var notifications=0;ProfileAvailability.listeners.add{notifications++}
        ProfileAvailability.fetchOnce(ProfileConfigSource{it(Result.success(ProcessingProfiles.presets.associateWith{false}))})
        assertEquals(0,notifications);assertEquals("default",ProfileAvailability.snapshot().getString("source"))
        assertTrue(ProfileAvailability.allowed("standard"))
    }
    @Test fun corruptOrPartialCacheUsesCompleteDefaultsRatherThanMixedValues() {
        val preferences = context.getSharedPreferences("remote_profiles", 0)
        for (text in listOf("broken", "{}", "{\"standard\":false}", "{\"standard\":\"false\"}")) {
            preferences.edit().putString("snapshot", text).commit()
            ProfileAvailability.init(context)
            assertEquals("default", ProfileAvailability.snapshot().getString("source"))
            ProcessingProfiles.presets.forEach { assertTrue(ProfileAvailability.allowed(it)) }
        }
    }
}
