package dev.kigya.pixora

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import com.google.firebase.crashlytics.FirebaseCrashlytics
import org.json.JSONObject

/** Explicit local QA source set. Not compiled into debug, coverage or final release. */
class FirebaseDiagnosticsActivity : Activity() {
    external fun crashNative()
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val action = intent.getStringExtra("action") ?: "events"
        Telemetry.update(action != "restore", action != "restore", true)
        val label = TextView(this).apply { textSize=20f; setPadding(24,48,24,24) }
        setContentView(label)
        label.text="Pixora Firebase QA: $action\n${ProfileAvailability.snapshot()}"
        if(action=="events") {
            Handler(Looper.getMainLooper()).postDelayed({
            val context=JSONObject().put("profile_id","lite").put("speed","fast").put("scale",2).put("backend","CPU").put("size_bucket","small").put("model_version","realesr-general-x4v3").put("attempt_token",java.util.UUID.randomUUID().toString())
            Telemetry.event("screen_view",JSONObject().put("screen_name","diagnostics").put("screen_class","qa"))
            Telemetry.event("job_started",context)
            Telemetry.event("job_finished",JSONObject(context.toString()).put("status","success").put("duration_ms",1200).put("phase","writing_result"))
            Telemetry.event("review_submitted",JSONObject(context.toString()).put("rating",4).put("route","feedback"))
            FirebaseCrashlytics.getInstance().recordException(IllegalStateException("Pixora QA controlled nonfatal"))
            },1000)
        }
        Handler(Looper.getMainLooper()).postDelayed({
            when(action) {
                "jvm" -> controlledJvmCrash()
                "ndk" -> { System.loadLibrary("pixora_diagnostics"); crashNative() }
                "flags" -> label.text="Pixora Firebase QA flags\n${ProfileAvailability.snapshot()}"
            }
        },5000)
    }
    private fun controlledJvmCrash(): Nothing = throw IllegalStateException("Pixora QA controlled JVM fatal")
}
