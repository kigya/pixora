package dev.kigya.pixora

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.ReadableMap
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.lang.reflect.Modifier
import java.lang.reflect.Proxy
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Offline FEAT-801/802 checks; never starts feedback or telemetry collection. */
@RunWith(AndroidJUnit4::class)
class Pixora08Test {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val ctx get() = instrumentation.targetContext

    private fun call(action: (Promise) -> Unit): Any? {
        val latch = CountDownLatch(1)
        var value: Any? = null
        var failure: String? = null
        val promise = Proxy.newProxyInstance(
            Promise::class.java.classLoader,
            arrayOf(Promise::class.java),
        ) { _, method, args ->
            when (method.name) {
                "resolve" -> {
                    value = args?.get(0)
                    latch.countDown()
                }
                "reject" -> {
                    failure = args?.get(0)?.toString()
                    latch.countDown()
                }
            }
            null
        } as Promise
        action(promise)
        assertTrue("Native promise did not settle", latch.await(30, TimeUnit.SECONDS))
        failure?.let { throw AppFailure(it) }
        return value
    }

    private fun failure(code: String, action: (Promise) -> Unit) {
        try {
            call(action)
            fail("Expected $code")
        } catch (error: AppFailure) {
            assertEquals(code, error.code)
        }
    }

    private fun withOfflineTelemetry(block: () -> Unit) {
        val prefs = ctx.getSharedPreferences("telemetry", Context.MODE_PRIVATE)
        val oldAnalytics = prefs.contains("analytics") to prefs.getBoolean("analytics", false)
        val oldCrashes = prefs.contains("crashes") to prefs.getBoolean("crashes", false)
        val oldTerminal = prefs.contains("terminalJob") to prefs.getString("terminalJob", null)
        assertTrue(prefs.edit().putBoolean("analytics", false).putBoolean("crashes", false).commit())
        try {
            block()
        } finally {
            val editor = prefs.edit()
            if (oldAnalytics.first) editor.putBoolean("analytics", oldAnalytics.second) else editor.remove("analytics")
            if (oldCrashes.first) editor.putBoolean("crashes", oldCrashes.second) else editor.remove("crashes")
            if (oldTerminal.first) editor.putString("terminalJob", oldTerminal.second) else editor.remove("terminalJob")
            assertTrue(editor.commit())
        }
    }

    private fun installImage(image: JSONObject) {
        SessionStore.update { state ->
            state.put("state", "READY")
                .put("sessionId", image.getString("id"))
                .put("jobId", "")
                .put("mode", "quality")
                .put("profileId", "standard")
                .put("speed", "quality")
                .put("image", JSONObject(image.toString()))
                .put("resultUri", "")
                .put("resultWidth", 0)
                .put("resultHeight", 0)
                .put("error", "")
        }
    }

    private fun restoreSession(saved: JSONObject) {
        SessionStore.update { current ->
            val currentKeys = current.keys().asSequence().toList()
            currentKeys.forEach { current.remove(it) }
            val savedKeys = saved.keys()
            while (savedKeys.hasNext()) {
                val key = savedKeys.next()
                current.put(key, saved.get(key))
            }
        }
    }

    private fun createModule() = UpscaleModule(BridgeReactContext(ctx))

    private fun copyLicensedPhoto(): File {
        val file = File(ctx.cacheDir, "pixora08-${UUID.randomUUID()}.jpg")
        instrumentation.context.assets.open("quality-review/landscape-256.jpg").use { input ->
            file.outputStream().use { input.copyTo(it) }
        }
        return file
    }

    private fun sha256(file: File): String = MessageDigest.getInstance("SHA-256")
        .digest(file.readBytes())
        .joinToString("") { "%02x".format(it) }

