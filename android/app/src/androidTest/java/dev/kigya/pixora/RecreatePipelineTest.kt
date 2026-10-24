package dev.kigya.pixora

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.os.Debug
import android.os.StatFs
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max

/** Opt-in, real on-device Recreate -> ncnn upscale -> durable result/export lifecycle QA. */
@RunWith(AndroidJUnit4::class)
class RecreatePipelineTest {
    private companion object {
        const val SERVICE_DEADLINE_MS = 2_700_000L
        const val SERVICE_COMPLETION_GRACE_MS = 8 * 60 * 1000L
        const val CLEANUP_TIMEOUT_MS = 8 * 60 * 1000L
        const val PROGRESS_STATUS_INTERVAL_MS = 60_000L
    }

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    @Test fun runsRecreateFourEightFourThroughRealImageProcessorAndRestoresQaState() {
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(
            "Set recreatePipelineQa=true when invoking this long physical-device QA flow",
            arguments.getString("recreatePipelineQa") == "true",
        )
        val managedBudgetMiB = arguments.getString("recreateMemoryBudgetMiB")?.toIntOrNull() ?: 512
        require(managedBudgetMiB in setOf(512, 768, 1024)) {
            "recreateMemoryBudgetMiB must be one of 512, 768, or 1024"
        }
        val runSteps = (arguments.getString("recreateStepsList") ?: "4,8,4")
            .split(',')
            .map { token -> token.trim().toIntOrNull() ?: error("recreateStepsList must contain only 4 or 8") }
        require(runSteps.isNotEmpty() && runSteps.all { it == 4 || it == 8 }) {
            "recreateStepsList must contain one or more 4/8 step values"
        }
        val uiPauseMs = arguments.getString("recreateUiPauseMs")?.toLongOrNull() ?: 0L
        require(uiPauseMs in 0L..30_000L) { "recreateUiPauseMs must be between 0 and 30000" }

        val app = context
        requireOriginalBackupAndIdleSession(app)
        val modelStore = RecreateModelStore(app) {}
        assertTrue("Both pinned reconstruction assets must be installed and verified", modelStore.verifyInstalled())
        assertEquals(RecreateModelStore.ASSETS[0].size, modelStore.diffusionModel().length())
        assertEquals(RecreateModelStore.ASSETS[1].size, modelStore.loraModel().length())

        val snapshots = AppStateSnapshot.capture(app)
        val backupManifest = File(app.filesDir, "qa-ux-backup/manifest.json")
        val originalBackupDigest = sha256(backupManifest)
        val exportedUris = mutableListOf<Uri>()
        var fixture: File? = null
        val originalManagedBudgetMiB = RecreateMemoryBudget.limitMiB
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        try {
            disableTelemetryForRun(app)
            SessionStore.init(app)
            SessionStore.requireIdle()
            RecreateMemoryBudget.limitMiB = managedBudgetMiB

            val inputFixture = File(app.cacheDir, "recreate-pipeline-fixture-${UUID.randomUUID()}.jpg")
            fixture = inputFixture
            instrumentation.context.assets.open("quality-review/landscape-256.jpg").use { source ->
                inputFixture.outputStream().use { output -> source.copyTo(output) }
            }
            assertTrue("The fixture must be a valid licensed landscape image", inputFixture.length() > 0L)
            val outputDirectory = File(
                File(
                    app.getExternalFilesDir(null) ?: throw AssertionError("App-specific external files storage unavailable"),
                    "recreate-pipeline-qa",
                ),
                "sdk-budget-$managedBudgetMiB-mib",
            )
            assertTrue("Could not create app-specific QA output directory", outputDirectory.mkdirs() || outputDirectory.isDirectory)

            val summaries = JSONArray()
            runSteps.forEachIndexed { index, steps ->
                val scale = if (steps == 4) 2 else 4
                val run = runPipeline(app, inputFixture, outputDirectory, index + 1, steps, scale, managedBudgetMiB, exportedUris)
                summaries.put(run)
                instrumentation.sendStatus(0, Bundle().apply {
                    putString("recreatePipelineRun", run.toString())
                    putInt("recreatePipelineRunIndex", index + 1)
                    putInt("recreatePipelineSteps", steps)
                    putInt("recreatePipelineScale", scale)
                    putInt("recreatePipelineSdkManagedBudgetMiB", managedBudgetMiB)
                    putLong("recreatePipelineDurationMs", run.getLong("durationMs"))
                    putLong("recreatePipelinePeakPssKiB", run.getLong("peakPssKiB"))
                    putInt("recreatePipelineOutputWidth", run.getInt("width"))
                    putInt("recreatePipelineOutputHeight", run.getInt("height"))
                })
                println("Recreate pipeline QA run=$run")
                if (uiPauseMs > 0L) {
                    instrumentation.sendStatus(0, Bundle().apply {
                        putString("recreatePipelineUiPause", "successful_result_visible")
                        putInt("recreatePipelineRunIndex", index + 1)
                        putLong("recreatePipelineUiPauseMs", uiPauseMs)
                    })
                    Thread.sleep(uiPauseMs)
                }
            }

            val summary = "Recreate full-pipeline QA runs=${summaries.length()} steps=${runSteps.joinToString(",")} seed=20261024 sdkManagedBudgetMiB=$managedBudgetMiB statuses=SUCCEEDED outputFiles=${summaries.length()}"
            instrumentation.sendStatus(0, Bundle().apply {
                putString("recreatePipelineSummary", summary)
                putString("recreatePipelineOutputs", summaries.toString())
            })
            assertEquals("The original user backup must remain unchanged", originalBackupDigest, sha256(backupManifest))
        } finally {
            fixture?.delete()
            exportedUris.forEach { uri -> runCatching { app.contentResolver.delete(uri, null, null) } }
            try {
                cancelServiceAndWait(app)
                snapshots.restore(app)
                assertEquals("The original user backup must remain unchanged", originalBackupDigest, sha256(backupManifest))
            } finally {
                RecreateMemoryBudget.limitMiB = originalManagedBudgetMiB
                instrumentation.runOnMainSync { activity.finish() }
            }
        }
    }

