package dev.kigya.pixora

import android.os.Bundle
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  private val tracker by lazy { androidx.window.java.layout.WindowInfoTrackerCallbackAdapter(androidx.window.layout.WindowInfoTracker.getOrCreate(this)) }
  private val layoutListener=androidx.core.util.Consumer<androidx.window.layout.WindowLayoutInfo>{WindowLayout.publish(it,this)}
  override fun onStart(){super.onStart();tracker.addWindowLayoutInfoListener(this,androidx.core.content.ContextCompat.getMainExecutor(this),layoutListener)}
  override fun onStop(){tracker.removeWindowLayoutInfoListener(layoutListener);super.onStop()}

  override fun onCreate(savedInstanceState: Bundle?) {
    // Navigation screens must use the library's factory when Android restores
    // saved fragments after process death or a configuration change.
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(savedInstanceState)
    updateSystemBars()
  }

  override fun onConfigurationChanged(configuration: android.content.res.Configuration) {
    super.onConfigurationChanged(configuration)
    updateSystemBars()
  }

  private fun updateSystemBars() {
    val theme=getSharedPreferences("settings", MODE_PRIVATE).getString("theme","system")
    androidx.core.view.WindowInsetsControllerCompat(window,window.decorView).isAppearanceLightNavigationBars=
        !ThemePolicy.isDark(theme,resources.configuration)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "UpscaleImage"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which uses the pinned New Architecture template
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)
}
