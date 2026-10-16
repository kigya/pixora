package dev.kigya.pixora

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet

class AppFailure(val code: String) : Exception(code)
object SessionStore {
    val lock = Any()
    private lateinit var context: Context
    private lateinit var journal: AtomicFile
    private var value = empty(0)
    val listeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    val activeStates = setOf("PREPARING", "RUNNING", "FINALIZING", "CANCELLING")
    @Volatile var workerAlive = false
    @Volatile var serviceAlive = false
    private fun empty(sequence: Long) = JSONObject().apply {
        put("mode", "quality");put("modelId", "realesrgan-x4plus");put("timings", JSONObject());put("schemaVersion", 2); put("sequence", sequence); put("sessionId", ""); put("jobId", "")
        put("phase", ""); put("completedTiles", 0); put("totalTiles", 0); put("state", "EMPTY"); put("scale", 2); put("backend", ""); put("progress", -1)
        put("startedAt", 0); put("elapsedMs", 0); put("image", JSONObject.NULL)
        put("resultUri", ""); put("resultWidth", 0); put("resultHeight", 0); put("error", "")
        put("exportState", "EXPORT_IDLE"); put("exports", JSONArray())
    }
    fun init(ctx: Context) = synchronized(lock) {
        if (::context.isInitialized) return@synchronized
        context = ctx.applicationContext
        journal = AtomicFile(File(ctx.filesDir, "session.json"))
        value = try { JSONObject(withClosed(journal.openRead()) { it.reader(Charsets.UTF_8).readText() }) } catch (_: Exception) { empty(0) }
        if (value.optInt("schemaVersion") !in 1..2) value = empty(value.optLong("sequence"))
        value.put("schemaVersion",2)
        if (!value.has("phase")) value.put("phase", "").put("completedTiles", 0).put("totalTiles", 0)
        if(!value.has("mode"))value.put("mode","quality").put("modelId","realesrgan-x4plus").put("timings",JSONObject())
        if (activeStates.contains(value.optString("state"))) {
            value.put("state", "INTERRUPTED").put("error", "INTERRUPTED").put("progress", -1)
            persist()
            Telemetry.observeJob(JSONObject(),value)
        }
        val image = value.optJSONObject("image")
        if (image != null && !File(image.optString("sourcePath")).isFile) value = empty(value.optLong("sequence") + 1)
        if (value.optString("state") == "SUCCEEDED" && !File(value.optString("resultPath")).isFile) {
            value.put("state", "INTERRUPTED").put("error", "INTERRUPTED")
        }
        ImageFiles.cleanupShares(context, false)
        RetentionPolicy.applyAtLaunch(context)
    }
    fun snapshot(): JSONObject = synchronized(lock) { JSONObject(value.toString()) }
    fun publicSnapshot(): JSONObject = synchronized(lock) { publicCopy(value) }
    private fun publicCopy(v: JSONObject): JSONObject {
        val out = JSONObject(v.toString()); out.remove("resultPath")
        out.optJSONObject("image")?.apply { remove("sourcePath"); remove("workPath") }
        return out
    }
    fun busy() = synchronized(lock) { activeStates.contains(value.optString("state")) }
    fun requireIdle() { if (busy() || workerAlive || serviceAlive) throw AppFailure("BUSY") }
    fun update(persist: Boolean = true, change: (JSONObject) -> Unit): JSONObject = synchronized(lock) {
        val next=JSONObject(value.toString())
        change(next); next.put("sequence", value.optLong("sequence") + 1)
        if (persist) persist(next)
        Telemetry.observeJob(value,next)
        value=next
        val out = publicCopy(value)
        listeners.forEach { it(JSONObject(out.toString())) }
        out
    }
    /** A disk failure must not prevent stopping a native task or releasing its service. */
    fun updateProcessingState(change:(JSONObject)->Unit):JSONObject =
        try {update(change=change)}catch(_:java.io.IOException){update(false,change)}
    fun replace(image: JSONObject): JSONObject = synchronized(lock) {
        requireIdle()
        val old = value.optJSONObject("image")?.optString("sourcePath")
        val sequence = value.optLong("sequence") + 1
        val next = empty(sequence).put("sessionId", image.getString("id")).put("state", "READY").put("image", JSONObject(image.toString()))
        persist(next); value=next
        if (!old.isNullOrEmpty()) File(old).parentFile?.takeIf { it.parentFile?.name == "sessions" }?.deleteRecursively()
        listeners.forEach { it(publicCopy(value)) }; publicCopy(value)
    }
    fun discard(): JSONObject = synchronized(lock) {
        requireIdle(); val old = value.optJSONObject("image")?.optString("sourcePath")
        val next = empty(value.optLong("sequence") + 1); persist(next); value=next
        if (!old.isNullOrEmpty()) File(old).parentFile?.takeIf { it.parentFile?.name == "sessions" }?.deleteRecursively()
        listeners.forEach { it(publicCopy(value)) }; publicCopy(value)
    }
    private fun persist(candidate:JSONObject=value) {
        val stream = journal.startWrite()
        try { stream.write(candidate.toString().toByteArray()); journal.finishWrite(stream) }
        catch (e: Exception) { journal.failWrite(stream); throw e }
    }
    fun settings(ctx: Context): JSONObject {
        val p = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)
        val storedLanguage = p.getString("language", "system") ?: "system"
        val language = if (storedLanguage == "pt") "pt-BR" else storedLanguage
        if (language != storedLanguage) p.edit().putString("language", language).commit()
        val appInfo = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        val upgradedInstall = appInfo.lastUpdateTime > appInfo.firstInstallTime
        val languageChosen = p.contains("language") || p.all.isNotEmpty() || File(context.filesDir, "session.json").exists() || upgradedInstall
        return JSONObject().put("cacheLimitMiB",p.getInt("cacheLimitMiB",-1)).put("notificationHintCount",p.getInt("notificationHintCount",0)).put("theme", p.getString("theme", "system")).put("language", language)
            .put("format", p.getString("format", "png")).put("notificationAsked", p.getBoolean("notificationAsked", false)).put("notificationIntroSeen", p.getBoolean("notificationIntroSeen", false)).put("systemLanguage", android.content.res.Resources.getSystem().configuration.locales[0].toLanguageTag()).put("languageChosen", languageChosen).put("notificationDismissedSession", p.getString("notificationDismissedSession", ""))
    }
}
