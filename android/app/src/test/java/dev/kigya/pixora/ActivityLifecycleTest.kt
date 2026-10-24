package dev.kigya.pixora

import android.app.Application
import android.content.ComponentName
import android.content.res.Configuration
import android.os.Bundle
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
import org.robolectric.fakes.RoboSplashScreen

/** Mock only the vendor React rendering delegate; execute our real Activity lifecycle. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ActivityLifecycleTest {
    @Test fun mainActivityHandlesLocaleAndLayoutDirectionWithoutBeingRecreated() {
        val context=org.robolectric.RuntimeEnvironment.getApplication()
        val info=context.packageManager.getActivityInfo(ComponentName(context,MainActivity::class.java),0)

        assertTrue("locale changes must be delivered to the running React activity",info.configChanges and android.content.pm.ActivityInfo.CONFIG_LOCALE != 0)
        assertTrue("layout direction changes must be delivered to the running React activity",info.configChanges and android.content.pm.ActivityInfo.CONFIG_LAYOUT_DIRECTION != 0)
        assertTrue("existing orientation handling must remain declared",info.configChanges and android.content.pm.ActivityInfo.CONFIG_ORIENTATION != 0)
    }

    @Test fun startupWaitsForJavascriptReadinessBeforeDrawing() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use {
            val controller = Robolectric.buildActivity(MainActivity::class.java)
            val activity = controller.get()
            activity.setTheme(dev.kigya.pixora.R.style.AppTheme)
            controller.create().start().resume()
            val content = activity.findViewById<View>(android.R.id.content)
            assertTrue(content.viewTreeObserver.dispatchOnPreDraw()) // A listener canceled drawing: not ready yet.
            activity.finishStartup()
            assertFalse(content.viewTreeObserver.dispatchOnPreDraw()) // Readiness releases the only native draw gate.

            controller.pause().stop().destroy()
        }
    }

    @Test fun startupCompletionBeforeContentCreationStillAllowsFirstDraw() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use {
            val controller = Robolectric.buildActivity(MainActivity::class.java)
            val activity = controller.get()
            activity.finishStartup() // The nullable content path is safe before onCreate.
            activity.setTheme(dev.kigya.pixora.R.style.AppTheme)
            controller.create().start().resume()
            val content = activity.findViewById<View>(android.R.id.content)
            assertFalse(content.viewTreeObserver.dispatchOnPreDraw()) // Startup completed before the content listener existed.

            controller.pause().stop().destroy()
        }
    }

    @Test @Config(sdk=[29]) fun preAndroid12StartupUsesSavedLightAndDarkBackgroundWithoutPlatformSplashApi() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use {
            for (theme in listOf("light","dark")) {
                val controller=Robolectric.buildActivity(MainActivity::class.java)
                val activity=controller.get()
                activity.getSharedPreferences("settings",0).edit().putString("theme",theme).commit()
                activity.setTheme(dev.kigya.pixora.R.style.AppTheme)
                controller.create().start().resume()
                val content=activity.findViewById<View>(android.R.id.content)
                assertTrue(content.viewTreeObserver.dispatchOnPreDraw())
                activity.finishStartup()
                assertFalse(content.viewTreeObserver.dispatchOnPreDraw())
                val expected=activity.getColor(if(theme=="dark")R.color.window_background_dark else R.color.window_background_light)
                assertEquals(expected,(activity.window.decorView.background as android.graphics.drawable.ColorDrawable).color)
                controller.pause().stop().destroy()
            }
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
            assertTrue(newContent.viewTreeObserver.dispatchOnPreDraw()) // New instance cancels drawing until ready.
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
            verify(delegate).getMainComponentName()
            verify(delegate).onResume()
            assertEquals("main", MainActivity::class.java.getDeclaredMethod("getMainComponentName").apply { isAccessible = true }.invoke(activity))
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
        }
    }

    @Test fun api31ThemeOverrideIsAppliedThroughActivitySplashScreenAndResetForSystemMode() {
        mockConstruction(DefaultReactActivityDelegate::class.java).use {
            val controller = Robolectric.buildActivity(MainActivity::class.java)
            val activity = controller.get()
            activity.setTheme(dev.kigya.pixora.R.style.AppTheme)
            activity.getSharedPreferences("settings", 0).edit().putString("theme", "light").commit()
            controller.create().start().resume()

            // Read the platform Activity getter itself: a system-service lookup is not the SplashScreen API.
            val splash = activity.splashScreen as RoboSplashScreen
            assertEquals(dev.kigya.pixora.R.style.AppSplashLight, splash.splashScreenTheme)
            activity.getSharedPreferences("settings", 0).edit().putString("theme", "dark").commit()
            activity.updateSystemBars()
            assertEquals(dev.kigya.pixora.R.style.AppSplashDark, splash.splashScreenTheme)
            activity.getSharedPreferences("settings", 0).edit().putString("theme", "system").commit()
            activity.updateSystemBars()
            assertEquals(android.content.res.Resources.ID_NULL, splash.splashScreenTheme)

            controller.pause().stop().destroy()
        }
    }
}
