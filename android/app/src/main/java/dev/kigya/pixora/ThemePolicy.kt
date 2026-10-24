package dev.kigya.pixora

import android.content.res.Configuration
import android.content.res.Resources
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate

/** Shared native theme rules; system mode follows the current configuration. */
object ThemePolicy {
    fun nightMode(theme:String?):Int {
        if(theme=="dark")return AppCompatDelegate.MODE_NIGHT_YES
        if(theme=="light")return AppCompatDelegate.MODE_NIGHT_NO
        return AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
    }
    fun isDark(theme:String?,configuration:Configuration):Boolean {
        if(theme=="dark")return true
        if(theme=="light")return false
        return configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK==Configuration.UI_MODE_NIGHT_YES
    }

    /** Persist a fixed splash override only for explicit app themes; ID_NULL restores system-following resources. */
    fun updateLaunchSplash(sdkInt:Int,theme:String?,applyTheme:(Int)->Unit) {
        if(sdkInt<Build.VERSION_CODES.S)return
        val resource=when(theme) {
            "light" -> R.style.AppSplashLight
            "dark" -> R.style.AppSplashDark
            else -> Resources.ID_NULL
        }
        applyTheme(resource)
    }
}
