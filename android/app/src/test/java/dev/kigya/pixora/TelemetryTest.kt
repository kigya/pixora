package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.os.Bundle
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35], application=Application::class)
class TelemetryTest {
    private lateinit var context: Context
    private val received = mutableListOf<Pair<String, Bundle>>()
    private val configured = mutableListOf<Pair<Boolean, Boolean>>()
    private val sink = object: TelemetrySink {
        override fun configure(analytics: Boolean, crashes: Boolean) { configured.add(analytics to crashes) }
        override fun log(name: String, parameters: Bundle) { received.add(name to parameters) }
    }
    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences("telemetry",0).edit().clear().commit()
        Telemetry.init(context,sink)
    }
    @After fun reset() {
        for(name in listOf("context","sink")) Telemetry::class.java.getDeclaredField(name).apply{isAccessible=true}.set(Telemetry,null)
    }
    @Test fun defaultSinkInitializationStopsWhenPreSdkReconciliationCannotPersist() {
        Telemetry::class.java.getDeclaredField("sink").apply { isAccessible = true }.set(Telemetry, null)
        val analytics=context.getSharedPreferences("com.google.android.gms.measurement.prefs",0)
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
                val delegate=super.getSharedPreferences(name,mode)
                if(name!="com.google.android.gms.measurement.prefs") return delegate
                return object:android.content.SharedPreferences by delegate {
                    override fun edit()=rejectingPreferencesEditor()
                }
            }
        }
        configured.clear()
        Telemetry.init(wrapped)
        assertTrue(configured.isEmpty())
        assertTrue(analytics.getBoolean("measurement_enabled", false))
        assertTrue(analytics.getBoolean("measurement_enabled_from_api", false))
    }

    @Test fun collectionSettingsAreIndependentAndEnabledByDefaultUntilChoiceIsSaved() {
        assertEquals(true to true,configured.single())
        val initial=Telemetry.settings();assertFalse(initial.getBoolean("noticeSeen"))
        assertTrue(initial.getBoolean("analytics"));assertTrue(initial.getBoolean("crashes"))
        assertEquals(0,initial.getInt("consentVersion"))
        Telemetry.update(true,false,true);assertEquals(true to false,configured.last())
        Telemetry.update(false,true,true);assertEquals(false to true,configured.last())
        assertTrue(Telemetry.settings().getBoolean("noticeSeen"));assertEquals(Telemetry.consentVersion,Telemetry.settings().getInt("consentVersion"))
        Telemetry.event("ui_action");assertTrue(received.isEmpty())
    }
    @Test fun legacyFlagsAndSeenNoticeAreNotConsentAndUnresolvedChoicesDefaultOn() {
        context.getSharedPreferences("telemetry",0).edit()
            .putBoolean("analytics",false).putBoolean("crashes",false)
            .putBoolean("noticeSeen",true).putInt("consentVersion",1).commit()
        configured.clear()
        Telemetry.init(context,sink)
        assertEquals(listOf(true to true),configured)
        val migrated=Telemetry.settings()
        assertTrue(migrated.getBoolean("analytics"));assertTrue(migrated.getBoolean("crashes"))
        assertTrue(migrated.getBoolean("noticeSeen"));assertEquals(1,migrated.getInt("consentVersion"))
        Telemetry.event("ui_action")
        assertEquals("ui_action",received.single().first)
    }
    @Test fun preFirebaseMigrationAppliesDefaultsAndPreservesUnrelatedSdkPreferences() {
        context.getSharedPreferences("telemetry",0).edit()
            .putInt("consentVersion",1).putBoolean("analytics",false).putBoolean("crashes",false)
            .putBoolean("noticeSeen",true).commit()
        val analytics=context.getSharedPreferences("com.google.android.gms.measurement.prefs",0)
        analytics.edit().putBoolean("measurement_enabled",false).putBoolean("measurement_enabled_from_api",false).putString("unrelated", "keep").commit()
        val crashlytics=context.getSharedPreferences("com.google.firebase.crashlytics",0)
        crashlytics.edit().putBoolean("firebase_crashlytics_collection_enabled",false).putString("unrelated", "keep").commit()
        Telemetry.prepare(context)
        assertTrue(analytics.getBoolean("measurement_enabled",false));assertTrue(analytics.getBoolean("measurement_enabled_from_api",false));assertEquals("keep",analytics.getString("unrelated",null))
        assertTrue(crashlytics.getBoolean("firebase_crashlytics_collection_enabled",false));assertEquals("keep",crashlytics.getString("unrelated",null))
        Telemetry.init(context,sink)
        assertEquals(true to true,configured.last())
        assertTrue(Telemetry.settings().getBoolean("noticeSeen"))
        assertEquals(1,Telemetry.settings().getInt("consentVersion"))
    }
    @Test fun preFirebaseMigrationReconcilesCurrentConsentOverStaleSdkOverrides() {
        context.getSharedPreferences("telemetry",0).edit()
            .putInt("consentVersion",Telemetry.consentVersion).putBoolean("analytics",false).putBoolean("crashes",true).commit()
        val analytics=context.getSharedPreferences("com.google.android.gms.measurement.prefs",0)
        analytics.edit().putBoolean("measurement_enabled",true).putBoolean("measurement_enabled_from_api",true).commit()
        val crashlytics=context.getSharedPreferences("com.google.firebase.crashlytics",0)
        crashlytics.edit().putBoolean("firebase_crashlytics_collection_enabled",false).commit()
        Telemetry.prepare(context)
        assertFalse(analytics.getBoolean("measurement_enabled",true))
        assertFalse(analytics.getBoolean("measurement_enabled_from_api",true))
        assertTrue(crashlytics.getBoolean("firebase_crashlytics_collection_enabled",false))

        context.getSharedPreferences("telemetry",0).edit().putBoolean("analytics",true).commit()
        analytics.edit().putBoolean("measurement_enabled",false).putBoolean("measurement_enabled_from_api",false).commit()
        Telemetry.prepare(context)
        assertTrue(analytics.getBoolean("measurement_enabled",false))
        assertTrue(analytics.getBoolean("measurement_enabled_from_api",false))
    }
    @Test fun failedStartupReconciliationKeepsSettingsUsableAndTelemetryInertUntilNextLaunch() {
        Telemetry::class.java.getDeclaredField("sink").apply { isAccessible = true }.set(Telemetry, null)
        val analytics=context.getSharedPreferences("com.google.android.gms.measurement.prefs",0)
        analytics.edit().putBoolean("measurement_enabled",true).putBoolean("measurement_enabled_from_api",true).commit()
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
                val delegate=super.getSharedPreferences(name,mode)
                if(name!="com.google.android.gms.measurement.prefs") return delegate
                return object:android.content.SharedPreferences by delegate {
                    override fun edit()=rejectingPreferencesEditor()
                }
            }
        }
        configured.clear()
        Telemetry.init(wrapped,sink)
        assertTrue(configured.isEmpty())
        Telemetry.update(true,false,true)
        assertTrue(Telemetry.settings().getBoolean("analytics"))
        Telemetry.event("ui_action")
        assertTrue(received.isEmpty())
        assertTrue(configured.isEmpty())

        // The next startup can reconcile the current explicit choice, then safely enable it.
        Telemetry.init(context,sink)
        assertEquals(true to false,configured.last())
        assertTrue(analytics.getBoolean("measurement_enabled",false))
        assertTrue(analytics.getBoolean("measurement_enabled_from_api",false))
    }
    @Test fun failedCrashPreferenceReconciliationAlsoKeepsSdkInitializationBlocked() {
        val crashPrefs=context.getSharedPreferences("com.google.firebase.crashlytics",0)
        crashPrefs.edit().clear().commit()
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
                val delegate=super.getSharedPreferences(name,mode)
                if(name!="com.google.firebase.crashlytics") return delegate
                return object:android.content.SharedPreferences by delegate {
                    override fun edit()=rejectingPreferencesEditor()
                }
            }
        }
        assertFalse(Telemetry.prepare(wrapped))
        assertTrue(crashPrefs.contains("firebase_crashlytics_collection_enabled").not())
    }
    @Test fun parametersAreAllowListedAndRejectPrivatePayloadsAndNonFiniteNumbers() {
        Telemetry.update(true,true,true)
        Telemetry.event("unrecognised",JSONObject().put("value","safe"));assertTrue(received.isEmpty())
        Telemetry.event("ui_action",JSONObject().put("action","help_opened").put("rating",4).put("email","person@example.com").put("value","file:///private.jpg").put("scale",JSONObject.NULL).put("duration_ms",JSONObject()).put("message","private text").put("format","x".repeat(101)))
        val result=received.single().second
        assertEquals(setOf("action","rating"),result.keySet());assertEquals("help_opened",result.getString("action"));assertEquals(4.0,result.getDouble("rating"),0.0)
        Telemetry.event("screen_view",JSONObject().put("screen_name","home_ready"));assertEquals(2,received.size)
    }
    @Test fun failedSettingsWriteKeepsCollectionStateAndNonFiniteValuesAreDropped() {
        val preferences=context.getSharedPreferences("telemetry",0)
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
                if(name!="telemetry") return super.getSharedPreferences(name,mode)
                return object:android.content.SharedPreferences by preferences {
                    override fun edit()=rejectingPreferencesEditor()
                }
            }
        }
        Telemetry.init(wrapped,sink)
        try{Telemetry.update(true,true,true);fail("Expected failed preference write")}catch(_:IllegalStateException){}
        assertTrue(Telemetry.settings().getBoolean("analytics"))
        Telemetry.init(context,sink);Telemetry.update(true,false,true)
        val invalid=object:JSONObject(){override fun opt(key:String?):Any?=if(key=="duration_ms") Double.NaN else super.opt(key)}
        invalid.put("duration_ms",0);Telemetry.event("ui_action",invalid)
        assertTrue(received.single().second.isEmpty)
        reset();Telemetry.event("ui_action");Telemetry.observeJob(JSONObject(),JSONObject().put("state","FAILED"))
        assertEquals(1,received.size)
    }
    @Test fun failedOptOutPersistenceImmediatelySuppressesPreviouslyEnabledCollection() {
        Telemetry.update(true,true,true)
        val preferences=context.getSharedPreferences("telemetry",0)
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
                if(name!="telemetry") return super.getSharedPreferences(name,mode)
                return object:android.content.SharedPreferences by preferences {
                    override fun edit()=rejectingPreferencesEditor()
                }
            }
        }
        Telemetry.init(wrapped,sink)
        assertEquals(true to true,configured.last())
        try { Telemetry.update(true,false,true); fail("Expected failed preference write") }
        catch (_:IllegalStateException) {}
        assertEquals(true,preferences.getBoolean("analytics",false))
        assertEquals(true,preferences.getBoolean("crashes",false))
        assertEquals(true to false,configured.last())
        Telemetry.event("ui_action")
        assertEquals("an analytics opt-in remains active when only crash opt-out persistence fails",1,received.size)
        try { Telemetry.update(false,false,true); fail("Expected failed preference write") }
        catch (_:IllegalStateException) {}
        assertEquals(false to false,configured.last())
        Telemetry.event("ui_action")
        assertEquals(1,received.size)
    }
    @Test fun failedOptInBeforeSinkInitializationDoesNotTouchASink() {
        Telemetry::class.java.getDeclaredField("sink").apply{isAccessible=true}.set(Telemetry,null)
        val preferences=context.getSharedPreferences("telemetry",0)
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
                if(name!="telemetry") return super.getSharedPreferences(name,mode)
                return object:android.content.SharedPreferences by preferences {
                    override fun edit()=rejectingPreferencesEditor()
                }
            }
        }
        Telemetry::class.java.getDeclaredField("context").apply{isAccessible=true}.set(Telemetry,wrapped)
        configured.clear()
        try { Telemetry.update(true,true,true); fail("Expected failed preference write") }
        catch (_:IllegalStateException) { }
        assertTrue(configured.isEmpty())
    }
    @Test fun terminalJobIsRecordedOnceAndGpuFallbackKeepsAttemptContext() {
        Telemetry.update(true,false,true)
        val before=JSONObject().put("backend","GPU")
        val next=JSONObject().put("jobId","attempt-1").put("mode","natural").put("backend","CPU").put("scale",4).put("state","RUNNING").put("modelId","model-v1")
        Telemetry.observeJob(before,next)
        assertEquals("job_backend_changed",received.single().first)
        Telemetry.observeJob(before,JSONObject(next.toString()).put("backend","GPU"))
        assertEquals("same-backend GPU progress does not report a fallback",1,received.size)
        assertEquals("attempt-1",received.single().second.getString("attempt_token"))
        for((state,error,status) in listOf(Triple("SUCCEEDED","","success"),Triple("CANCELLED","","cancelled"),Triple("INTERRUPTED","","interrupted"),Triple("FAILED","TIME_LIMIT","time_limit"),Triple("FAILED","LOW_MEMORY","error"))) {
            val job=JSONObject(next.toString()).put("jobId",state+error).put("state",state).put("error",error).put("elapsedMs",123)
            Telemetry.observeJob(JSONObject(),job);Telemetry.observeJob(job,job)
            assertEquals(status,received.last().second.getString("status"))
        }
        assertEquals(6,received.size)
        Telemetry.observeJob(JSONObject(),JSONObject().put("state","FAILED"))
        assertEquals(6,received.size)
        Telemetry.observeJob(JSONObject().put("backend","CPU"),JSONObject().put("backend","CPU").put("state","RUNNING"))
        assertEquals(6,received.size)
        Telemetry.update(false,false,true)
        val offline=JSONObject(next.toString()).put("jobId","opted-out").put("state","SUCCEEDED")
        Telemetry.observeJob(next,offline);Telemetry.update(true,false,true);Telemetry.observeJob(offline,offline)
        assertEquals(6,received.size)
    }
    @Test fun ratingTelemetryContainsBoundedRecreateContextButNeverPromptOrSourceData() {
        val job = JSONObject().put("jobId", "attempt-7").put("processingKind", "recreate")
            .put("profileId", "standard").put("modelId", "sd15-q4").put("recommendedProfile", "")
            .put("recommendationApplied", false).put("speed", "fast").put("scale", 2).put("backend", "CPU")
            .put("aiInputWidth", 256).put("aiInputHeight", 192).put("resultWidth", 512).put("resultHeight", 384)
            .put("elapsedMs", 1234).put("recreateSteps", 4).put("recreateModelRevision", "revision-1")
            .put("recreatePrompt", "private cat details")
            .put("image", JSONObject().put("width", 800).put("height", 600).put("workWidth", 256)
                .put("workHeight", 192).put("mime", "image/jpeg").put("hasAlpha", true)
                .put("sourcePath", "/private/image.jpg"))
        val context = Telemetry.ratingContext(job, 5)
        assertEquals(24, context.length())
        assertEquals("recreate", context.getString("processing_kind"))
        assertEquals("jpeg", context.getString("source_format"))
        assertEquals(1, context.getInt("has_alpha"))
        assertEquals(4, context.getInt("steps"))
        assertEquals(1, context.getInt("prompt_present"))
        assertFalse(context.toString().contains("private cat details"))
        assertFalse(context.toString().contains("/private/image.jpg"))
    }
    @Test fun enhanceRatingSchemaHandlesEveryKnownFormatAndMissingImageWithoutInventingData() {
        val mimeFormats = listOf("image/png" to "png", "image/jpeg" to "jpeg", "image/webp" to "webp", "image/gif" to "other")
        mimeFormats.forEachIndexed { index, (mime, expected) ->
            val image = JSONObject().put("width", 20).put("height", 10).put("workWidth", 8)
                .put("workHeight", 4).put("mime", mime).put("hasAlpha", false)
            val job = JSONObject().put("jobId", "enhance-$index").put("processingKind", "enhance")
                .put("mode", "details").put("modelId", "realesrgan").put("scale", 2)
                .put("speed", "quality").put("backend", "CPU").put("resultWidth", 16)
                .put("resultHeight", 8).put("elapsedMs", 10).put("image", image)
            val context = Telemetry.ratingContext(job, 3)
            assertEquals(19, context.length())
            assertEquals(expected, context.getString("source_format"))
            assertEquals(8, context.getInt("input_width"))
            assertEquals(0, context.getInt("has_alpha"))
            assertFalse(context.has("prompt_present"))
        }
        val noImage = Telemetry.ratingContext(JSONObject().put("jobId", "no-image"), 1)
        assertEquals("other", noImage.getString("source_format"))
        assertEquals(0, noImage.getInt("source_width"))
        assertEquals(0, noImage.getInt("input_height"))
    }
    @Test fun jobSizeCategoriesAndLegacyModelIdsContainNoFileInformation() {
        for((size,category) in listOf(100 to "small",700 to "medium",1024 to "large")) {
            val job=JSONObject().put("mode","quality").put("image",JSONObject().put("workWidth",size).put("workHeight",size).put("previewUri","file:///private"))
            val result=Telemetry.jobContext(job)
            assertEquals(category,result.getString("size_bucket"));assertEquals("standard",result.getString("profile_id"))
            assertFalse(result.toString().contains("private"))
        }
        assertEquals("small",Telemetry.jobContext(JSONObject()).getString("size_bucket"))
    }
    @Test fun ratingContextCarriesOnlyBoundedJobScalarsAndNoUserContent() {
        val job=JSONObject().put("jobId","safe-token").put("mode","quality").put("speed","quality").put("scale",4).put("backend","CPU").put("modelId","realesrgan-x4plus").put("phase","complete").put("recommendedProfile","balanced").put("recommendationApplied",true).put("recreatePrompt","private words").put("image",JSONObject().put("width",1200).put("height",900).put("workWidth",800).put("workHeight",600).put("sourcePath","/private/cat.png"))
        val context=Telemetry.jobContext(job)
        assertTrue(context.length()<=25)
        assertEquals(1200,context.getInt("image_width"));assertEquals(900,context.getInt("image_height"));assertEquals("balanced",context.getString("recommended_profile"));assertEquals(1,context.getInt("recommendation_applied"))
        assertFalse(context.toString().contains("private"));assertFalse(context.toString().contains("cat.png"))
    }
}
