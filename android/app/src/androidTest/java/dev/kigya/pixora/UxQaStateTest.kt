package dev.kigya.pixora

import android.app.ActivityManager
import android.content.Context
import android.os.Bundle
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import android.os.StatFs

/**
 * Explicit, opt-in data-preservation helper for manual UX QA. It never emits file paths,
 * session contents, prompts, identifiers, image names, or preference values.
 *
 * Invoke only after a human-selected action. The orchestrator must force-stop the app before
 * restoration and again after the test process exits so SharedPreferences reload from disk.
 */
class UxQaStateTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val backupRoot get() = File(context.filesDir, "qa-ux-backup")
    private val appData get() = File(context.applicationInfo.dataDir)
    private val prefsRoot get() = File(appData, "shared_prefs")

    @Test fun explicitQaStateAction() {
        val action = InstrumentationRegistry.getArguments().getString("qaAction") ?: "inspectStore"
        val result = when (action) {
            "backupForUx" -> backupForUx()
            "restoreAfterUx" -> restoreAfterUx()
            "setFreshOnboarding" -> setFreshOnboarding()
            "inspectStore" -> inspectStore()
            "hideModelForDownloadQa" -> hideModelForDownloadQa()
            "clonePreservedModelForDeleteQa" -> clonePreservedModelForDeleteQa()
            "restoreModelAfterDownloadQa" -> restoreModelAfterDownloadQa()
            "cleanupVerifiedBackup" -> cleanupVerifiedBackup()
            else -> throw AssertionError("UX_QA_UNKNOWN_ACTION")
        }
        val status = Bundle().apply { putString("uxQaState", result.toString()) }
        instrumentation.sendStatus(0, status)
        assertEquals(action, result.getString("action"))
    }

    fun backupForUx(): JSONObject {
        requireIdle()
        if (backupRoot.exists()) return JSONObject().put("action", "backupForUx").put("status", "already_backed_up")
        val sessionFile = File(appData, "files/session.json")
        val sessions = File(appData, "files/sessions")
        val bytes = size(sessionFile) + size(File(sessionFile.path + ".bak")) + size(sessions) + size(prefsRoot)
        if (android.os.StatFs(appData.path).availableBytes < bytes + 64L * 1024 * 1024) throw AssertionError("UX_QA_BACKUP_SPACE")
        val staging = File(context.filesDir, "qa-ux-backup.stage")
        staging.deleteRecursively()
        try {
            if (sessionFile.isFile) copyFile(sessionFile, File(staging, "session.json"))
            if (File(sessionFile.path + ".bak").isFile) copyFile(File(sessionFile.path + ".bak"), File(staging, "session.json.bak"))
            if (sessions.isDirectory) copyTree(sessions, File(staging, "sessions"))
            if (prefsRoot.isDirectory) copyTree(prefsRoot, File(staging, "shared_prefs"))
            JSONObject().put("session", sessionFile.isFile).put("sessionBackup", File(sessionFile.path + ".bak").isFile)
                .put("sessions", sessions.isDirectory).put("preferences", prefsRoot.isDirectory)
                .writeTo(File(staging, "manifest.json"))
            if (!staging.renameTo(backupRoot)) throw AssertionError("UX_QA_BACKUP_COMMIT")
            return JSONObject().put("action", "backupForUx").put("status", "saved").put("bytes", bytes)
        } catch (_: Throwable) {
            staging.deleteRecursively()
            throw AssertionError("UX_QA_BACKUP_FAILED")
        }
    }

    fun restoreAfterUx(): JSONObject {
        requireIdle()
        restorePreservedModelIfAny()
        val manifest = File(backupRoot, "manifest.json")
        if (!manifest.isFile) throw AssertionError("UX_QA_BACKUP_MISSING")
        val saved = try { JSONObject(manifest.readText()) } catch (_: Throwable) { throw AssertionError("UX_QA_BACKUP_INVALID") }
        val staging = File(context.filesDir, "qa-ux-restore.stage")
        staging.deleteRecursively()
        try {
            if (saved.optBoolean("session")) copyFile(File(backupRoot, "session.json"), File(staging, "session.json"))
            if (saved.optBoolean("sessionBackup")) copyFile(File(backupRoot, "session.json.bak"), File(staging, "session.json.bak"))
            if (saved.optBoolean("sessions")) copyTree(File(backupRoot, "sessions"), File(staging, "sessions"))
            if (saved.optBoolean("preferences")) copyTree(File(backupRoot, "shared_prefs"), File(staging, "shared_prefs"))

            replace(File(staging, "session.json"), File(appData, "files/session.json"), saved.optBoolean("session"))
            replace(File(staging, "session.json.bak"), File(appData, "files/session.json.bak"), saved.optBoolean("sessionBackup"))
            replace(File(staging, "sessions"), File(appData, "files/sessions"), saved.optBoolean("sessions"))
            replace(File(staging, "shared_prefs"), prefsRoot, saved.optBoolean("preferences"))
            staging.deleteRecursively()
            return JSONObject().put("action", "restoreAfterUx").put("status", "restored")
        } catch (_: Throwable) {
            staging.deleteRecursively()
            throw AssertionError("UX_QA_RESTORE_FAILED")
        }
    }

    /** Moves only the already installed and hash-verified package aside; never copies the 1.88 GB bundle. */
    fun hideModelForDownloadQa(): JSONObject {
        requireIdle()
        requireVerifiedUserBackup()
        val modelDirectory = File(context.filesDir, "recreate-model")
        val preserved = preservedModelDirectory()
        if (preserved.exists()) throw AssertionError("UX_QA_MODEL_BACKUP_EXISTS")
        if (!modelDirectory.isDirectory) throw AssertionError("UX_QA_MODEL_NOT_INSTALLED")
        val store = RecreateModelStore(context) {}
        if (!store.verifyInstalled() || !hasExactPinnedAssetNames(modelDirectory)) throw AssertionError("UX_QA_MODEL_NOT_VERIFIED")
        if (!modelDirectory.renameTo(preserved)) throw AssertionError("UX_QA_MODEL_HIDE_FAILED")
        val settings = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
        if (!settings.edit().putBoolean("notificationIntroSeen", false).putBoolean("notificationAsked", false).commit()) {
            if (!preserved.renameTo(modelDirectory)) throw AssertionError("UX_QA_MODEL_RESTORE_REQUIRED")
            throw AssertionError("UX_QA_NOTIFICATION_PREFS_FAILED")
        }
        return JSONObject().put("action", "hideModelForDownloadQa").put("status", "hidden")
            .put("preservedBytes", size(preserved))
    }

    /** Restores the verified original directory after removing only the QA download attempt. */
    fun restoreModelAfterDownloadQa(): JSONObject {
        requireIdle()
        val restored = restorePreservedModelIfAny()
        if (!restored) throw AssertionError("UX_QA_MODEL_BACKUP_MISSING")
        return JSONObject().put("action", "restoreModelAfterDownloadQa").put("status", "restored")
    }

    /** Copies the verified safety backup into a disposable model directory for a real delete flow. */
    fun clonePreservedModelForDeleteQa(): JSONObject {
        requireIdle()
        requireVerifiedUserBackup()
        val preserved = preservedModelDirectory()
        if (!hasExactPinnedAssets(preserved)) throw AssertionError("UX_QA_MODEL_BACKUP_INVALID")

        val modelDirectory = File(context.filesDir, "recreate-model")
        if (modelDirectory.exists()) {
            val entries = modelDirectory.listFiles() ?: throw AssertionError("UX_QA_MODEL_CLONE_DIRECTORY")
            if (!modelDirectory.isDirectory || entries.isNotEmpty()) throw AssertionError("UX_QA_MODEL_CLONE_NOT_EMPTY")
        }

        val requiredBytes = RecreateModelStore.TOTAL + 256L * 1024 * 1024
        if (StatFs(context.filesDir.path).availableBytes < requiredBytes) throw AssertionError("UX_QA_MODEL_CLONE_SPACE")

        val staging = File(context.filesDir, "qa-recreate-model-clone.stage")
        if (staging.exists()) throw AssertionError("UX_QA_MODEL_CLONE_STAGE_EXISTS")
        var cloneCommitted = false
        try {
            if (!staging.mkdirs()) throw AssertionError("UX_QA_MODEL_CLONE_STAGE_FAILED")
            RecreateModelStore.ASSETS.forEach { asset ->
                val source = File(preserved, asset.name)
                val clone = File(staging, asset.name)
                copyFile(source, clone)
                if (clone.length() != asset.size || sha256(clone) != asset.sha256) {
                    throw AssertionError("UX_QA_MODEL_CLONE_INTEGRITY")
                }
            }
            if (!hasExactPinnedAssets(staging)) throw AssertionError("UX_QA_MODEL_CLONE_INTEGRITY")

            val markerPreferences = context.getSharedPreferences("recreate-model", Context.MODE_PRIVATE)
            val markersCommitted = markerPreferences.edit().apply {
                RecreateModelStore.ASSETS.forEach { putString(it.name, it.sha256) }
            }.commit()
            if (!markersCommitted) throw AssertionError("UX_QA_MODEL_CLONE_MARKERS")

            if (modelDirectory.exists() && (!modelDirectory.delete() || modelDirectory.exists())) {
                throw AssertionError("UX_QA_MODEL_CLONE_DIRECTORY")
            }
            if (!staging.renameTo(modelDirectory)) throw AssertionError("UX_QA_MODEL_CLONE_COMMIT")
            cloneCommitted = true
            if (!RecreateModelStore(context) {}.verifyInstalled()) throw AssertionError("UX_QA_MODEL_CLONE_INTEGRITY")

            return JSONObject().put("action", "clonePreservedModelForDeleteQa")
                .put("status", "ready").put("bytes", RecreateModelStore.TOTAL)
        } catch (failure: Throwable) {
            staging.deleteRecursively()
            if (cloneCommitted) modelDirectory.deleteRecursively()
            throw if (failure is AssertionError) failure else AssertionError("UX_QA_MODEL_CLONE_FAILED")
        }
    }

    /** Deletes the safety backup only when the app data and every backed-up preference file match. */
    fun cleanupVerifiedBackup(): JSONObject {
        requireIdle()
        if (preservedModelDirectory().exists()) throw AssertionError("UX_QA_MODEL_RESTORE_REQUIRED")
        val manifestFile = File(backupRoot, "manifest.json")
        if (!manifestFile.isFile) throw AssertionError("UX_QA_BACKUP_MISSING")
        val manifest = try { JSONObject(manifestFile.readText()) } catch (_: Throwable) { throw AssertionError("UX_QA_BACKUP_INVALID") }
        val sessionMatch = sameFile(File(backupRoot, "session.json"), File(appData, "files/session.json"), manifest.optBoolean("session")) &&
            sameFile(File(backupRoot, "session.json.bak"), File(appData, "files/session.json.bak"), manifest.optBoolean("sessionBackup")) &&
            sameTree(File(backupRoot, "sessions"), File(appData, "files/sessions"), manifest.optBoolean("sessions"))
        val preferencesMatch = sameTree(File(backupRoot, "shared_prefs"), prefsRoot, manifest.optBoolean("preferences"))
        if (!sessionMatch || !preferencesMatch) {
            return JSONObject().put("action", "cleanupVerifiedBackup").put("status", "preserved")
                .put("sessionsMatch", sessionMatch).put("preferencesMatch", preferencesMatch)
        }
        if (backupRoot.canonicalFile.parentFile != context.filesDir.canonicalFile || !backupRoot.deleteRecursively() || backupRoot.exists()) {
            throw AssertionError("UX_QA_BACKUP_CLEANUP_FAILED")
        }
        return JSONObject().put("action", "cleanupVerifiedBackup").put("status", "deleted")
            .put("sessionsMatch", true).put("preferencesMatch", true)
    }

    private fun restorePreservedModelIfAny(): Boolean {
        val preserved = preservedModelDirectory()
        if (!preserved.exists()) return false
        val modelDirectory = File(context.filesDir, "recreate-model")
        if (!hasExactPinnedAssets(preserved)) throw AssertionError("UX_QA_MODEL_BACKUP_INVALID")
        if (modelDirectory.exists() && (!modelDirectory.deleteRecursively() || modelDirectory.exists())) throw AssertionError("UX_QA_MODEL_QA_FILES_DELETE_FAILED")
        if (!preserved.renameTo(modelDirectory)) throw AssertionError("UX_QA_MODEL_RESTORE_FAILED")
        val assetPreferences = context.getSharedPreferences("recreate-model", Context.MODE_PRIVATE)
        val restoredMarkers = assetPreferences.edit().apply { RecreateModelStore.ASSETS.forEach { putString(it.name, it.sha256) } }.commit()
        if (!restoredMarkers) throw AssertionError("UX_QA_MODEL_MARKER_RESTORE_FAILED")
        return true
    }

    private fun requireVerifiedUserBackup() {
        val manifest = try { JSONObject(File(backupRoot, "manifest.json").readText()) } catch (_: Throwable) { throw AssertionError("UX_QA_BACKUP_REQUIRED") }
        if (!manifest.optBoolean("preferences")) throw AssertionError("UX_QA_BACKUP_REQUIRED")
    }

    private fun preservedModelDirectory() = File(context.filesDir, "qa-recreate-model-preserved")

    private fun hasExactPinnedAssets(directory: File): Boolean {
        if (!directory.isDirectory) return false
        val expected = RecreateModelStore.ASSETS
        if (!hasExactPinnedAssetNames(directory)) return false
        return expected.all { asset ->
            val file = File(directory, asset.name)
            file.length() == asset.size && sha256(file) == asset.sha256
        }
    }

    private fun hasExactPinnedAssetNames(directory: File): Boolean {
        val expectedNames = RecreateModelStore.ASSETS.map { it.name }.toSet()
        val entries = directory.listFiles()?.toList() ?: return false
        return entries.size == expectedNames.size && entries.all { it.isFile && it.name in expectedNames }
    }

    private fun sameFile(backup: File, current: File, existed: Boolean): Boolean =
        backup.exists() == existed && current.exists() == existed && (!existed || backup.isFile && current.isFile && sha256(backup) == sha256(current))

    private fun sameTree(backup: File, current: File, existed: Boolean): Boolean =
        backup.exists() == existed && current.exists() == existed && (!existed || backup.isDirectory && current.isDirectory && treeHash(backup) == treeHash(current))

    private fun treeHash(root: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        root.walkTopDown().filter { it.isFile }.sortedBy { it.relativeTo(root).path }.forEach { file ->
            digest.update(file.relativeTo(root).path.toByteArray(Charsets.UTF_8))
            digest.update(0.toByte())
            digest.update(file.length().toString().toByteArray(Charsets.US_ASCII))
            digest.update(0.toByte())
            FileInputStream(file).use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    fun setFreshOnboarding(): JSONObject {
        requireIdle()
        if (!backupRoot.resolve("manifest.json").isFile) throw AssertionError("UX_QA_BACKUP_REQUIRED")
        val saved = try { JSONObject(backupRoot.resolve("manifest.json").readText()) } catch (_: Throwable) { throw AssertionError("UX_QA_BACKUP_INVALID") }
        if (!saved.optBoolean("preferences")) throw AssertionError("UX_QA_PREFERENCES_NOT_BACKED_UP")
        val committed = context.getSharedPreferences("product-intro", Context.MODE_PRIVATE).edit().putInt("version", 0).commit()
        if (!committed) throw AssertionError("UX_QA_ONBOARDING_WRITE_FAILED")
        return JSONObject().put("action", "setFreshOnboarding").put("status", "ready")
    }

    fun inspectStore(): JSONObject {
        val model = RecreateModelStore(context) {}.snapshot()
        val session = File(appData, "files/session.json")
        val sessions = File(appData, "files/sessions")
        val sessionRoot = File(context.filesDir, "sessions")
        val modelRoot = File(context.filesDir, "recreate-model")
        val state = try { JSONObject(session.readText()).optString("state", "EMPTY") } catch (_: Throwable) { "EMPTY" }
        val usage = StorageUsage.scan(
            appData,
            context.cacheDir,
            sessionRoot,
            File(context.filesDir, "session.json"),
            modelRoot,
            StatFs(appData.path).availableBytes,
        )
        val filesRootMatches = try {
            File(appData, "files").canonicalFile == context.filesDir.canonicalFile
        } catch (_: Throwable) { false }
        return JSONObject().put("action", "inspectStore")
            .put("backupExists", backupRoot.resolve("manifest.json").isFile)
            .put("onboardingVersion", context.getSharedPreferences("product-intro", Context.MODE_PRIVATE).getInt("version", -1))
            .put("sessionExists", session.isFile).put("sessionState", state)
            .put("sessionJournalExists", session.isFile)
            .put("sessionFileCount", sessions.walkTopDown().count { it.isFile })
            .put("sessionsDirectoryBytes", size(sessions))
            .put("filesRootCanonicalMatch", filesRootMatches)
            .put("storageUsage", usage.toJson())
            .put("modelState", model.optString("state"))
            .put("modelDownloadedBytes", model.optLong("downloadedBytes"))
            .put("modelInstalledBytes", model.optLong("installedBytes"))
    }

    private fun requireIdle() {
        val session = File(appData, "files/session.json")
        val state = try { JSONObject(session.readText()).optString("state") } catch (_: Throwable) { "EMPTY" }
        val activeStates = setOf("PREPARING", "RUNNING", "FINALIZING", "CANCELLING")
        val runningServices = try {
            (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager)
                .getRunningServices(Int.MAX_VALUE).any {
                    it.service.className.endsWith(".ProcessingService") || it.service.className.endsWith(".RecreateDownloadService")
                }
        } catch (_: Throwable) { true }
        if (state in activeStates || SessionStore.workerAlive || SessionStore.serviceAlive || runningServices) {
            throw AssertionError("UX_QA_ACTIVE_WORK")
        }
    }

    private fun replace(staged: File, target: File, existed: Boolean) {
        target.deleteRecursively()
        if (existed && (!staged.exists() || !staged.renameTo(target))) throw AssertionError("UX_QA_RESTORE_ENTRY")
    }

    private fun size(file: File): Long = if (!file.exists()) 0L else if (file.isFile) file.length() else {
        file.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    private fun copyTree(source: File, destination: File) {
        if (!source.isDirectory) throw AssertionError("UX_QA_BACKUP_ENTRY")
        source.walkTopDown().forEach { from ->
            val relative = from.relativeTo(source)
            val to = File(destination, relative.path)
            if (from.isDirectory) to.mkdirs() else copyFile(from, to)
        }
    }

    private fun copyFile(source: File, destination: File) {
        if (!source.isFile) throw AssertionError("UX_QA_BACKUP_ENTRY")
        destination.parentFile?.mkdirs()
        FileInputStream(source).use { input -> FileOutputStream(destination).use { output -> input.copyTo(output); output.fd.sync() } }
    }

    private fun JSONObject.writeTo(file: File) {
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { it.write(toString().toByteArray(Charsets.UTF_8)); it.fd.sync() }
    }
}
