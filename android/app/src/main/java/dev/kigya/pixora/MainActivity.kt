package dev.kigya.pixora

import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewTreeObserver
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  private val startupDeadline = SystemClock.uptimeMillis() + 1500L
  private var startupReady = false
  private var startupContent: View? = null
  private var startupDrawListener: ViewTreeObserver.OnPreDrawListener? = null

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
    // Keep the system splash until the initial data and navigation are ready.
    // Returning false only defers drawing; it never blocks the UI or JS thread.
    val content = findViewById<View>(android.R.id.content)
    startupContent = content
    val listener = object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        if (!startupReady || SystemClock.uptimeMillis() < startupDeadline) return false
        content.viewTreeObserver.removeOnPreDrawListener(this)
        startupDrawListener = null
        window.setBackgroundDrawableResource(R.color.window_background)
        return true
      }
    }
    startupDrawListener = listener
    content.viewTreeObserver.addOnPreDrawListener(listener)
    content.postDelayed({ content.postInvalidateOnAnimation() },
        (startupDeadline - SystemClock.uptimeMillis()).coerceAtLeast(0))
    updateSystemBars()
  }

  override fun onDestroy() {
    startupDrawListener?.let { startupContent?.viewTreeObserver?.removeOnPreDrawListener(it) }
    startupDrawListener = null
    startupContent = null
    super.onDestroy()
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