    private fun requireOriginalBackupAndIdleSession(app: Context) {
        val userBackup = File(app.filesDir, "qa-ux-backup")
        val manifestFile = File(userBackup, "manifest.json")
        assertTrue("The original qa-ux-backup manifest must exist", manifestFile.isFile)
        val manifest = runCatching { JSONObject(manifestFile.readText()) }
            .getOrElse { throw AssertionError("The original qa-ux-backup manifest is invalid") }
        assertTrue("The original QA backup must contain preferences", manifest.optBoolean("preferences"))

        val manager = app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val processingService = manager.getRunningServices(Int.MAX_VALUE).any {
            it.service.className == ProcessingService::class.java.name
        }
        val savedSessionFile = File(app.filesDir, "session.json")
        if (savedSessionFile.isFile) {
            val savedState = JSONObject(savedSessionFile.readText()).optString("state")
            assertFalse("Do not run pipeline QA while the persisted session is active", savedState in SessionStore.activeStates)
        }
        SessionStore.init(app)
        assertFalse("Do not interrupt a foreground processing service", processingService)
        assertFalse("Do not interrupt an active processing worker", SessionStore.workerAlive)
        assertFalse("Do not interrupt an active processing service", SessionStore.serviceAlive)
        SessionStore.requireIdle()
    }

    private fun disableTelemetryForRun(app: Context) {
        val preferences = app.getSharedPreferences("telemetry", Context.MODE_PRIVATE)
        val noticeSeen = preferences.getBoolean("noticeSeen", false)
        Telemetry.update(analytics = false, crashes = false, noticeSeen = noticeSeen)
    }

