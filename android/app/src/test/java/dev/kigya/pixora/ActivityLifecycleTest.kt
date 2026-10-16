package dev.kigya.pixora

import android.app.Application
import android.content.res.Configuration
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import android.view.View
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.Shadows
import java.time.Duration

/** Mock only the vendor React rendering delegate; execute our real Activity lifecycle. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ActivityLifecycleTest {
    private fun startupDeadline(activity: MainActivity): Long =
        MainActivity::class.java.getDeclaredField("startupDeadline")
            .apply { isAccessible = true }.getLong(activity)

    @Test fun startupWaitsForBothReadinessAndTheDeadlineBeforeDrawing() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use {
            val controller = Robolectric.buildActivity(MainActivity::class.java)
            val activity = controller.get()
            activity.setTheme(dev.kigya.pixora.R.style.AppTheme)
            controller.create().start().resume()
            val content = activity.findViewById<View>(android.R.id.content)
            val remaining = startupDeadline(activity) - SystemClock.uptimeMillis()
            assertTrue("Activity setup must leave time before the startup deadline", remaining > 1L)

            assertTrue(content.viewTreeObserver.dispatchOnPreDraw()) // A listener canceled drawing: not ready yet.
            activity.finishStartup()
            assertTrue(content.viewTreeObserver.dispatchOnPreDraw()) // Still canceled: ready, but before 1500 ms.
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(remaining - 1L))
            assertTrue(content.viewTreeObserver.dispatchOnPreDraw())
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1))
            assertFalse(content.viewTreeObserver.dispatchOnPreDraw()) // No cancellation; draw is allowed.

            controller.pause().stop().destroy()
        }
    }

    @Test fun startupCompletionBeforeContentCreationStillWaitsForTheDeadline() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use {
            val controller = Robolectric.buildActivity(MainActivity::class.java)
            val activity = controller.get()
            activity.finishStartup() // The nullable content path is safe before onCreate.
            activity.setTheme(dev.kigya.pixora.R.style.AppTheme)
            controller.create().start().resume()
            val content = activity.findViewById<View>(android.R.id.content)
            val remaining = startupDeadline(activity) - SystemClock.uptimeMillis()
            assertTrue("Activity setup must leave time before the startup deadline", remaining > 0L)

            assertTrue(content.viewTreeObserver.dispatchOnPreDraw()) // Ready, but deadline has not elapsed.
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(remaining))
            assertFalse(content.viewTreeObserver.dispatchOnPreDraw())

            controller.pause().stop().destroy()
        }
    }

    @Test fun destroyRemovesPendingStartupGateAndRecreatedActivityGetsANewGate() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use {
            val firstController = Robolectric.buildActivity(MainActivity::class.java)
            val first = firstController.get()
            first.setTheme(dev.kigya.pixora.R.style.AppTheme)
            firstController.create().start().resume()
            val oldContent = first.findViewById<View>(android.R.id.content)
            val oldObserver = oldContent.viewTreeObserver
            assertTrue(oldObserver.dispatchOnPreDraw()) // Pending startup gate cancels drawing.

            firstController.pause().stop().destroy()
            assertNull(MainActivity::class.java.getDeclaredField("startupDrawCleanup")
                .apply { isAccessible = true }.get(first))
            assertNull(MainActivity::class.java.getDeclaredField("startupContent")
                .apply { isAccessible = true }.get(first))
            assertFalse("Destroyed Activity must remove its pending draw gate", oldObserver.dispatchOnPreDraw())

            val secondController = Robolectric.buildActivity(MainActivity::class.java)
            val second = secondController.get()
            second.setTheme(dev.kigya.pixora.R.style.AppTheme)
            secondController.create().start().resume()
            val newContent = second.findViewById<View>(android.R.id.content)
            val remaining = startupDeadline(second) - SystemClock.uptimeMillis()
            assertTrue("Recreated Activity must receive a future startup deadline", remaining > 0L)
            assertTrue(newContent.viewTreeObserver.dispatchOnPreDraw()) // New instance cancels drawing until ready.
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(remaining))
            assertTrue(newContent.viewTreeObserver.dispatchOnPreDraw()) // Deadline alone is insufficient.
            second.finishStartup()
            assertFalse(newContent.viewTreeObserver.dispatchOnPreDraw())

            secondController.pause().stop().destroy()
        }
    }

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