    @Test fun getRecommendationUsesPrivatePreviewChecksIdentityAndAvailability() = withOfflineTelemetry {
        SessionStore.init(ctx)
        ProfileAvailability.init(ctx)
        assertFalse("A test must not interrupt an existing processing job", SessionStore.busy())
        assertFalse(SessionStore.workerAlive)
        assertFalse(SessionStore.serviceAlive)
        val before = SessionStore.snapshot()
        val input = copyLicensedPhoto()
        var imageDir: File? = null
        var sessionTouched = false
        var oldAvailability: JSONObject? = null
        val availabilityField = ProfileAvailability::class.java.getDeclaredField("value").apply {
            isAccessible = true
        }
        val availabilityLock = ProfileAvailability::class.java.getDeclaredField("lock").apply {
            isAccessible = true
        }.get(ProfileAvailability)
        try {
            val module = createModule()
            val image = ImageFiles.import(ctx, Uri.fromFile(input))
            imageDir = File(image.getString("sourcePath")).parentFile
            installImage(image)
            sessionTouched = true
            val id = image.getString("id")

            failure("SOURCE_UNAVAILABLE") { module.getImageRecommendation("", it) }
            failure("SOURCE_UNAVAILABLE") { module.getImageRecommendation("another-image", it) }
            val result = call { module.getImageRecommendation(id, it) } as ReadableMap
            assertEquals(id, result.getString("imageId"))
            assertTrue(result.getString("profileId") in setOf("standard", "natural", "balanced"))
            assertEquals("quality", result.getString("speed"))
            assertTrue(result.getString("reasonId") in setOf("generic", "photo", "smooth", "mixed"))

            synchronized(availabilityLock) {
                oldAvailability = availabilityField.get(ProfileAvailability) as JSONObject
                availabilityField.set(
                    ProfileAvailability,
                    JSONObject(oldAvailability.toString()).apply {
                        ProcessingProfiles.presets.forEach { put(it, false) }
                        put("lite", true)
                    },
                )
            }
            val fallback = call { module.getImageRecommendation(id, it) } as ReadableMap
            assertEquals("lite", fallback.getString("profileId"))
            assertEquals("unavailable", fallback.getString("reasonId"))
            synchronized(availabilityLock) {
                availabilityField.set(ProfileAvailability, JSONObject().apply {
                    ProcessingProfiles.presets.forEach { put(it, false) }
                })
            }
            assertNull("No suitable profile is available", call { module.getImageRecommendation(id, it) })
        } finally {
            synchronized(availabilityLock) {
                oldAvailability?.let { availabilityField.set(ProfileAvailability, it) }
            }
            if (sessionTouched) restoreSession(before)
            imageDir?.deleteRecursively()
            input.delete()
        }
    }

    @Test fun realJniIgnoresRgbHiddenUnderTransparentAlpha() {
        val method = RecommendationEngine::class.java.getDeclaredMethod(
            "analyzeRecommendation",
            Int::class.javaPrimitiveType,
            Int::class.javaPrimitiveType,
            IntArray::class.java,
            Int::class.javaPrimitiveType,
        ).apply { isAccessible = true }
        val width = 96
        val height = 80
        val opaque = pixelGrid(width, height, 255)
        val transparent = pixelGrid(width, height, 0)
        val receiver = if (Modifier.isStatic(method.modifiers)) null else RecommendationEngine
        assertEquals("pixel", JSONObject(method.invoke(receiver, width, height, opaque, 63) as String).getString("reasonId"))
        assertEquals("generic", JSONObject(method.invoke(receiver, width, height, transparent, 63) as String).getString("reasonId"))
    }

