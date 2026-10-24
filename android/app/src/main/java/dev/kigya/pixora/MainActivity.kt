package dev.kigya.pixora

import android.os.Bundle
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  private var startupReady = false
  private var startupContent: View? = null
  private var startupDrawCleanup: (() -> Unit)? = null

  fun finishStartup() {
    startupReady = true
    startupContent?.postInvalidateOnAnimation()
  }

  private val tracker by lazy { androidx.window.java.layout.WindowInfoTrackerCallbackAdapter(androidx.window.layout.WindowInfoTracker.getOrCreate(this)) }
  private val layoutListener=androidx.core.util.Consumer<androidx.window.layout.WindowLayoutInfo>{WindowLayout.publish(it,this)}
  override fun onStart(){super.onStart();tracker.addWindowLayoutInfoListener(this,androidx.core.content.ContextCompat.getMainExecutor(this),layoutListener)}
  override fun onStop(){tracker.removeWindowLayoutInfoListener(layoutListener);super.onStop()}

  override fun onCreate(savedInstanceState: Bundle?) {
    // Navigation screens must use the library's factory when Android restores
    // saved fragments after process death or a configuration change.
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(savedInstanceState)
    // Hand off the plain system background as soon as the Aurora frame is laid out.
    // Do not run a second native logo animation or minimum-duration timer.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      splashScreen.setOnExitAnimationListener { it.remove() }
    }
    // Returning false only defers drawing; it never blocks the UI or JS thread.
    val content = findViewById<View>(android.R.id.content)
    startupContent = content
    val listener = object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        if (!startupReady) return false
        content.viewTreeObserver.removeOnPreDrawListener(this)
        startupDrawCleanup = null
        window.setBackgroundDrawableResource(if (ThemePolicy.isDark(savedTheme(), resources.configuration)) R.color.window_background_dark else R.color.window_background_light)
        return true
      }
    }
    content.viewTreeObserver.addOnPreDrawListener(listener)
    // Capture the registered view and listener together for lifecycle cleanup.
    startupDrawCleanup = { content.viewTreeObserver.removeOnPreDrawListener(listener) }
    updateSystemBars()
  }

  override fun onDestroy() {
    startupDrawCleanup?.invoke()
    startupDrawCleanup = null
    startupContent = null
    super.onDestroy()
  }

  override fun onConfigurationChanged(configuration: android.content.res.Configuration) {
    super.onConfigurationChanged(configuration)
    updateSystemBars()
  }

  internal fun updateSystemBars() {
    val theme=savedTheme()
    val dark=ThemePolicy.isDark(theme,resources.configuration)
    window.setBackgroundDrawableResource(if(dark)R.color.window_background_dark else R.color.window_background_light)
    window.navigationBarColor=getColor(if(dark)R.color.window_background_dark else R.color.window_background_light)
    androidx.core.view.WindowInsetsControllerCompat(window,window.decorView).isAppearanceLightNavigationBars=
        !dark
    if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.S) {
      val platformSplash=splashScreen
      if(platformSplash!=null) ThemePolicy.updateLaunchSplash(Build.VERSION.SDK_INT,theme,platformSplash::setSplashScreenTheme)
    }
  }

  private fun savedTheme()=getSharedPreferences("settings", MODE_PRIVATE).getString("theme","system")

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which uses the pinned New Architecture template
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      ReactActivityDelegateWrapper(this, DefaultReactActivityDelegate(this, mainComponentName))
}
