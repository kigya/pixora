package dev.kigya.pixora

import android.content.Context
import java.io.File

/** Capture upgrade evidence before any current-version preference writes. */
object OnboardingStore {
    @Synchronized fun version(context: Context): Int {
        val marker = context.getSharedPreferences("product-intro", Context.MODE_PRIVATE)
        if (!marker.contains("version")) {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            val existing = info.lastUpdateTime > info.firstInstallTime ||
                context.getSharedPreferences("settings", 0).all.isNotEmpty() ||
                File(context.filesDir, "session.json").exists()
            check(marker.edit().putInt("version", if (existing) 1 else 0).commit()) { "SETTINGS_WRITE_FAILED" }
        }
        return marker.getInt("version", 0)
    }
    fun complete(context: Context) {
        check(context.getSharedPreferences("product-intro", 0).edit().putInt("version", 1).commit()) { "SETTINGS_WRITE_FAILED" }
    }
}
