package dev.kigya.pixora

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

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

  override fun onCreate() {
    super.onCreate()
    AppCompatDelegate.setDefaultNightMode(ThemePolicy.nightMode(getSharedPreferences("settings", MODE_PRIVATE).getString("theme","system")))
    Telemetry.init(this)
    ProfileAvailability.init(this)
    ProfileAvailability.fetchOnce()
    loadReactNative(this)
  }
}
