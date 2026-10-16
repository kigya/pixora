package dev.kigya.pixora

import android.content.res.Configuration
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
}
