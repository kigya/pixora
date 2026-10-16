package dev.kigya.pixora

import android.content.Context
import android.os.Bundle
import org.json.JSONObject

/** Single native boundary. Explicit parameter allow-list prevents accidental file/form payloads. */
object Telemetry {
    const val consentVersion = 2
    private lateinit var context: Context
    private lateinit var sink: TelemetrySink
    private var analyticsSuppressedForProcess = false
    private var crashesSuppressedForProcess = false
    private val events = setOf("screen_view", "screen_engagement", "ui_action", "image_import_started", "image_import_finished", "profile_picker_opened", "profile_preview_interacted", "profile_selected", "processing_options_changed", "preparation_decision", "job_started", "job_backend_changed", "job_finished", "result_viewed", "comparison_used", "export_finished", "share_opened", "review_prompt_requested", "review_rating_selected", "review_submitted", "review_dismissed", "play_redirect_finished", "feedback_opened", "feedback_send_finished", "settings_changed", "remote_config_updated")
    private val fields = setOf("screen_name", "screen_class", "action", "source", "status", "profile_id", "previous_profile", "speed", "scale", "backend", "previous_backend", "size_bucket", "model_version", "phase", "error_code", "attempt_token", "format", "rating", "route", "setting", "value", "duration_ms", "engagement_ms", "enabled_count")
    internal fun prepare(ctx: Context): Boolean {
        context = ctx.applicationContext
        // Migrate SDK-level opt-ins from the older notice flow before eager Firebase components
        // initialize. Only the two documented collection switches are cleared; other SDK state
        // remains untouched. The app's versioned consent remains the source of truth.
        val version = prefs().getInt("consentVersion", 0)
        val analyticsSdk = context.getSharedPreferences("com.google.android.gms.measurement.prefs", 0)
        val crashlyticsSdk = context.getSharedPreferences("com.google.firebase.crashlytics", 0)
        val analyticsSaved = if (version == consentVersion) {
            // Reconcile SDK-persisted overrides with this app's explicit, independent choices.
            analyticsSdk.edit().putBoolean("measurement_enabled", prefs().getBoolean("analytics", false)).commit()
        } else {
            analyticsSdk.edit().remove("measurement_enabled").commit()
        }
        val crashesSaved = if (version == consentVersion) {
            crashlyticsSdk.edit().putBoolean("firebase_crashlytics_collection_enabled", prefs().getBoolean("crashes", false)).commit()
        } else {
            crashlyticsSdk.edit().remove("firebase_crashlytics_collection_enabled").commit()
        }
        return analyticsSaved && crashesSaved
    }
    internal fun init(ctx: Context, destination: TelemetrySink? = null) {
        if (!prepare(ctx)) return
        initPrepared(destination)
    }
    internal fun initPrepared(destination: TelemetrySink? = null) {
        // Read the durable choice before constructing or touching a Firebase SDK.
        analyticsSuppressedForProcess = false
        crashesSuppressedForProcess = false
        val analyticsAllowed = analyticsAllowed()
        val crashesAllowed = crashesAllowed()
        sink = destination ?: FirebaseTelemetrySink(context)
        sink.configure(analyticsAllowed, crashesAllowed)
    }
    fun settings() = JSONObject().put("analytics", enabled("analytics")).put("crashes", enabled("crashes")).put("noticeSeen", prefs().getBoolean("noticeSeen", false)).put("consentVersion", prefs().getInt("consentVersion", 0))
    private fun prefs() = context.getSharedPreferences("telemetry", 0)
    private fun enabled(key: String) = prefs().getInt("consentVersion", 0) == consentVersion && prefs().getBoolean(key, false)
    private fun analyticsAllowed() = enabled("analytics") && !analyticsSuppressedForProcess
    private fun crashesAllowed() = enabled("crashes") && !crashesSuppressedForProcess
    fun update(analytics: Boolean, crashes: Boolean, noticeSeen: Boolean): JSONObject {
        val saved = prefs().edit().putBoolean("analytics", analytics).putBoolean("crashes", crashes).putBoolean("noticeSeen", noticeSeen).putInt("consentVersion", consentVersion).commit()
        if (!saved) {
            // Honor opt-outs in memory even when storage fails, while surfacing that the durable
            // preference did not change. Never turn a failed opt-in into an active collection.
            if (!analytics) analyticsSuppressedForProcess = true
            if (!crashes) crashesSuppressedForProcess = true
            if (::sink.isInitialized && (!analytics || !crashes)) sink.configure(analyticsAllowed(), crashesAllowed())
            throw IllegalStateException("SETTINGS_WRITE_FAILED")
        }
        analyticsSuppressedForProcess = false
        crashesSuppressedForProcess = false
        // If pre-Firebase reconciliation failed during startup, keep settings editable and
        // telemetry inert for this process. A later launch can safely reconcile the durable
        // choice before creating Firebase components.
        if (::sink.isInitialized) applySettings()
        return settings()
    }
    private fun applySettings() = sink.configure(analyticsAllowed(), crashesAllowed())
    fun jobContext(job: JSONObject): JSONObject {
        val image = job.optJSONObject("image")
        val pixels = (image?.optLong("workWidth") ?: 0) * (image?.optLong("workHeight") ?: 0)
        return JSONObject().put("attempt_token", job.optString("jobId")).put("profile_id", ProcessingProfiles.publicId(job.optString("mode"))).put("speed", job.optString("speed", "quality")).put("scale", job.optInt("scale")).put("backend", job.optString("backend")).put("model_version", job.optString("modelId")).put("size_bucket", if (pixels <= 262144) "small" else if (pixels <= 786432) "medium" else "large").put("phase", job.optString("phase"))
    }
    fun observeJob(previous: JSONObject, next: JSONObject) {
        if (!::context.isInitialized) return
        if (previous.optString("backend") == "GPU" && next.optString("backend") == "CPU") {
            event("job_backend_changed", jobContext(next).put("previous_backend", "GPU").put("error_code", "GPU_FAILED"))
        }
        val state = next.optString("state")
        if (state !in setOf("SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED")) return
        val job = next.optString("jobId")
        if (job.isEmpty() || prefs().getString("terminalJob", "") == job) return
        prefs().edit().putString("terminalJob", job).commit()
        val status = when { state == "SUCCEEDED" -> "success"; state == "CANCELLED" -> "cancelled"; state == "INTERRUPTED" -> "interrupted"; next.optString("error") == "TIME_LIMIT" -> "time_limit"; else -> "error" }
        event("job_finished", jobContext(next).put("status", status).put("duration_ms", next.optLong("elapsedMs")).put("error_code", next.optString("error")))
    }
    fun event(name: String, values: JSONObject = JSONObject()) {
        if (!::context.isInitialized || !::sink.isInitialized || !analyticsAllowed() || name !in events) return
        val parameters = Bundle()
        values.keys().forEach { key ->
            if (key in fields) when (val value = values.opt(key)) {
                is Number -> if (value.toDouble().isFinite()) parameters.putDouble(key, value.toDouble())
                is String -> if (value.length <= 100 && Regex("^[a-zA-Z0-9_.:-]+$").matches(value)) parameters.putString(key, value)
            }
        }
        sink.log(name, parameters)
    }
}
