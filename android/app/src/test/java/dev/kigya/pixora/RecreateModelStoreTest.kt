package dev.kigya.pixora

import android.app.Application
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class RecreateModelStoreTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private val bytes = "pinned-small-model-fixture".toByteArray()
    private val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    private lateinit var asset: RecreateModelStore.Asset

    @Before fun cleanStore() {
        context.filesDir.resolve("recreate-model").deleteRecursively()
        context.getSharedPreferences("recreate-model", 0).edit().clear().commit()
        asset = RecreateModelStore.Asset("fixture.gguf", "https://models.example.invalid/pinned/fixture.gguf", bytes.size.toLong(), hash)
    }

    @Test fun productionManifestIsPinnedAndMatchesThePublishedPackageContract() {
        val assets = RecreateModelStore.ASSETS
        assertEquals(2, assets.size)
        assertEquals(RecreateModelStore.TOTAL, assets.sumOf { it.size })
        assertTrue(assets.all { it.url.startsWith("https://huggingface.co/") && it.url.contains("/resolve/[0-9a-f]{40}/".toRegex()) })
        assertEquals(listOf("sd15-q4.gguf", "lcm-lora.safetensors"), assets.map { it.name })
        assertTrue(assets.all { it.sha256.matches(Regex("[0-9a-f]{64}")) })
    }

    @Test fun verifiedDownloadInstallsAtomicallyAndRecordsOnlyPinnedHash() {
        val connection = FakeConnection(200, bytes)
        val store = store { connection }
        store.download()
        assertEquals("ready", store.snapshot().getString("state"))
        assertEquals(bytes.size.toLong(), store.modelBytes())
        assertEquals(0L, store.partialBytes())
        assertTrue(store.isReady())
        assertEquals(hash, context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
    }

    @Test fun installedModelRemainsReadyAcrossSnapshotsAndStoreRecreation() {
        val store = store { FakeConnection(200, bytes) }
        store.download()
        repeat(3) { assertEquals("ready", store.snapshot().getString("state")) }
        val restored = store { throw AssertionError("ready models do not need a request") }
        assertEquals("ready", restored.snapshot().getString("state"))
        assertTrue(restored.verifyInstalled())
    }

    @Test fun completeVerifiedPartialIsPromotedWithoutRequestingAnInvalidEndRange() {
        val part = context.filesDir.resolve("recreate-model/${asset.name}.part")
        part.parentFile!!.mkdirs(); part.writeBytes(bytes)
        val store = store({ throw AssertionError("a complete part must be verified locally") })
        assertEquals("paused", store.snapshot().getString("state"))
        store.download()
        assertEquals("ready", store.snapshot().getString("state"))
        assertArrayEquals(bytes, store.directory().resolve(asset.name).readBytes())
        assertEquals(hash, context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
    }

    @Test fun mismatchedDigestNeverInstallsAndRemovesInvalidPartial() {
        val store = store({ FakeConnection(200, bytes) }, asset.copy(sha256 = "0".repeat(64)))
        store.download()
        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_INTEGRITY_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertFalse(store.directory().resolve(asset.name).exists())
        assertFalse(store.directory().resolve(asset.name + ".part").exists())
    }

    @Test fun sameLengthInstalledCorruptionIsRejectedBeforeInference() {
        val store = store({ FakeConnection(200, bytes) })
        store.download()
        store.directory().resolve(asset.name).writeBytes(ByteArray(bytes.size) { 0 })
        assertFalse(store.verifyInstalled())
        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_INTEGRITY_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
    }

    @Test fun resumeRequiresExactRangeAndAppendsOnlyTheMissingBytes() {
        val part = context.filesDir.resolve("recreate-model/${asset.name}.part")
        part.parentFile!!.mkdirs(); part.writeBytes(bytes.copyOfRange(0, 7))
        lateinit var connection: FakeConnection
        val store = store({ url -> FakeConnection(206, bytes.copyOfRange(7, bytes.size), mapOf("Content-Range" to "bytes 7-${bytes.size - 1}/${bytes.size}")).also { connection = it } })
        store.download()
        assertEquals("bytes=7-", connection.getRequestProperty("Range"))
        assertArrayEquals(bytes, store.directory().resolve(asset.name).readBytes())
        assertEquals("ready", store.snapshot().getString("state"))
    }

    @Test fun resumeRejectsMismatchedContentRangeWithoutPublishingModel() {
        val part = context.filesDir.resolve("recreate-model/${asset.name}.part")
        part.parentFile!!.mkdirs(); part.writeBytes(bytes.copyOfRange(0, 7))
        val store = store({ FakeConnection(206, bytes.copyOfRange(7, bytes.size), mapOf("Content-Range" to "bytes 2-${bytes.size - 1}/${bytes.size}")) })
        store.download()
        assertEquals("failed", store.snapshot().getString("state"))
        assertFalse(store.isReady())
        assertFalse(store.directory().resolve(asset.name).exists())
    }

    @Test fun cancellationPreservesPartialAndDeleteIsRejectedUntilTransferStops() {
        val enteredRead = CountDownLatch(1); val releaseRead = CountDownLatch(1)
        val input = object : InputStream() {
            private var sent = false
            override fun read(): Int = -1
            override fun read(target: ByteArray, offset: Int, length: Int): Int {
                if (sent) return -1
                enteredRead.countDown(); check(releaseRead.await(3, TimeUnit.SECONDS)); sent = true
                bytes.copyInto(target, offset); return bytes.size
            }
        }
        val store = store({ FakeConnection(200, input) })
        val worker = Thread { store.download() }; worker.start()
        assertTrue(enteredRead.await(3, TimeUnit.SECONDS))
        try { store.delete(); fail("delete must reject an in-flight transfer") } catch (failure: AppFailure) { assertEquals("BUSY", failure.code) }
        store.cancel(); releaseRead.countDown(); worker.join(3_000)
        assertFalse(worker.isAlive)
        assertEquals("paused", store.snapshot().getString("state"))
        assertFalse(store.isReady())
        assertTrue(store.directory().resolve(asset.name + ".part").exists())
        store.delete()
        assertEquals("absent", store.snapshot().getString("state"))
        assertEquals(0L, store.partialBytes())
    }

    @Test fun failedDeleteDoesNotClaimModelIsAbsent() {
        val obstruction = context.filesDir.resolve("recreate-model/${asset.name}")
        obstruction.mkdirs(); obstruction.resolve("held").writeText("still here")
        val store = store({ FakeConnection(200, bytes) })
        try { store.delete(); fail("non-empty model path must not be reported as deleted") }
        catch (failure: AppFailure) { assertEquals("MODEL_DELETE_FAILED", failure.code) }
        assertEquals("failed", store.snapshot().getString("state"))
        assertTrue(obstruction.resolve("held").exists())
    }

    private fun store(factory: (URL) -> HttpURLConnection, manifest: RecreateModelStore.Asset = asset) =
        RecreateModelStore(context, {}, listOf(manifest), factory) { 2L * 1024 * 1024 * 1024 }

    private class FakeConnection(
        private val status: Int,
        private val body: InputStream,
        private val headers: Map<String, String> = emptyMap(),
    ) : HttpURLConnection(URL("https://models.example.invalid/fixture")) {
        constructor(status: Int, bytes: ByteArray, headers: Map<String, String> = emptyMap()) : this(status, ByteArrayInputStream(bytes), headers)
        override fun connect() { connected = true }
        override fun disconnect() { connected = false }
        override fun usingProxy() = false
        override fun getResponseCode() = status
        override fun getInputStream() = body
        override fun getHeaderField(name: String) = headers[name]
    }
}
