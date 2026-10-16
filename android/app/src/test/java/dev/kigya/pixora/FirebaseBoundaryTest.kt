package dev.kigya.pixora

import android.app.Application
import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.annotation.Config

/** Mocks only the vendor SDK boundary: our callback chain and privacy rules execute. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class FirebaseBoundaryTest {
    @Test fun collectionNeverGrantsAdvertisingConsentAndDeletesOptedOutReports() {
        val context:Context=RuntimeEnvironment.getApplication()
        val analytics=mock(FirebaseAnalytics::class.java)
        val crashes=mock(FirebaseCrashlytics::class.java)
        mockStatic(FirebaseAnalytics::class.java).use { analyticsStatic ->
            mockStatic(FirebaseCrashlytics::class.java).use { crashStatic ->
                analyticsStatic.`when`<FirebaseAnalytics>{FirebaseAnalytics.getInstance(context)}.thenReturn(analytics)
                crashStatic.`when`<FirebaseCrashlytics>{FirebaseCrashlytics.getInstance()}.thenReturn(crashes)
                val sink=FirebaseTelemetrySink(context)
                val parameters=android.os.Bundle().apply{putString("action","help_opened")}
                sink.log("before_configuration",parameters)
                verify(analytics,never()).logEvent("before_configuration",parameters)
                sink.configure(true,true)
                sink.log("ui_action",parameters);verify(analytics).logEvent("ui_action",parameters)
                sink.configure(false,false)
                verify(analytics).setAnalyticsCollectionEnabled(true);verify(analytics).setAnalyticsCollectionEnabled(false)
                verify(crashes).setCrashlyticsCollectionEnabled(true);verify(crashes).setCrashlyticsCollectionEnabled(false)
                verify(crashes,times(1)).deleteUnsentReports()
                verify(analytics,times(1)).setConsent(mapOf(
                    FirebaseAnalytics.ConsentType.AD_STORAGE to FirebaseAnalytics.ConsentStatus.DENIED,
                    FirebaseAnalytics.ConsentType.AD_USER_DATA to FirebaseAnalytics.ConsentStatus.DENIED,
                    FirebaseAnalytics.ConsentType.AD_PERSONALIZATION to FirebaseAnalytics.ConsentStatus.DENIED))
            }
        }
    }
    @Test fun remoteFetchUsesEightDefaultsAndCorrectSettingsAndReturnsEveryFlag() {
        val config=mock(FirebaseRemoteConfig::class.java)
        mockStatic(FirebaseRemoteConfig::class.java).use { sdk ->
            sdk.`when`<FirebaseRemoteConfig>{FirebaseRemoteConfig.getInstance()}.thenReturn(config)
            `when`(config.setConfigSettingsAsync(any(FirebaseRemoteConfigSettings::class.java))).thenReturn(Tasks.forResult(null))
            `when`(config.setDefaultsAsync(anyMap<String,Any>())).thenReturn(Tasks.forResult(null))
            `when`(config.fetchAndActivate()).thenReturn(Tasks.forResult(false))
            ProcessingProfiles.presets.forEach{`when`(config.getBoolean("pixora_profile_${it}_enabled")).thenReturn(it!="pixel")}
            var outcome:Result<Map<String,Boolean>>?=null
            FirebaseProfileConfigSource().fetch{outcome=it}
            repeat(20){Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()}
            val flags=outcome!!.getOrThrow();assertEquals(8,flags.size);assertFalse(flags.getValue("pixel"));assertTrue(flags.getValue("standard"))
            val settings=org.mockito.ArgumentCaptor.forClass(FirebaseRemoteConfigSettings::class.java)
            verify(config).setConfigSettingsAsync(settings.capture())
            assertEquals(10L,settings.value.fetchTimeoutInSeconds);assertEquals(0L,settings.value.minimumFetchIntervalInSeconds)
            verify(config).setDefaultsAsync(ProcessingProfiles.presets.associate{"pixora_profile_${it}_enabled" to true})
            verify(config,times(1)).fetchAndActivate()
        }
    }
    @Test fun errorsAndCancellationAtAnySdkStageReturnFailureRatherThanPartialFlags() {
        for(stage in 0..2)for(cancelled in listOf(false,true)) {
            val config=mock(FirebaseRemoteConfig::class.java)
            mockStatic(FirebaseRemoteConfig::class.java).use { sdk ->
                sdk.`when`<FirebaseRemoteConfig>{FirebaseRemoteConfig.getInstance()}.thenReturn(config)
                fun <T> failed():Task<T> = if(cancelled) Tasks.forCanceled() else Tasks.forException(java.io.IOException("controlled offline"))
                `when`(config.setConfigSettingsAsync(any(FirebaseRemoteConfigSettings::class.java))).thenReturn(if(stage==0)failed() else Tasks.forResult(null))
                `when`(config.setDefaultsAsync(anyMap<String,Any>())).thenReturn(if(stage==1)failed() else Tasks.forResult(null))
                `when`(config.fetchAndActivate()).thenReturn(if(stage==2)failed() else Tasks.forResult(true))
                var outcome:Result<Map<String,Boolean>>?=null
                FirebaseProfileConfigSource().fetch{outcome=it}
                repeat(20){Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()}
                assertTrue("stage=$stage cancelled=$cancelled",outcome!!.isFailure)
                verify(config,never()).getBoolean(anyString())
            }
        }
    }
}
