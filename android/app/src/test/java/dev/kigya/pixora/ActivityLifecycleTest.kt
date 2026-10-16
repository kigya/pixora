package dev.kigya.pixora

import android.app.Application
import android.content.res.Configuration
import android.os.Bundle
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Mock only the vendor React rendering delegate; execute our real Activity lifecycle. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ActivityLifecycleTest {
    @Test fun restoresScreenFactoryTracksWindowAndUpdatesSystemBarsAfterThemeChange() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use { delegates ->
            val controller = Robolectric.buildActivity(MainActivity::class.java)
            val activity = controller.get()
            activity.setTheme(dev.kigya.pixora.R.style.AppTheme)
            controller.create(Bundle()).start().resume().visible()
            assertTrue(activity.supportFragmentManager.fragmentFactory is RNScreensFragmentFactory)
            val delegate = delegates.constructed().single()
            verify(delegate).onCreate(any(Bundle::class.java))
            assertEquals("UpscaleImage", MainActivity::class.java.getDeclaredMethod("getMainComponentName").apply { isAccessible = true }.invoke(activity))
            for (theme in listOf("dark", "light", "system")) {
                activity.getSharedPreferences("settings", 0).edit().putString("theme", theme).commit()
                val config = Configuration(activity.resources.configuration).apply {
                    uiMode = Configuration.UI_MODE_NIGHT_YES
                }
                activity.onConfigurationChanged(config)
                val controllerCompat = androidx.core.view.WindowInsetsControllerCompat(activity.window, activity.window.decorView)
                assertEquals(!ThemePolicy.isDark(theme, activity.resources.configuration), controllerCompat.isAppearanceLightNavigationBars)
            }
            controller.pause().stop().destroy()
            verify(delegate).onPause()
            verify(delegate).onDestroy()
        }
    }
}
