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
    override fun configure(analytics: Boolean, crashes: Boolean) {
        FirebaseAnalytics.getInstance(context).apply {
            setConsent(mapOf(
                FirebaseAnalytics.ConsentType.AD_STORAGE to FirebaseAnalytics.ConsentStatus.DENIED,
                FirebaseAnalytics.ConsentType.AD_USER_DATA to FirebaseAnalytics.ConsentStatus.DENIED,
                FirebaseAnalytics.ConsentType.AD_PERSONALIZATION to FirebaseAnalytics.ConsentStatus.DENIED,
            ))
            setAnalyticsCollectionEnabled(analytics)
        }
        FirebaseCrashlytics.getInstance().apply {
            setCrashlyticsCollectionEnabled(crashes)
            if (!crashes) deleteUnsentReports()
        }
    }
    override fun log(name: String, parameters: Bundle) {
        FirebaseAnalytics.getInstance(context).logEvent(name, parameters)
    }
}
