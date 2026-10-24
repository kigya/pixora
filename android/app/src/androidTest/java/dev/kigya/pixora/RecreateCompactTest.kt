package dev.kigya.pixora

import android.app.ActivityManager
import android.content.Context
import android.os.Bundle
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Debug
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max
import kotlin.math.min
import kotlin.math.floor

/** Explicit real-weight calibration test. Invoke only with downloaded models and selected test args. */
@RunWith(AndroidJUnit4::class)
class RecreateCompactTest {
    @Test fun exportSavedCalibrationImagesForQa() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val args = InstrumentationRegistry.getArguments()
        val exportEnabled = args.getString("recreateQaAction") == "exportCalibration" ||
            args.getString("recreateExportForQa") == "true"
        assumeTrue("Set recreateQaAction=exportCalibration to export test-only outputs", exportEnabled)
        val app = instrumentation.targetContext
        val sourceDirectory = File(app.cacheDir, "recreate-calibration")
        val externalFiles = app.getExternalFilesDir(null)
            ?: throw AssertionError("App-specific external files storage is unavailable")
        val outputDirectory = File(externalFiles, "recreate-calibration")
        val safeName = Regex("^(512|768|1024)-mib-(4|8)-steps-(run-[0-9]+-)?[0-9]+\\.png$")
        val outputs = sourceDirectory.listFiles()?.filter { it.isFile && it.name.matches(safeName) }.orEmpty()
        assertTrue("No saved Recreate calibration outputs found in app cache", outputs.isNotEmpty())
        assertTrue("Could not create app-specific QA output directory", outputDirectory.mkdirs() || outputDirectory.isDirectory)
        val exported = outputs.map { source ->
            val destination = File(outputDirectory, source.name)
            source.inputStream().use { input -> destination.outputStream().use { output -> input.copyTo(output) } }
            assertEquals("Exported test image bytes changed", source.length(), destination.length())
            "${destination.name}:${destination.length()}:${sha256(destination)}"
        }
        val summary = "Recreate QA export count=${exported.size} files=${exported.joinToString(",")} destination=app_external_files/recreate-calibration"
        println(summary)
        instrumentation.sendStatus(0, Bundle().apply {
            putString("recreateQaExport", summary)
            putInt("recreateQaExportCount", exported.size)
            putStringArrayList("recreateQaExportFiles", ArrayList(exported))
        })
    }

    @Test fun inspectRecreateAndCurrentAppStateReadOnly() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val models = RecreateModelStore(app, {})
        val sessionFile = File(app.filesDir, "session.json")
        val session = sessionFile.takeIf(File::isFile)?.let { org.json.JSONObject(it.readText()) }
        val image = session?.optJSONObject("image")
        val settingsKeys = app.getSharedPreferences("settings", Context.MODE_PRIVATE).all.keys.sorted()
        val onboardingKeys = app.getSharedPreferences("product-intro", Context.MODE_PRIVATE).all.keys.sorted()
        val modelState = if (models.isReady()) "ready" else "not_ready"
        val summary = "Recreate state inspection modelState=$modelState diffusionFile=${models.diffusionModel().name} diffusionBytes=${models.diffusionModel().length()} loraFile=${models.loraModel().name} loraBytes=${models.loraModel().length()} sessionState=${session?.optString("state") ?: "missing"} processingKind=${session?.optString("processingKind") ?: "unknown"} sourceDimensions=${image?.optInt("width") ?: 0}x${image?.optInt("height") ?: 0} workDimensions=${image?.optInt("workWidth") ?: 0}x${image?.optInt("workHeight") ?: 0} resultDimensions=${session?.optInt("resultWidth") ?: 0}x${session?.optInt("resultHeight") ?: 0} sessionFileBytes=${sessionFile.takeIf(File::isFile)?.length() ?: 0L} settingsPreferenceKeys=$settingsKeys onboardingPreferenceKeys=$onboardingKeys"
        println(summary)
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply {
            putString("recreateStateInspection", summary)
            putString("recreateModelState", modelState)
            putString("recreateDiffusionFile", models.diffusionModel().name)
            putString("recreateLoraFile", models.loraModel().name)
            putLong("recreateDiffusionBytes", models.diffusionModel().length())
            putLong("recreateLoraBytes", models.loraModel().length())
            putString("recreateSessionState", session?.optString("state") ?: "missing")
            putString("recreateProcessingKind", session?.optString("processingKind") ?: "unknown")
            putInt("recreateWorkWidth", image?.optInt("workWidth") ?: 0)
            putInt("recreateWorkHeight", image?.optInt("workHeight") ?: 0)
            putInt("recreateResultWidth", session?.optInt("resultWidth") ?: 0)
            putInt("recreateResultHeight", session?.optInt("resultHeight") ?: 0)
            putString("recreateSettingsPreferenceKeys", settingsKeys.joinToString(","))
            putString("recreateOnboardingPreferenceKeys", onboardingKeys.joinToString(","))
        })
    }

    @Test fun generatesRealCompactImageWithRequestedManagedBudgetAndStepCount() {
        val args = InstrumentationRegistry.getArguments()
        val budgetMiB = args.getString("recreateBudgetMiB")?.toInt() ?: 512
        val steps = args.getString("recreateSteps")?.toInt() ?: 4
        val seed = args.getString("recreateSeed")?.toLong() ?: 20261024L
        assertTrue("Supported budgets are 512, 768 or 1024 MiB", budgetMiB in setOf(512, 768, 1024))
        assertTrue("Recreate supports only LCM 4- or 8-step runs", steps == 4 || steps == 8)
        runCalibrationSequence(listOf(CalibrationRun(budgetMiB, steps, seed, null)))
    }

    @Test fun generatesThreeConsecutiveCompactImagesInSameWorkerProcess() {
        val seed = InstrumentationRegistry.getArguments().getString("recreateSeed")?.toLong() ?: 20261024L
        runCalibrationSequence(listOf(
            CalibrationRun(512, 4, seed, 1),
            CalibrationRun(512, 8, seed, 2),
            CalibrationRun(512, 4, seed, 3),
        ))
    }

    private data class CalibrationRun(
        val budgetMiB: Int,
        val steps: Int,
        val seed: Long,
        val iteration: Int?,
    )

    private fun runCalibrationSequence(runs: List<CalibrationRun>) {
        assertTrue("Calibration sequence must contain at least one real inference", runs.isNotEmpty())
        runs.forEach {
            assertTrue("Supported budgets are 512, 768 or 1024 MiB", it.budgetMiB in setOf(512, 768, 1024))
            assertTrue("Recreate supports only LCM 4- or 8-step runs", it.steps == 4 || it.steps == 8)
        }
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext
        // This direct native call must never share process-wide inference/cancellation state with a user job.
        val memory = app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val runningService = memory.getRunningServices(Int.MAX_VALUE).any {
            it.service.className == ProcessingService::class.java.name
        }
        assertFalse("Stop the app's processing service before memory calibration", runningService || SessionStore.workerAlive || SessionStore.serviceAlive)
        val savedSession = File(app.filesDir, "session.json").takeIf(File::isFile)?.let {
            org.json.JSONObject(it.readText()).optString("state")
        } ?: "EMPTY"
        assertFalse("Do not run calibration while the saved session is active", savedSession in SessionStore.activeStates)

        val models = RecreateModelStore(app, {})
        val diffusion = models.diffusionModel()
        val lora = models.loraModel()
        val ready = models.isReady()
        val initialAvailable = ActivityManager.MemoryInfo().also(memory::getMemoryInfo).availMem
        println("Recreate calibration modelState=${if (ready) "ready" else "not_ready"} diffusionBytes=${diffusion.length()} loraBytes=${lora.length()} availableBytes=$initialAvailable runs=${runs.size}")
        assertTrue("Download and verify both optional model files before calibration", ready)
        assertTrue("Managed budget exceeds current available memory; production preflight would reject", runs.all { initialAvailable >= it.budgetMiB.toLong() * 1024 * 1024 })
        assertEquals("Diffusion model size", RecreateModelStore.ASSETS[0].size, diffusion.length())
        assertEquals("LCM LoRA size", RecreateModelStore.ASSETS[1].size, lora.length())
        assertEquals("Diffusion SHA-256", RecreateModelStore.ASSETS[0].sha256, sha256(diffusion))
        assertEquals("LCM SHA-256", RecreateModelStore.ASSETS[1].sha256, sha256(lora))

        val source = instrumentation.context.assets.open("quality-review/landscape-256.jpg").use {
            BitmapFactory.decodeStream(it) ?: throw AssertionError("Fixed test fixture failed to decode")
        }
        val factor = min(1.0, 256.0 / max(source.width, source.height))
        val input = if (factor < 1.0) Bitmap.createScaledBitmap(
            source,
            max(1, (source.width * factor).toInt()),
            max(1, (source.height * factor).toInt()),
            true,
        ) else source
        try {
            runs.forEach { run ->
                runCalibrationOnce(instrumentation, app, memory, diffusion, lora, input, initialAvailable, run)
            }
        } finally {
            if (input !== source) input.recycle()
            source.recycle()
        }
    }

    private fun runCalibrationOnce(
        instrumentation: android.app.Instrumentation,
        app: Context,
        memory: ActivityManager,
        diffusion: File,
        lora: File,
        input: Bitmap,
        initialAvailable: Long,
        run: CalibrationRun,
    ) {
        val output = Bitmap.createBitmap(input.width, input.height, Bitmap.Config.ARGB_8888)
        val runAvailable = ActivityManager.MemoryInfo().also(memory::getMemoryInfo).availMem
        assertTrue("Available RAM after fixture preparation is below the selected budget", runAvailable >= run.budgetMiB.toLong() * 1024 * 1024)
        val expectedActualTotal = floor(run.steps * 0.6).toInt() + 1
        val progress = object : ProgressCallback {
            var lastStep = 0
            var lastTotal = 0
            var monotonic = true
            var matchingTotal = true
            var stableTotal = true
            var callbackCount = 0
            override fun onProgress(done: Int, total: Int): Boolean {
                if (done < lastStep || done < 0 || done > total) monotonic = false
                if (total != expectedActualTotal) matchingTotal = false
                if (callbackCount > 0 && total != lastTotal) stableTotal = false
                lastStep = done
                lastTotal = total
                callbackCount++
                return true
            }
        }
        val running = AtomicBoolean(true)
        val peakPssKiB = AtomicLong(Debug.getPss().toLong())
        val monitor = Thread {
            while (running.get()) {
                peakPssKiB.accumulateAndGet(Debug.getPss().toLong(), ::max)
                try { Thread.sleep(100) } catch (_: InterruptedException) { return@Thread }
            }
        }.apply { name = "PixoraRecreateMemoryProbe-${run.iteration ?: 0}"; isDaemon = true; start() }

        val runTag = run.iteration?.let { "run-$it-" }.orEmpty()
        val outputFile = File(app.cacheDir, "recreate-calibration/${run.budgetMiB}-mib-${run.steps}-steps-$runTag${run.seed}.png")
        outputFile.parentFile?.mkdirs()
        if (outputFile.exists()) assertTrue("Could not remove the previous test-only result", outputFile.delete())
        val started = SystemClock.elapsedRealtime()
        try {
            NativeEngine.resetRecreateCancellation()
            val code = NativeEngine.recreate(
                diffusion.absolutePath,
                lora.absolutePath,
                "a detailed mountain landscape in soft daylight, natural photographic texture",
                run.steps,
                run.seed,
                run.budgetMiB,
                input,
                output,
                progress,
            )
            val elapsedMs = SystemClock.elapsedRealtime() - started
            running.set(false)
            monitor.join(2_000)
            if (code == 0) {
                outputFile.outputStream().use { stream ->
                    assertTrue("Generated PNG write failed", output.compress(Bitmap.CompressFormat.PNG, 100, stream))
                }
            }
            val finalAvailable = ActivityManager.MemoryInfo().also(memory::getMemoryInfo).availMem
            val outputDigest = outputFile.takeIf { it.isFile && it.length() > 0L }?.let(::sha256).orEmpty()
            val summary = "Recreate calibration iteration=${run.iteration ?: 1} status=$code budgetMiB=${run.budgetMiB} requestedSteps=${run.steps} actualTotal=$expectedActualTotal callbackTotal=${progress.lastTotal} lastStep=${progress.lastStep} callbackCount=${progress.callbackCount} seed=${run.seed} canvas=${output.width}x${output.height} durationMs=$elapsedMs peakPssKiB=${peakPssKiB.get()} availableBeforeBytes=$initialAvailable availableAtRunBytes=$runAvailable availableAfterBytes=$finalAvailable outputBytes=${outputFile.length()} outputSha256=$outputDigest outputCacheFile=${outputFile.name}"
            instrumentation.sendStatus(0, Bundle().apply {
                putString("recreateCalibration", summary)
                putString("recreateOutputCacheFile", outputFile.name)
                putString("recreateOutputSha256", outputDigest)
                putLong("recreateDurationMs", elapsedMs)
                putLong("recreatePeakPssKiB", peakPssKiB.get())
                putLong("recreateAvailableBeforeBytes", initialAvailable)
                putLong("recreateAvailableAtRunBytes", runAvailable)
                putLong("recreateAvailableAfterBytes", finalAvailable)
                putInt("recreateStatus", code)
                putInt("recreateConfiguredSteps", run.steps)
                putInt("recreateActualTotal", expectedActualTotal)
                putInt("recreateCallbackTotal", progress.lastTotal)
                putInt("recreateLastStep", progress.lastStep)
                putInt("recreateCallbackCount", progress.callbackCount)
                putInt("recreateMemoryBudgetMiB", run.budgetMiB)
                run.iteration?.let { putInt("recreateIteration", it) }
            })
            println(summary)
            assertEquals("Native Recreate status", 0, code)
            assertTrue("Generated PNG is empty", outputFile.isFile && outputFile.length() > 0L)
            assertEquals(input.width, output.width)
            assertEquals(input.height, output.height)
            assertEquals(expectedActualTotal, progress.lastStep)
            assertEquals(expectedActualTotal, progress.lastTotal)
            assertTrue("Diffusion progress must be monotonic", progress.monotonic)
            assertTrue("Diffusion callback total must reflect strength-adjusted schedule", progress.matchingTotal)
            assertTrue("Diffusion total must stay stable", progress.stableTotal)
            assertTrue("A real img2img result must change the fixed fixture", bitmapHash(input) != bitmapHash(output))
        } finally {
            running.set(false)
            monitor.interrupt()
            monitor.join(2_000)
            NativeEngine.resetRecreateCancellation()
            output.recycle()
        }
    }

    private fun bitmapHash(bitmap: Bitmap): String {
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val digest = MessageDigest.getInstance("SHA-256")
        for (pixel in pixels) {
            digest.update((pixel ushr 24).toByte())
            digest.update((pixel ushr 16).toByte())
            digest.update((pixel ushr 8).toByte())
            digest.update(pixel.toByte())
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
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