    private fun awaitServiceTerminal(): JSONObject {
        val deadline = SystemClock.elapsedRealtime() + SERVICE_DEADLINE_MS + SERVICE_COMPLETION_GRACE_MS
        var lastStatusAt = SystemClock.elapsedRealtime()
        while (SystemClock.elapsedRealtime() < deadline) {
            val state = SessionStore.snapshot()
            if (!SessionStore.workerAlive && !SessionStore.serviceAlive &&
                state.optString("state") in setOf("SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED")
            ) return state
            val now = SystemClock.elapsedRealtime()
            if (now - lastStatusAt >= PROGRESS_STATUS_INTERVAL_MS) {
                lastStatusAt = now
                val progress = progressStatus(state, now)
                instrumentation.sendStatus(0, Bundle().apply {
                    putString("recreatePipelineProgress", progress.toString())
                })
                println("Recreate pipeline QA progress=$progress")
            }
            Thread.sleep(250)
        }
        throw AssertionError("ProcessingService did not reach terminal idle state before the QA wait limit")
    }

    private fun progressStatus(job: JSONObject, monotonicNow: Long): JSONObject = JSONObject()
        .put("state", job.optString("state"))
        .put("phase", job.optString("phase"))
        .put("progress", job.optDouble("progress", -1.0))
        .put("completedTiles", job.optInt("completedTiles"))
        .put("totalTiles", job.optInt("totalTiles"))
        .put("elapsedMs", job.optLong("elapsedMs"))
        .put("observedAtElapsedRealtimeMs", monotonicNow)
        .put("sdkManagedBudgetMiB", RecreateMemoryBudget.limitMiB)
        .put("timings", safeTimings(job))

    private fun safeTimings(job: JSONObject): JSONObject {
        val timings = job.optJSONObject("timings") ?: return JSONObject()
        val safe = JSONObject()
        listOf(
            "prepareMs", "modelLoadMs", "gpuCheckMs", "preprocessingMs", "inferenceMs",
            "assemblyMs", "resizeMs", "writeAndPreviewMs",
        ).forEach { key ->
            val value = timings.optDouble(key, Double.NaN)
            if (value.isFinite() && value >= 0.0) safe.put(key, value)
        }
        return safe
    }

    private fun cancelServiceAndWait(app: Context) {
        if (!SessionStore.workerAlive && !SessionStore.serviceAlive && !SessionStore.busy()) return
        val jobId = SessionStore.snapshot().optString("jobId")
        NativeEngine.cancel()
        NativeEngine.cancelRecreate()
        runCatching {
            instrumentation.runOnMainSync {
                app.startService(
                    Intent(app, ProcessingService::class.java)
                        .setAction("CANCEL")
                        .putExtra("jobId", jobId),
                )
            }
        }
        val deadline = SystemClock.elapsedRealtime() + CLEANUP_TIMEOUT_MS
        while (SystemClock.elapsedRealtime() < deadline) {
            val state = SessionStore.snapshot().optString("state")
            if (!SessionStore.workerAlive && !SessionStore.serviceAlive && state !in SessionStore.activeStates) return
            Thread.sleep(250)
        }
        throw AssertionError("ProcessingService did not stop; refusing to restore session files while its worker is active")
    }

