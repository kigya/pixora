package dev.kigya.pixora
import android.content.Context
import android.os.PowerManager
object MotionPolicy {
    fun restricted(context:Context):Boolean {
        val power=context.getSystemService(PowerManager::class.java)
        return power.isPowerSaveMode || power.currentThermalStatus>=PowerManager.THERMAL_STATUS_MODERATE
    }
}
