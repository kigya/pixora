package dev.kigya.pixora

import java.io.File
import java.io.IOException
import java.nio.file.Path

data class StorageUsageSnapshot(
    val cacheBytes: Long,
    val sessionBytes: Long,
    val temporaryBytes: Long,
    val recreateModelBytes: Long,
    val otherBytes: Long,
    private val rawFreeBytes: Long,
) {
    val freeBytes: Long get() = rawFreeBytes.coerceAtLeast(0L)
    val totalBytes: Long
        get() = listOf(cacheBytes, sessionBytes, temporaryBytes, recreateModelBytes, otherBytes)
            .fold(0L) { total, bytes -> saturatingAdd(total, bytes) }

    fun toJson() = org.json.JSONObject()
        .put("cacheBytes", cacheBytes)
        .put("sessionBytes", sessionBytes)
        .put("temporaryBytes", temporaryBytes)
        .put("recreateModelBytes", recreateModelBytes)
        .put("otherBytes", otherBytes)
        .put("freeBytes", freeBytes)
        .put("totalBytes", totalBytes)
}

/** Assigns each regular file under app-private data to exactly one storage bucket. */
internal object StorageUsage {
    fun scan(dataDir: File, cacheDir: File, sessionDir: File, sessionJournal: File,
             recreateModelDir: File, freeBytes: Long): StorageUsageSnapshot {
        var cache = 0L
        var sessions = 0L
        var temporary = 0L
        var model = 0L
        var other = 0L
        val cachePath = normalized(cacheDir)
        val sessionPath = normalized(sessionDir)
        val journalPath = normalized(sessionJournal)
        val modelPath = normalized(recreateModelDir)
        if (dataDir.exists()) {
            dataDir.walkTopDown().filter { it.isFile }.forEach { file ->
                val path = normalized(file)
                val size = file.length().coerceAtLeast(0L)
                when {
                    isTemporary(file) -> temporary = saturatingAdd(temporary, size)
                    path.startsWith(modelPath) -> model = saturatingAdd(model, size)
                    path == journalPath || path.startsWith(sessionPath) -> sessions = saturatingAdd(sessions, size)
                    path.startsWith(cachePath) -> cache = saturatingAdd(cache, size)
                    else -> other = saturatingAdd(other, size)
                }
            }
        }
        return StorageUsageSnapshot(cache, sessions, temporary, model, other, freeBytes.coerceAtLeast(0L))
    }

    internal fun isTemporary(file: File): Boolean {
        val name = file.name
        return name.endsWith(".partial") || name.endsWith(".part") || name.startsWith("incoming-")
    }

    /** Resolve Android's /data/data and /data/user/0 aliases to the same physical path. */
    private fun normalized(file: File): Path = try {
        file.canonicalFile.toPath().normalize()
    } catch (_: IOException) {
        file.toPath().toAbsolutePath().normalize()
    }

}

private fun saturatingAdd(left: Long, right: Long): Long =
    if (right > 0L && left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