    private fun runReport(
        iteration: Int,
        steps: Int,
        scale: Int,
        managedBudgetMiB: Int,
        job: JSONObject,
        durationMs: Long,
        peakPssKiB: Long,
        availableBeforeBytes: Long,
        fallbackError: String = "",
    ): JSONObject {
        val resultFile = job.optString("resultPath").takeIf(String::isNotEmpty)?.let(::File)
        return JSONObject()
            .put("iteration", iteration)
            .put("steps", steps)
            .put("sdkManagedBudgetMiB", managedBudgetMiB)
            .put("seed", job.optLong("recreateSeed"))
            .put("scale", scale)
            .put("state", job.optString("state"))
            .put("phase", job.optString("phase"))
            .put("progress", job.optDouble("progress", -1.0))
            .put("completedTiles", job.optInt("completedTiles"))
            .put("totalTiles", job.optInt("totalTiles"))
            .put("timings", safeTimings(job))
            .put("error", job.optString("error").ifEmpty { fallbackError })
            .put("backend", job.optString("backend"))
            .put("width", job.optInt("resultWidth"))
            .put("height", job.optInt("resultHeight"))
            .put("durationMs", durationMs)
            .put("peakPssKiB", peakPssKiB)
            .put("availableBeforeBytes", availableBeforeBytes)
            .put("resultBytes", resultFile?.takeIf(File::isFile)?.length() ?: 0L)
            .put("resultSha256", resultFile?.takeIf(File::isFile)?.let(::sha256).orEmpty())
    }

    private fun writeRunReport(directory: File, iteration: Int, steps: Int, scale: Int, managedBudgetMiB: Int, report: JSONObject) {
        val output = File(directory, "recreate-pipeline-run-$iteration-$steps-steps-${scale}x-budget-$managedBudgetMiB-mib.json")
        assertFalse("Refusing to overwrite an existing per-run QA report", output.exists())
        val temporary = File(directory, output.name + ".partial")
        try {
            temporary.writeText(report.toString(2))
            assertTrue("Could not commit the per-run QA report", temporary.renameTo(output))
        } finally {
            temporary.delete()
        }
    }

