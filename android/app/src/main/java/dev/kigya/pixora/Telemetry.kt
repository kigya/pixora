package dev.kigya.pixora

import android.content.Context
import android.os.Bundle
import org.json.JSONObject

/** Single native boundary. Explicit parameter allow-list prevents accidental file/form payloads. */
object Telemetry {
    private lateinit var context: Context
    private lateinit var sink: TelemetrySink
    private val events = setOf("screen_view", "screen_engagement", "ui_action", "image_import_started", "image_import_finished", "profile_picker_opened", "profile_preview_interacted", "profile_selected", "processing_options_changed", "preparation_decision", "job_started", "job_backend_changed", "job_finished", "result_viewed", "comparison_used", "export_finished", "share_opened", "review_prompt_shown", "review_rating_selected", "review_submitted", "review_dismissed", "play_redirect_finished", "feedback_opened", "feedback_send_finished", "settings_changed", "remote_config_updated")
    private val fields = setOf("screen_name", "screen_class", "action", "source", "status", "profile_id", "previous_profile", "speed", "scale", "backend", "previous_backend", "size_bucket", "model_version", "phase", "error_code", "attempt_token", "format", "rating", "route", "setting", "value", "duration_ms", "engagement_ms", "enabled_count")
    internal fun init(ctx: Context, destination: TelemetrySink = FirebaseTelemetrySink(ctx.applicationContext)) {
        context = ctx.applicationContext
        sink = destination
        applySettings()
    }
    fun settings() = JSONObject().put("analytics", enabled("analytics")).put("crashes", enabled("crashes")).put("noticeSeen", prefs().getBoolean("noticeSeen", false))
    private fun prefs() = context.getSharedPreferences("telemetry", 0)
    private fun enabled(key: String) = prefs().getBoolean(key, BuildConfig.TELEMETRY_DEFAULT)
    fun update(analytics: Boolean, crashes: Boolean, noticeSeen: Boolean): JSONObject {
        check(prefs().edit().putBoolean("analytics", analytics).putBoolean("crashes", crashes).putBoolean("noticeSeen", noticeSeen).commit()) { "SETTINGS_WRITE_FAILED" }
        applySettings()
        return settings()
    }
    private fun applySettings() = sink.configure(enabled("analytics"), enabled("crashes"))
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
        if (!::context.isInitialized || !enabled("analytics") || name !in events) return
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