    @Test fun preparationPreservesOriginalAndCpuPipelineWritesSelectedScale() = withOfflineTelemetry {
        SessionStore.init(ctx)
        ProfileAvailability.init(ctx)
        assertFalse("A test must not interrupt an existing processing job", SessionStore.busy())
        assertFalse(SessionStore.workerAlive)
        assertFalse(SessionStore.serviceAlive)
        assertTrue("The bundled on-device models must be valid", BundledModels(ctx).valid())
        val before = SessionStore.snapshot()
        val input = File(ctx.cacheDir, "pixora08-${UUID.randomUUID()}.png")
        var imageDir: File? = null
        var sessionTouched = false
        try {
            val bitmap = Bitmap.createBitmap(1280, 960, Bitmap.Config.ARGB_8888)
            try {
                val canvas = Canvas(bitmap)
                canvas.drawColor(Color.rgb(238, 238, 238))
                val paint = Paint(Paint.ANTI_ALIAS_FLAG)
                paint.color = Color.rgb(50, 112, 188)
                canvas.drawCircle(330f, 310f, 180f, paint)
                paint.color = Color.rgb(210, 74, 54)
                canvas.drawRect(620f, 180f, 1110f, 730f, paint)
                paint.color = Color.rgb(30, 60, 90)
                canvas.drawLine(90f, 850f, 1200f, 800f, paint)
                ImageFiles.write(bitmap, input, "png")
            } finally {
                bitmap.recycle()
            }
            val sourceDigest = sha256(input)
            val module = createModule()
            val image = ImageFiles.import(ctx, Uri.fromFile(input))
            imageDir = File(image.getString("sourcePath")).parentFile
            assertEquals(1280, image.getInt("width"))
            assertEquals(960, image.getInt("height"))
            assertTrue(image.getBoolean("needsPreparation"))
            assertEquals(1024, image.getInt("workWidth"))
            assertEquals(768, image.getInt("workHeight"))
            installImage(image)
            sessionTouched = true

            val prepared = call { module.prepareSelection(image.getString("id"), it) } as ReadableMap
            assertEquals(1280, prepared.getInt("width"))
            assertEquals(960, prepared.getInt("height"))
            assertEquals(1024, prepared.getInt("workWidth"))
            assertEquals(768, prepared.getInt("workHeight"))
            val sessionImage = SessionStore.snapshot().getJSONObject("image")
            val original = File(sessionImage.getString("sourcePath"))
            val working = File(sessionImage.getString("workPath"))
            assertTrue(original.isFile)
            assertTrue(working.isFile)
            assertEquals(sourceDigest, sha256(original))
            val workBitmap = BitmapFactory.decodeFile(working.path)
            assertNotNull(workBitmap)
            workBitmap!!.useBitmap { work ->
                assertEquals(1024, work.width)
                assertEquals(768, work.height)
            }

            val scale = 2
            val jobId = UUID.randomUUID().toString()
            SessionStore.update { state ->
                state.put("jobId", jobId)
                    .put("state", "PREPARING")
                    .put("phase", "preparing_image")
                    .put("profileId", "lite")
                    .put("speed", "fast")
                    .put("mode", "lite")
                    .put("modelId", ProcessingProfiles.model("lite"))
                    .put("scale", scale)
                    .put("startedAt", System.currentTimeMillis())
                    .put("timings", JSONObject())
            }
            val cpuBackend = object : ProcessingBackend by OnDeviceBackend {
                override fun gpuAvailable() = false
            }
            ImageProcessor(ctx, {}, { false }, cpuBackend).process()
            val result = SessionStore.snapshot()
            assertEquals("SUCCEEDED", result.getString("state"))
            assertEquals("CPU", result.getString("backend"))
            assertEquals(512, result.getInt("aiInputWidth"))
            assertEquals(384, result.getInt("aiInputHeight"))
            assertEquals(2048, result.getInt("resultWidth"))
            assertEquals(1536, result.getInt("resultHeight"))
            val output = BitmapFactory.decodeFile(result.getString("resultPath"))
            assertNotNull(output)
            output!!.useBitmap { actual ->
                assertEquals(2048, actual.width)
                assertEquals(1536, actual.height)
            }
            assertEquals(sourceDigest, sha256(original))
        } finally {
            NativeEngine.resetCancellation()
            if (sessionTouched) restoreSession(before)
            imageDir?.deleteRecursively()
            input.delete()
        }
    }

    private fun pixelGrid(width: Int, height: Int, alpha: Int): IntArray {
        val block = 4
        return IntArray(width * height) { index ->
            val x = index % width
            val y = index / width
            val cell = ((x / block) * 7 + (y / block) * 11) % 6
            Color.argb(alpha, cell * 42, (cell * 67) % 256, 255 - cell * 31)
        }
    }

    private inline fun <T : Bitmap, R> T.useBitmap(block: (T) -> R): R = try {
        block(this)
    } finally {
        recycle()
    }
}