    private fun runPipeline(
        app: Context,
        fixture: File,
        outputDirectory: File,
        iteration: Int,
        steps: Int,
        scale: Int,
        managedBudgetMiB: Int,
        exportedUris: MutableList<Uri>,
    ): JSONObject {
        val manager = app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val beforeMemory = ActivityManager.MemoryInfo().also(manager::getMemoryInfo)
        RecreateMemoryBudget.requireHeadroom(beforeMemory.availMem)
        assertTrue("At least 512 MiB of app storage headroom is required", StatFs(app.filesDir.path).availableBytes >= 512L * 1024 * 1024)

        val source = ImageFiles.import(app, Uri.fromFile(fixture))
        val sourcePath = File(source.getString("sourcePath"))
        assertTrue("Imported source must exist", sourcePath.isFile)
        val sourceDigest = sha256(sourcePath)
        SessionStore.replace(source)
        val seed = 20261024L
        val jobId = "recreate-pipeline-qa-$iteration-${UUID.randomUUID()}"
        SessionStore.update {
            it.put("state", "PREPARING")
                .put("jobId", jobId)
                .put("processingKind", "recreate")
                .put("recreateSeed", seed)
                .put("recreateModelRevision", RecreateModelStore.REVISION)
                .put("recreatePrompt", "a detailed mountain landscape in soft daylight, natural photographic texture")
                .put("recreateSteps", steps)
                .put("resolution", "prepared")
                .put("profileId", "standard")
                .put("speed", if (steps == 4) "fast" else "quality")
                .put("mode", "recreate")
                .put("modelId", "stable-diffusion-v1-5-q4-lcm")
                .put("scale", scale)
                .put("phase", "preparing_image")
                .put("completedTiles", 0)
                .put("totalTiles", 0)
                .put("startedAt", System.currentTimeMillis())
                .put("elapsedMs", 0)
                .put("progress", -1)
                .put("timings", JSONObject())
                .put("error", "")
                .put("resultUri", "")
                .put("resultWidth", 0)
                .put("resultHeight", 0)
                .put("exports", JSONArray())
                .put("exportState", "EXPORT_IDLE")
        }

        val running = AtomicBoolean(true)
        val peakPss = AtomicLong(Debug.getPss().toLong())
        val monitor = Thread {
            while (running.get()) {
                peakPss.accumulateAndGet(Debug.getPss().toLong(), ::max)
                try { Thread.sleep(250) } catch (_: InterruptedException) { return@Thread }
            }
        }.apply { name = "PixoraRecreatePipelineMemoryProbe-$iteration"; isDaemon = true; start() }

        val started = SystemClock.elapsedRealtime()
        try {
            NativeEngine.resetRecreateCancellation()
            instrumentation.runOnMainSync {
                app.startForegroundService(Intent(app, ProcessingService::class.java).setAction("PROCESS"))
            }
            awaitServiceTerminal()
        } catch (failure: Throwable) {
            val current = SessionStore.snapshot()
            val failedReport = runReport(
                iteration,
                steps,
                scale,
                managedBudgetMiB,
                current,
                SystemClock.elapsedRealtime() - started,
                peakPss.get(),
                beforeMemory.availMem,
                failure.javaClass.simpleName,
            )
            writeRunReport(outputDirectory, iteration, steps, scale, managedBudgetMiB, failedReport)
            instrumentation.sendStatus(0, Bundle().apply { putString("recreatePipelineRun", failedReport.toString()) })
            throw failure
        } finally {
            running.set(false)
            monitor.join(2_000)
        }
        val durationMs = SystemClock.elapsedRealtime() - started
        val job = SessionStore.snapshot()
        val report = runReport(iteration, steps, scale, managedBudgetMiB, job, durationMs, peakPss.get(), beforeMemory.availMem)
        writeRunReport(outputDirectory, iteration, steps, scale, managedBudgetMiB, report)
        instrumentation.sendStatus(0, Bundle().apply {
            putString("recreatePipelineRun", report.toString())
            putInt("recreatePipelineRunIndex", iteration)
            putInt("recreatePipelineSteps", steps)
            putInt("recreatePipelineScale", scale)
            putInt("recreatePipelineSdkManagedBudgetMiB", managedBudgetMiB)
            putLong("recreatePipelineDurationMs", durationMs)
            putLong("recreatePipelinePeakPssKiB", peakPss.get())
            putInt("recreatePipelineOutputWidth", report.getInt("width"))
            putInt("recreatePipelineOutputHeight", report.getInt("height"))
        })
        println("Recreate pipeline QA run=$report")
        assertEquals("Real Recreate + ncnn pipeline must reach SUCCEEDED", "SUCCEEDED", job.optString("state"))
        assertEquals("Job identity must remain attached to the result", jobId, job.getString("jobId"))
        assertEquals("Seed must be persisted with the generated result", seed, job.getLong("recreateSeed"))
        assertEquals("Configured LCM steps must be persisted", steps, job.getInt("recreateSteps"))
        assertEquals("Reconstruction model revision must be persisted", RecreateModelStore.REVISION, job.getString("recreateModelRevision"))

        val savedResult = File(job.getString("resultPath"))
        assertTrue("Successful job must write a non-empty PNG result", savedResult.isFile && savedResult.length() > 0L)
        val expectedWidth = source.getInt("workWidth") * scale
        val expectedHeight = source.getInt("workHeight") * scale
        assertEquals(expectedWidth, job.getInt("resultWidth"))
        assertEquals(expectedHeight, job.getInt("resultHeight"))
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(savedResult.path, bounds)
        assertEquals(expectedWidth, bounds.outWidth)
        assertEquals(expectedHeight, bounds.outHeight)
        val resultBitmap = BitmapFactory.decodeFile(savedResult.path)
            ?: throw AssertionError("Successful result must decode as a bitmap")
        try {
            val bitmap = resultBitmap
            assertEquals(expectedWidth, bitmap.width)
            assertEquals(expectedHeight, bitmap.height)
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            assertTrue("Opaque JPEG input must not acquire transparent result pixels", pixels.all { it ushr 24 == 255 })
        } finally {
            resultBitmap.recycle()
        }
        assertEquals("The original imported image must not be modified", sourceDigest, sha256(sourcePath))

        val qaName = "recreate-pipeline-${iteration}-${steps}-steps-${scale}x-budget-$managedBudgetMiB-mib-seed-$seed.png"
        val qaFile = File(outputDirectory, qaName)
        assertFalse("Refusing to overwrite an existing QA output", qaFile.exists())
        savedResult.inputStream().use { input -> qaFile.outputStream().use { output -> input.copyTo(output) } }
        assertEquals("QA copy size must match the saved result", savedResult.length(), qaFile.length())

        val exportBytes = JSONObject()
        listOf("png", "jpeg", "webp").forEach { format ->
            val exported = ImageFiles.export(app, job, format)
            val uri = Uri.parse(exported.getString("uri"))
            exportedUris.add(uri)
            assertEquals(format, exported.getString("format"))
            assertEquals(expectedWidth, exported.getInt("width"))
            assertEquals(expectedHeight, exported.getInt("height"))
            assertTrue("Exported $format must contain bytes", exported.getLong("size") > 0L)
            app.contentResolver.openInputStream(uri).use { opened ->
                val stream = opened ?: throw AssertionError("Exported $format must be readable")
                val decoded = BitmapFactory.decodeStream(stream)
                    ?: throw AssertionError("Exported $format must decode")
                try {
                    val bitmap = decoded
                    assertEquals(expectedWidth, bitmap.width)
                    assertEquals(expectedHeight, bitmap.height)
                } finally {
                    decoded.recycle()
                }
            }
            assertEquals("Test export row must be removed immediately", 1, app.contentResolver.delete(uri, null, null))
            exportedUris.remove(uri)
            exportBytes.put(format, exported.getLong("size"))
        }

        return JSONObject()
            .put("iteration", iteration)
            .put("steps", steps)
            .put("sdkManagedBudgetMiB", managedBudgetMiB)
            .put("seed", seed)
            .put("scale", scale)
            .put("state", job.getString("state"))
            .put("backend", job.getString("backend"))
            .put("width", expectedWidth)
            .put("height", expectedHeight)
            .put("durationMs", durationMs)
            .put("peakPssKiB", peakPss.get())
            .put("availableBeforeBytes", beforeMemory.availMem)
            .put("resultBytes", savedResult.length())
            .put("resultSha256", sha256(savedResult))
            .put("qaOutput", qaFile.name)
            .put("exportsBytes", exportBytes)
    }

