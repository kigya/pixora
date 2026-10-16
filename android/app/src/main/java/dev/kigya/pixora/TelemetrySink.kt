package dev.kigya.pixora

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics

/** SDK boundary; product events and privacy rules stay in Telemetry. */
internal interface TelemetrySink {
    fun configure(analytics: Boolean, crashes: Boolean)
    fun log(name: String, parameters: Bundle)
}
internal class FirebaseTelemetrySink(private val context: Context) : TelemetrySink {
    private var analyticsClient: FirebaseAnalytics? = null
    private var crashlyticsClient: FirebaseCrashlytics? = null
    override fun configure(analytics: Boolean, crashes: Boolean) {
        if (analytics) {
            analyticsClient = FirebaseAnalytics.getInstance(context).apply {
                setConsent(mapOf(
                    FirebaseAnalytics.ConsentType.AD_STORAGE to FirebaseAnalytics.ConsentStatus.DENIED,
                    FirebaseAnalytics.ConsentType.AD_USER_DATA to FirebaseAnalytics.ConsentStatus.DENIED,
                    FirebaseAnalytics.ConsentType.AD_PERSONALIZATION to FirebaseAnalytics.ConsentStatus.DENIED,
                ))
                setAnalyticsCollectionEnabled(true)
            }
        } else {
            analyticsClient?.setAnalyticsCollectionEnabled(false)
        }
        if (crashes) {
            crashlyticsClient = FirebaseCrashlytics.getInstance().apply {
                setCrashlyticsCollectionEnabled(true)
            }
        } else {
            (crashlyticsClient ?: FirebaseCrashlytics.getInstance()).apply {
                setCrashlyticsCollectionEnabled(false)
                deleteUnsentReports()
                crashlyticsClient = null
            }
        }
    }
    override fun log(name: String, parameters: Bundle) {
        analyticsClient?.logEvent(name, parameters)
    }
}
