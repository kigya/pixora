package dev.kigya.pixora

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.atomic.AtomicBoolean

/** The cached complete snapshot is authoritative until a successful fetch. */
object ProfileAvailability {
    private lateinit var context: Context
    private val fetched = AtomicBoolean(false)
    private val lock = Any()
    private var value = defaults()
    val listeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    private fun defaults() = JSONObject().apply {
        ProcessingProfiles.presets.forEach { put(it, true) }
        put("source", "default").put("updatedAt", 0L)
    }
    fun init(ctx: Context) = synchronized(lock) {
        context = ctx.applicationContext
        value = try {
            val text = context.getSharedPreferences("remote_profiles", 0).getString("snapshot", null)
            if (text == null) defaults() else JSONObject(text).also { cached ->
                require(ProcessingProfiles.presets.all { cached.opt(it) is Boolean })
                cached.put("source", "cache")
            }
        } catch (_: Exception) { defaults() }
    }
    fun snapshot() = synchronized(lock) { JSONObject(value.toString()) }
    fun allowed(profile: String): Boolean {
        val id = when (profile) {
            "quality" -> "standard"
            "fast" -> "lite"
            "illustration", "illustration-fast" -> "art"
            else -> profile
        }
        return synchronized(lock) { value.optBoolean(id, false) }
    }
    internal fun fetchOnce(source: ProfileConfigSource = FirebaseProfileConfigSource()) {
        if (!fetched.compareAndSet(false, true)) return
        source.fetch { result ->
            val flags = result.getOrNull()
            var persisted = false
            if (flags != null && ProcessingProfiles.presets.all { it in flags }) {
                val next = JSONObject().apply {
                    ProcessingProfiles.presets.forEach { put(it, flags.getValue(it)) }
                    put("source", "remote").put("updatedAt", System.currentTimeMillis())
                }
                synchronized(lock) {
                    // One atomic write. Never publish a configuration we failed to save.
                    persisted = context.getSharedPreferences("remote_profiles", 0).edit().putString("snapshot", next.toString()).commit()
                    if (persisted) value = next
                }
                if (persisted) {
                    val current = snapshot(); listeners.forEach { it(current) }
                }
            }
            Telemetry.event("remote_config_updated", JSONObject().put("source", snapshot().getString("source")).put("status", if (persisted) "success" else "error").put("enabled_count", ProcessingProfiles.presets.count { allowed(it) }))
        }
    }
}