    private class AppStateSnapshot private constructor(
        private val savedSession: JSONObject,
        private val sessionFiles: File,
        private val savedPreferences: Map<String, Map<String, Any>>,
    ) {
        fun restore(app: Context) {
            requireIdleAfterPipeline()
            val sessionsDirectory = File(app.filesDir, "sessions")
            sessionsDirectory.deleteRecursively()
            if (sessionFiles.isDirectory) copyTree(sessionFiles, sessionsDirectory)

            SessionStore.update { current ->
                current.keys().asSequence().toList().forEach(current::remove)
                savedSession.keys().asSequence().forEach { key -> current.put(key, savedSession.get(key)) }
            }
            val journalBackup = File(temporaryRoot(app), "session.json.bak")
            if (journalBackup.isFile) journalBackup.copyTo(File(app.filesDir, "session.json.bak"), overwrite = true)
            restorePreferences(app, savedPreferences)
            restoreTelemetryRuntime(app)
            temporaryRoot(app).deleteRecursively()
            val originalSource = savedSession.optJSONObject("image")?.optString("sourcePath").orEmpty()
            if (originalSource.isNotEmpty()) assertTrue("Original user session source must remain available", File(originalSource).isFile)
        }

        private fun requireIdleAfterPipeline() {
            assertFalse("Pipeline worker must be complete before QA restoration", SessionStore.workerAlive)
            assertFalse("Pipeline service must be idle before QA restoration", SessionStore.serviceAlive)
        }

        companion object {
            fun capture(app: Context): AppStateSnapshot {
                val root = temporaryRoot(app)
                root.deleteRecursively()
                val current = SessionStore.snapshot()
                val sessions = File(app.filesDir, "sessions")
                val copiedSessions = File(root, "sessions")
                val requiredBytes = treeSize(sessions) + File(app.filesDir, "session.json").takeIf(File::isFile)?.length().orZero() +
                    File(app.filesDir, "session.json.bak").takeIf(File::isFile)?.length().orZero()
                assertTrue(
                    "Insufficient storage to preserve the current QA session safely",
                    StatFs(app.cacheDir.path).availableBytes >= requiredBytes + 128L * 1024 * 1024,
                )
                assertTrue("Could not recreate QA restoration staging directory", root.mkdirs())
                if (sessions.isDirectory) copyTree(sessions, copiedSessions)
                File(app.filesDir, "session.json").takeIf(File::isFile)?.copyTo(File(root, "session.json"), overwrite = true)
                File(app.filesDir, "session.json.bak").takeIf(File::isFile)?.copyTo(File(root, "session.json.bak"), overwrite = true)
                val preferences = readPreferences(app)
                val savedSession = JSONObject(current.toString())
                return AppStateSnapshot(savedSession, copiedSessions, preferences)
            }

            private fun temporaryRoot(app: Context) = File(app.cacheDir, "recreate-pipeline-preserved-state")

            private fun restorePreferences(app: Context, original: Map<String, Map<String, Any>>) {
                val preferenceFiles = File(app.applicationInfo.dataDir, "shared_prefs")
                val currentNames = preferenceFiles.listFiles().orEmpty()
                    .filter { it.isFile && it.extension == "xml" }
                    .map { it.nameWithoutExtension }
                    .toSet() + original.keys
                currentNames.forEach { name ->
                    val preference = app.getSharedPreferences(name, Context.MODE_PRIVATE)
                    val editor = preference.edit().clear()
                    original[name].orEmpty().forEach { (key, value) ->
                        when (value) {
                            is Boolean -> editor.putBoolean(key, value)
                            is Int -> editor.putInt(key, value)
                            is Long -> editor.putLong(key, value)
                            is Float -> editor.putFloat(key, value)
                            is String -> editor.putString(key, value)
                            is Set<*> -> editor.putStringSet(key, value.filterIsInstance<String>().toSet())
                        }
                    }
                    assertTrue("Could not restore application preferences", editor.commit())
                }
            }

            private fun restoreTelemetryRuntime(app: Context) {
                runCatching { Telemetry.initPrepared() }.recoverCatching {
                    Telemetry.init(app)
                }.getOrThrow()
            }

            private fun readPreferences(app: Context): Map<String, Map<String, Any>> {
                val root = File(app.applicationInfo.dataDir, "shared_prefs")
                return root.listFiles().orEmpty()
                    .filter { it.isFile && it.extension == "xml" }
                    .associate { file ->
                        val name = file.nameWithoutExtension
                        val values = app.getSharedPreferences(name, Context.MODE_PRIVATE).all
                            .mapNotNull { (key, value) -> value?.let { key to it } }
                            .toMap()
                        name to values
                    }
            }

            private fun treeSize(file: File): Long = when {
                file.isFile -> file.length()
                file.isDirectory -> file.listFiles().orEmpty().sumOf(::treeSize)
                else -> 0L
            }

            private fun Long?.orZero() = this ?: 0L

            private fun copyTree(source: File, destination: File) {
                if (source.isFile) {
                    destination.parentFile?.mkdirs()
                    source.inputStream().use { input -> destination.outputStream().use { output -> input.copyTo(output) } }
                    return
                }
                if (!source.isDirectory) return
                assertTrue("Could not create preserved session directory", destination.mkdirs() || destination.isDirectory)
                source.listFiles().orEmpty().forEach { child -> copyTree(child, File(destination, child.name)) }
            }
        }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
