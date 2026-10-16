package dev.kigya.pixora

import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings

internal fun interface ProfileConfigSource {
    fun fetch(complete: (Result<Map<String,Boolean>>) -> Unit)
}
internal class FirebaseProfileConfigSource : ProfileConfigSource {
    override fun fetch(complete: (Result<Map<String,Boolean>>) -> Unit) {
        val config = FirebaseRemoteConfig.getInstance()
        val settings = FirebaseRemoteConfigSettings.Builder().setFetchTimeoutInSeconds(10).setMinimumFetchIntervalInSeconds(0).build()
        val defaults = ProcessingProfiles.presets.associate { key(it) to true }
        config.setConfigSettingsAsync(settings).continueWithTask { previous ->
            if (!previous.isSuccessful) throw previous.exception ?: IllegalStateException("CONFIG_SETUP")
            config.setDefaultsAsync(defaults)
        }.continueWithTask { previous ->
            if (!previous.isSuccessful) throw previous.exception ?: IllegalStateException("CONFIG_SETUP")
            config.fetchAndActivate()
        }.addOnCompleteListener { task ->
            complete(if (task.isSuccessful) Result.success(ProcessingProfiles.presets.associateWith { config.getBoolean(key(it)) })
                else Result.failure(task.exception ?: IllegalStateException("CONFIG_FETCH")))
        }
    }
    private fun key(profile: String) = "pixora_profile_${profile}_enabled"
}
