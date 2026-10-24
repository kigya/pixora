package dev.kigya.pixora

import android.content.res.Configuration
import android.content.res.Resources
import androidx.appcompat.app.AppCompatDelegate
import org.junit.Test
import org.junit.Assert.*

@org.junit.runner.RunWith(org.robolectric.RobolectricTestRunner::class)
@org.robolectric.annotation.Config(sdk=[35],application=android.app.Application::class)
class ThemePolicyTest {
    @Test fun explicitAndSystemThemesFollowConfiguration() {
        assertEquals(AppCompatDelegate.MODE_NIGHT_YES,ThemePolicy.nightMode("dark"))
        assertEquals(AppCompatDelegate.MODE_NIGHT_NO,ThemePolicy.nightMode("light"))
        assertEquals(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM,ThemePolicy.nightMode("system"))
        for(mode in listOf(Configuration.UI_MODE_NIGHT_YES,Configuration.UI_MODE_NIGHT_NO)) {
            val configuration=Configuration().apply{uiMode=mode}
            assertTrue(ThemePolicy.isDark("dark",configuration));assertFalse(ThemePolicy.isDark("light",configuration))
            assertEquals(mode==Configuration.UI_MODE_NIGHT_YES,ThemePolicy.isDark("system",configuration))
        }
    }

    @Test fun launchSplashOverrideIsApi31OnlyAndSystemModeClearsPersistedChoice() {
        val api30 = mutableListOf<Int>()
        ThemePolicy.updateLaunchSplash(30, "dark", api30::add)
        assertTrue("Android 11 and older must not call the API 31 service", api30.isEmpty())

        val api31 = mutableListOf<Int>()
        ThemePolicy.updateLaunchSplash(31, "light", api31::add)
        ThemePolicy.updateLaunchSplash(31, "dark", api31::add)
        ThemePolicy.updateLaunchSplash(31, "system", api31::add)
        ThemePolicy.updateLaunchSplash(31, null, api31::add)
        assertEquals(listOf(R.style.AppSplashLight, R.style.AppSplashDark, Resources.ID_NULL, Resources.ID_NULL), api31)
    }
}
