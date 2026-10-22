package dev.kigya.pixora

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Two pinned, optional model files. Downloaded data is never placed in the cache/session tree. */
class RecreateModelStore internal constructor(
    private val context: Context,
    private val changed: (JSONObject) -> Unit,
    private val assets: List<Asset>,
    private val openConnection: (URL) -> HttpURLConnection,
    private val availableBytes: () -> Long,
) {
    data class Asset(val name: String, val url: String, val size: Long, val sha256: String)
    companion object {
        const val TOTAL = 1_881_812_340L
        val ASSETS = listOf(
            Asset("sd15-q4.gguf", "https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF/resolve/dcac270609fffc0ce7c7d41a3c0e752721859f7c/stable-diffusion-v1-5-Q4_0.gguf?download=true", 1_747_190_784L, "c2f6e92f9d08d69cc673a1003528ac8199274b3c0eaec88d5fbefe5af67bd42b"),
            Asset("lcm-lora.safetensors", "https://huggingface.co/latent-consistency/lcm-lora-sdv1-5/resolve/cf2fced511dbe7e26c8d1d397e728fbab875db4b/pytorch_lora_weights.safetensors?download=true", 134_621_556L, "8f90d840e075ff588a58e22c6586e2ae9a6f7922996ee6649a7f01072333afe4"),
        )
        const val REVISION = "sd15-q4-c2f6e92f-lcm-8f90d840"
    }

    constructor(context: Context, changed: (JSONObject) -> Unit) : this(
        context, changed, ASSETS,
        { url -> url.openConnection() as HttpURLConnection },
        { android.os.StatFs(context.filesDir.path).availableBytes },
    )

    private val directory = File(context.filesDir, "recreate-model").apply { mkdirs() }
    private val preferences = context.getSharedPreferences("recreate-model", Context.MODE_PRIVATE)
    private val cancelled = AtomicBoolean(false)
    @Volatile private var active: HttpURLConnection? = null
    @Volatile private var state = "absent"
    @Volatile private var error = ""
    private val running = AtomicBoolean(false)

    fun directory() = directory
    fun diffusionModel() = File(directory, assets[0].name)
    fun loraModel() = File(directory, assets[1].name)
    fun isDownloading() = running.get()
    fun isReady(): Boolean = assets.all { asset ->
        val file = File(directory, asset.name)
        file.isFile && file.length() == asset.size && preferences.getString(asset.name, null) == asset.sha256
    }

    /** Hash installed blobs on the background job path before native inference uses them. */
    @Synchronized fun verifyInstalled(): Boolean {
        val valid = assets.all { asset ->
            val file = File(directory, asset.name)
            file.isFile && file.length() == asset.size && sha256(file) == asset.sha256 &&
                preferences.getString(asset.name, null) == asset.sha256
        }
        if (!valid) {
            assets.forEach { preferences.edit().remove(it.name).apply() }
            state = "failed"; error = "MODEL_INTEGRITY_FAILED"
        }
        return valid
    }

    @Synchronized fun snapshot(): JSONObject {
        val ready = isReady()
        if (ready) { state = "ready"; error = "" }
        val downloaded = assets.sumOf { File(directory, it.name).takeIf(File::isFile)?.length() ?: File(directory, "${it.name}.part").length() }
        val installed = assets.sumOf { File(directory, it.name).takeIf(File::isFile)?.length() ?: 0L }
        if (!ready && (state == "ready" || state == "absent" && downloaded > 0L))
            state = if (downloaded > 0L) "paused" else "absent"
        return JSONObject().put("state", state).put("downloadedBytes", downloaded).put("totalBytes", assets.sumOf(Asset::size))
            .put("installedBytes", installed).put("error", error)
    }

    fun download() {
        if (!running.compareAndSet(false, true)) return
        cancelled.set(false)
        state = "downloading"; error = ""; notifyChanged()
        try {
            val remaining = assets.sumOf { asset ->
                val installed = File(directory, asset.name).takeIf(File::isFile)?.length() ?: 0L
                val partial = File(directory, "${asset.name}.part").takeIf(File::isFile)?.length() ?: 0L
                (asset.size - maxOf(installed, partial)).coerceAtLeast(0L)
            }
            if (availableBytes() < remaining + 64L * 1024 * 1024) throw AppFailure("LOW_STORAGE")
            for (asset in assets) {
                if (cancelled.get()) throw AppFailure("CANCELLED")
                val target = File(directory, asset.name)
                if (target.isFile && target.length() == asset.size && preferences.getString(asset.name, null) == asset.sha256) continue
                if (target.isFile && target.length() == asset.size && sha256(target) == asset.sha256) {
                    check(preferences.edit().putString(asset.name, asset.sha256).commit()) { throw AppFailure("LOW_STORAGE") }
                    continue
                }
                if (target.exists()) target.delete()
                downloadAsset(asset)
            }
            state = "verifying"; notifyChanged()
            for (asset in assets) {
                if (cancelled.get()) throw AppFailure("CANCELLED")
                val file = File(directory, asset.name)
                if (file.length() != asset.size || preferences.getString(asset.name, null) != asset.sha256) throw AppFailure("MODEL_INTEGRITY_FAILED")
            }
            state = "ready"; error = ""
        } catch (failure: Throwable) {
            state = if (cancelled.get() || failure is AppFailure && failure.code == "CANCELLED") "paused" else "failed"
            error = if (state == "paused") "" else if (failure is AppFailure) failure.code else "MODEL_DOWNLOAD_FAILED"
        } finally { active?.disconnect(); active = null; running.set(false); notifyChanged() }
    }

    fun cancel() { cancelled.set(true); active?.disconnect() }

    @Synchronized fun delete() {
        if (running.get() || state == "downloading" || state == "verifying") throw AppFailure("BUSY")
        assets.forEach { asset ->
            for (file in listOf(File(directory, asset.name), File(directory, "${asset.name}.part")))
                if (file.exists() && (!file.delete() || file.exists())) { state = "failed"; error = "MODEL_DELETE_FAILED"; notifyChanged(); throw AppFailure("MODEL_DELETE_FAILED") }
        }
        if (!preferences.edit().apply { assets.forEach { remove(it.name) } }.commit()) { state = "failed"; error = "MODEL_DELETE_FAILED"; notifyChanged(); throw AppFailure("MODEL_DELETE_FAILED") }
        state = "absent"; error = ""; notifyChanged()
    }

    fun modelBytes() = assets.sumOf { File(directory, it.name).takeIf(File::isFile)?.length() ?: 0L }
    fun partialBytes() = assets.sumOf { File(directory, "${it.name}.part").takeIf(File::isFile)?.length() ?: 0L }

    private fun downloadAsset(asset: Asset) {
        val part = File(directory, "${asset.name}.part")
        var offset = part.takeIf(File::exists)?.length() ?: 0L
        if (offset > asset.size) { part.delete(); offset = 0L }
        if (offset == asset.size) {
            if (sha256(part) == asset.sha256) { installVerified(asset, part); return }
            part.delete(); offset = 0L
        }
        if (availableBytes() < asset.size - offset + 64L * 1024 * 1024) throw AppFailure("LOW_STORAGE")
        val connection = openConnection(URL(asset.url)).apply {
            connectTimeout = 20_000; readTimeout = 30_000; instanceFollowRedirects = true
            setRequestProperty("User-Agent", "Pixora/0.9")
            if (offset > 0) setRequestProperty("Range", "bytes=$offset-")
        }
        active = connection
        try {
            val code = connection.responseCode
            if (code !in 200..299) throw AppFailure("MODEL_DOWNLOAD_FAILED")
            if (offset > 0 && code != HttpURLConnection.HTTP_PARTIAL) { part.delete(); offset = 0L }
            if (code == HttpURLConnection.HTTP_PARTIAL) {
                val range = connection.getHeaderField("Content-Range") ?: run { part.delete(); throw AppFailure("MODEL_DOWNLOAD_FAILED") }
                if (offset <= 0L || !range.startsWith("bytes $offset-") || range.substringAfterLast('/').toLongOrNull() != asset.size) {
                    part.delete()
                    throw AppFailure("MODEL_DOWNLOAD_FAILED")
                }
            }
            var written = offset
            connection.inputStream.use { input -> FileOutputStream(part, offset > 0).use { output ->
                val buffer = ByteArray(256 * 1024)
                try {
                    while (true) {
                        if (cancelled.get()) throw AppFailure("CANCELLED")
                        val count = input.read(buffer); if (count < 0) break
                        if (written + count > asset.size) throw AppFailure("MODEL_INTEGRITY_FAILED")
                        output.write(buffer, 0, count); written += count
                        if (written % (8L * 1024 * 1024) < count) notifyChanged()
                    }
                } finally { output.flush(); output.fd.sync() }
            } }
            if (written != asset.size) throw AppFailure("MODEL_DOWNLOAD_FAILED")
            if (sha256(part) != asset.sha256) { part.delete(); throw AppFailure("MODEL_INTEGRITY_FAILED") }
            installVerified(asset, part)
        } finally { connection.disconnect(); active = null }
    }

    private fun installVerified(asset: Asset, part: File) {
        val target = File(directory, asset.name)
        if (target.exists() && !target.delete()) throw AppFailure("LOW_STORAGE")
        if (!part.renameTo(target)) throw AppFailure("LOW_STORAGE")
        if (!preferences.edit().putString(asset.name, asset.sha256).commit()) throw AppFailure("LOW_STORAGE")
    }

    private fun notifyChanged() { try { changed(snapshot()) } catch (_: Exception) {} }
    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input -> val buffer = ByteArray(1024 * 1024); while (true) { val count=input.read(buffer); if(count<0)break;digest.update(buffer,0,count) } }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
