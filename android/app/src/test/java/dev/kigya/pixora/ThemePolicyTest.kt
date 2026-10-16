package dev.kigya.pixora

import android.content.res.Configuration
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
}
