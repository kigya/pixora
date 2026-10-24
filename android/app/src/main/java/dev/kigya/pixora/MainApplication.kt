package dev.kigya.pixora

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import com.google.firebase.FirebaseApp
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import expo.modules.ExpoReactHostFactory.getDefaultReactHost
import expo.modules.ApplicationLifecycleDispatcher
import android.content.res.Configuration

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(UpscalePackage())
        },
    )
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this,newConfig)
  }

  override fun onCreate() {
    super.onCreate()
    // A failed marker write is retried by getSettings; it must not prevent startup.
    try { OnboardingStore.version(this) } catch (_: Exception) { }
    AppCompatDelegate.setDefaultNightMode(ThemePolicy.nightMode(getSharedPreferences("settings", MODE_PRIVATE).getString("theme","system")))
    // Keep the app usable offline if durable consent reconciliation fails. Firebase components
    // must not initialize until stale SDK collection overrides are safely removed or reconciled.
    val telemetryReady = Telemetry.prepare(this)
    val firebaseReady = if (telemetryReady) {
      try {
        FirebaseApp.initializeApp(this) != null
      } catch (_: Exception) {
        false
      }
    } else false
    if (firebaseReady) Telemetry.initPrepared()
    ProfileAvailability.init(this)
    if (firebaseReady) ProfileAvailability.fetchOnce()
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }
}
