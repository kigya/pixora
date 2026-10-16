package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import com.facebook.react.PackageList
import com.facebook.react.ReactNativeApplicationEntryPoint
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import java.util.concurrent.atomic.AtomicBoolean

/** Execute startup ordering while replacing only SDK/native-renderer boundaries. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ApplicationStartupTest {
    @After fun reset() {
        for (name in listOf("context", "sink"))
            Telemetry::class.java.getDeclaredField(name).apply { isAccessible = true }.set(Telemetry, null)
        val fetched = ProfileAvailability::class.java.getDeclaredField("fetched").apply { isAccessible = true }.get(ProfileAvailability) as AtomicBoolean
        fetched.set(false)
    }

    @Test fun legacyConsentIsRemovedBeforeFirebaseAndRemoteConfigurationStillFetches() = startup(0, "ready")
    @Test fun explicitConsentReplacesStaleSdkPreferencesBeforeFirebase() = startup(2, "ready")
    @Test fun failedReconciliationSkipsFirebaseAndStillLoadsOfflineApplication() = startup(2, "disk-failure")
    @Test fun missingFirebaseConfigurationStillLoadsOfflineApplication() = startup(2, "null")
    @Test fun failedFirebaseInitializationStillLoadsOfflineApplication() = startup(2, "throws")

    private fun startup(version: Int, outcome: String) {
        val app = MainApplication()
        org.robolectric.util.ReflectionHelpers.callInstanceMethod<Void>(app, "attach",
            org.robolectric.util.ReflectionHelpers.ClassParameter.from(Context::class.java, org.robolectric.RuntimeEnvironment.getApplication()))
        val measurement = app.getSharedPreferences("com.google.android.gms.measurement.prefs", 0)
        val crashPrefs = app.getSharedPreferences("com.google.firebase.crashlytics", 0)
        val consent = app.getSharedPreferences("telemetry", 0)
        consent.edit().clear().putInt("consentVersion", version).putBoolean("analytics", false).putBoolean("crashes", true).commit()
        measurement.edit().clear().putBoolean("measurement_enabled", true).putBoolean("measurement_enabled_from_api", true).commit()
        crashPrefs.edit().clear().putBoolean("firebase_crashlytics_collection_enabled", false).commit()
        val target = if (outcome == "disk-failure") spy(app).apply {
            val wrapped = object: ContextWrapper(app) {
                override fun getApplicationContext(): Context = this
                override fun getSharedPreferences(name: String, mode: Int): android.content.SharedPreferences {
                    val delegate = super.getSharedPreferences(name, mode)
                    if (name != "com.google.android.gms.measurement.prefs") return delegate
                    return object: android.content.SharedPreferences by delegate {
                        override fun edit() = rejectingPreferencesEditor()
                    }
                }
            }
            doReturn(wrapped).`when`(this).applicationContext
        } else app
        val analytics = mock(FirebaseAnalytics::class.java)
        val crashes = mock(FirebaseCrashlytics::class.java)
        val config = mock(FirebaseRemoteConfig::class.java)
        `when`(config.setConfigSettingsAsync(any(FirebaseRemoteConfigSettings::class.java))).thenReturn(Tasks.forResult(null))
        `when`(config.setDefaultsAsync(anyMap<String, Any>())).thenReturn(Tasks.forResult(null))
        `when`(config.fetchAndActivate()).thenReturn(Tasks.forException(java.io.IOException("controlled offline")))
        mockStatic(ReactNativeApplicationEntryPoint::class.java).use { renderer ->
            mockStatic(FirebaseApp::class.java).use { firebase ->
                mockStatic(FirebaseAnalytics::class.java).use { analyticsStatic ->
                    mockStatic(FirebaseCrashlytics::class.java).use { crashStatic ->
                        mockStatic(FirebaseRemoteConfig::class.java).use { configStatic ->
                            analyticsStatic.`when`<FirebaseAnalytics> { FirebaseAnalytics.getInstance(any(Context::class.java)) }.thenReturn(analytics)
                            crashStatic.`when`<FirebaseCrashlytics> { FirebaseCrashlytics.getInstance() }.thenReturn(crashes)
                            configStatic.`when`<FirebaseRemoteConfig> { FirebaseRemoteConfig.getInstance() }.thenReturn(config)
                            firebase.`when`<FirebaseApp> { FirebaseApp.initializeApp(target) }.thenAnswer {
                                if (version == 2) {
                                    assertFalse(measurement.getBoolean("measurement_enabled", true))
                                    assertFalse(measurement.getBoolean("measurement_enabled_from_api", true))
                                    assertTrue(crashPrefs.getBoolean("firebase_crashlytics_collection_enabled", false))
                                } else {
                                    assertFalse(measurement.contains("measurement_enabled"))
                                    assertFalse(measurement.contains("measurement_enabled_from_api"))
                                    assertFalse(crashPrefs.contains("firebase_crashlytics_collection_enabled"))
                                }
                                when (outcome) {
                                    "throws" -> throw IllegalStateException("controlled configuration failure")
                                    "null" -> null
                                    else -> mock(FirebaseApp::class.java)
                                }
                            }
                            target.onCreate()
                            repeat(10) { Shadows.shadowOf(android.os.Looper.getMainLooper()).idle() }
                            renderer.verify { ReactNativeApplicationEntryPoint.loadReactNative(target) }
                            assertTrue(ProfileAvailability.snapshot().getBoolean("lite"))
                            if (outcome == "disk-failure") firebase.verifyNoInteractions()
                            else firebase.verify { FirebaseApp.initializeApp(target) }
                            if (outcome == "ready") { verify(config).fetchAndActivate(); Unit }
                            else { configStatic.verifyNoInteractions(); analyticsStatic.verifyNoInteractions(); crashStatic.verifyNoInteractions() }
                            Unit
                        }
                    }
                }
            }
        }
    }
}
