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
    @Test fun collectionSettingsAreIndependentAndDisabledByDefaultInCoverage() {
        assertEquals(false to false,configured.single())
        val initial=Telemetry.settings();assertFalse(initial.getBoolean("noticeSeen"))
        assertFalse(initial.getBoolean("analytics"));assertFalse(initial.getBoolean("crashes"))
        Telemetry.update(true,false,true);assertEquals(true to false,configured.last())
        Telemetry.update(false,true,true);assertEquals(false to true,configured.last())
        assertTrue(Telemetry.settings().getBoolean("noticeSeen"));assertEquals(Telemetry.consentVersion,Telemetry.settings().getInt("consentVersion"))
        Telemetry.event("ui_action");assertTrue(received.isEmpty())
    }
    @Test fun legacyEnabledFlagsAndNoticeAreNotConsentAndInitializeOff() {
        context.getSharedPreferences("telemetry",0).edit()
            .putBoolean("analytics",true).putBoolean("crashes",true)
            .putBoolean("noticeSeen",true).putInt("consentVersion",1).commit()
        configured.clear()
        Telemetry.init(context,sink)
        assertEquals(listOf(false to false),configured)
        val migrated=Telemetry.settings()
        assertFalse(migrated.getBoolean("analytics"));assertFalse(migrated.getBoolean("crashes"))
        assertTrue(migrated.getBoolean("noticeSeen"));assertEquals(1,migrated.getInt("consentVersion"))
        Telemetry.event("ui_action")
        assertTrue(received.isEmpty())
    }
    @Test fun preFirebaseMigrationClearsOnlyKnownLegacySdkCollectionOverrides() {
        context.getSharedPreferences("telemetry",0).edit().putInt("consentVersion",1).commit()
        val analytics=context.getSharedPreferences("com.google.android.gms.measurement.prefs",0)
        analytics.edit().putBoolean("measurement_enabled",true).putString("unrelated", "keep").commit()
        val crashlytics=context.getSharedPreferences("com.google.firebase.crashlytics",0)
        crashlytics.edit().putBoolean("firebase_crashlytics_collection_enabled",true).putString("unrelated", "keep").commit()
        Telemetry.prepare(context)
        assertFalse(analytics.contains("measurement_enabled"));assertEquals("keep",analytics.getString("unrelated",null))
        assertFalse(crashlytics.contains("firebase_crashlytics_collection_enabled"));assertEquals("keep",crashlytics.getString("unrelated",null))
        Telemetry.init(context,sink)
        assertEquals(false to false,configured.last())
    }
    @Test fun preFirebaseMigrationReconcilesCurrentConsentOverStaleSdkOverrides() {
        context.getSharedPreferences("telemetry",0).edit()
            .putInt("consentVersion",Telemetry.consentVersion).putBoolean("analytics",false).putBoolean("crashes",true).commit()
        val analytics=context.getSharedPreferences("com.google.android.gms.measurement.prefs",0)
        analytics.edit().putBoolean("measurement_enabled",true).commit()
        val crashlytics=context.getSharedPreferences("com.google.firebase.crashlytics",0)
        crashlytics.edit().putBoolean("firebase_crashlytics_collection_enabled",false).commit()
        Telemetry.prepare(context)
        assertFalse(analytics.getBoolean("measurement_enabled",true))
        assertTrue(crashlytics.getBoolean("firebase_crashlytics_collection_enabled",false))
    }
    @Test fun failedStartupReconciliationKeepsSettingsUsableAndTelemetryInertUntilNextLaunch() {
        Telemetry::class.java.getDeclaredField("sink").apply { isAccessible = true }.set(Telemetry, null)
        val analytics=context.getSharedPreferences("com.google.android.gms.measurement.prefs",0)
        analytics.edit().putBoolean("measurement_enabled",true).commit()
        val wrapped=object:android.content.ContextWrapper(context) {
            override fun getApplicationContext():Context=this
            override fun getSharedPreferences(name:String,mode:Int):android.content.SharedPreferences {
                val delegate=super.getSharedPreferences(name,mode)
                if(name!="com.google.android.gms.measurement.prefs") return delegate
                return object:android.content.SharedPreferences by delegate {
                    override fun edit()=object:android.content.SharedPreferences.Editor by delegate.edit() {
                        override fun commit()=false
                    }
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
            override fun getSharedPreferences(name:String,mode:Int)=object:android.content.SharedPreferences by preferences {
                override fun edit()=object:android.content.SharedPreferences.Editor by preferences.edit() {
                    override fun putString(key:String?,value:String?):android.content.SharedPreferences.Editor=this
                    override fun putBoolean(key:String?,value:Boolean):android.content.SharedPreferences.Editor=this
                    override fun commit()=false
                }
            }
        }
        Telemetry.init(wrapped,sink)
        try{Telemetry.update(true,true,true);fail("Expected failed preference write")}catch(_:IllegalStateException){}
        assertFalse(Telemetry.settings().getBoolean("analytics"))
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
            override fun getSharedPreferences(name:String,mode:Int)=object:android.content.SharedPreferences by preferences {
                override fun edit()=object:android.content.SharedPreferences.Editor by preferences.edit() {
                    override fun putBoolean(key:String?,value:Boolean):android.content.SharedPreferences.Editor=this
                    override fun commit()=false
                }
            }
        }
        Telemetry.init(wrapped,sink)
        assertEquals(true to true,configured.last())
        try { Telemetry.update(false,false,true); fail("Expected failed preference write") }
        catch (_:IllegalStateException) {}
        assertEquals(true,preferences.getBoolean("analytics",false))
        assertEquals(true,preferences.getBoolean("crashes",false))
        assertEquals(false to false,configured.last())
        Telemetry.event("ui_action")
        assertTrue(received.isEmpty())
    }
    @Test fun terminalJobIsRecordedOnceAndGpuFallbackKeepsAttemptContext() {
        Telemetry.update(true,false,true)
        val before=JSONObject().put("backend","GPU")
        val next=JSONObject().put("jobId","attempt-1").put("mode","natural").put("backend","CPU").put("scale",4).put("state","RUNNING").put("modelId","model-v1")
        Telemetry.observeJob(before,next)
        assertEquals("job_backend_changed",received.single().first)
        assertEquals("attempt-1",received.single().second.getString("attempt_token"))
        for((state,error,status) in listOf(Triple("SUCCEEDED","","success"),Triple("CANCELLED","","cancelled"),Triple("INTERRUPTED","","interrupted"),Triple("FAILED","TIME_LIMIT","time_limit"),Triple("FAILED","LOW_MEMORY","error"))) {
            val job=JSONObject(next.toString()).put("jobId",state+error).put("state",state).put("error",error).put("elapsedMs",123)
            Telemetry.observeJob(JSONObject(),job);Telemetry.observeJob(job,job)
            assertEquals(status,received.last().second.getString("status"))
        }
        assertEquals(6,received.size)
        Telemetry.observeJob(JSONObject(),JSONObject().put("state","FAILED"))
        assertEquals(6,received.size)
        Telemetry.update(false,false,true)
        val offline=JSONObject(next.toString()).put("jobId","opted-out").put("state","SUCCEEDED")
        Telemetry.observeJob(next,offline);Telemetry.update(true,false,true);Telemetry.observeJob(offline,offline)
        assertEquals(6,received.size)
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
}
