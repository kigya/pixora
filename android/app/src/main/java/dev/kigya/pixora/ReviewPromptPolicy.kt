package dev.kigya.pixora

import org.json.JSONObject

internal object ReviewPromptPolicy {
    const val COOLDOWN_MS = 5L * 60L * 1000L

    fun canOffer(session: JSONObject, jobId: String, shownJobIds: Set<String>, lastShownAt: Long, now: Long): Boolean {
        if (jobId.isBlank() || session.optString("jobId") != jobId || session.optString("state") != "SUCCEEDED") return false
        if (jobId in shownJobIds) return false
        return lastShownAt <= 0L || now >= lastShownAt && now - lastShownAt >= COOLDOWN_MS
    }

    fun markShown(shownJobIds: Set<String>, jobId: String, now: Long): Pair<Set<String>, Long> {
        require(jobId.isNotBlank())
        return (shownJobIds + jobId) to now.coerceAtLeast(0L)
    }
}
