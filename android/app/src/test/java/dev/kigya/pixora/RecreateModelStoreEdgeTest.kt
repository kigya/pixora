package dev.kigya.pixora

import android.app.Application
import android.content.ContextWrapper
import android.content.SharedPreferences
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class RecreateModelStoreEdgeTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private val bytes = "resume-edge-fixture".toByteArray()
    private val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    private lateinit var asset: RecreateModelStore.Asset

    @Before fun reset() {
        context.filesDir.resolve("recreate-model").deleteRecursively()
        context.getSharedPreferences("recreate-model", 0).edit().clear().commit()
        asset = RecreateModelStore.Asset("edge.gguf", "https://models.example.invalid/edge.gguf", bytes.size.toLong(), hash)
    }

    @Test fun cancelDuringHashOfCompleteUnmarkedTargetLeavesTargetAndDoesNotCommitMarker() {
        val target = File(context.filesDir, "recreate-model/${asset.name}").apply { parentFile!!.mkdirs(); writeBytes(bytes) }
        val enteredHash = CountDownLatch(1)
        val releaseHash = CountDownLatch(1)
        var requested = false
        val store = makeStore(
            openConnection = { requested = true; error("complete target must be verified locally") },
            openHashInput = { file -> blockingStream(file, enteredHash, releaseHash) },
        )

        assertTrue(store.reserveDownload())
        val worker = Thread { store.downloadReserved() }
        worker.start()
        assertTrue("retry should verify the existing complete target", enteredHash.await(3, TimeUnit.SECONDS))
        try {
            store.cancel()
            releaseHash.countDown()
            worker.join(3_000)
            assertFalse("cancelled target hash should release its worker", worker.isAlive)
            assertEquals("paused", store.snapshot().getString("state"))
            assertEquals("", store.snapshot().getString("error"))
            assertArrayEquals(bytes, target.readBytes())
            assertNull(context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
            assertFalse(requested)
        } finally {
            releaseHash.countDown()
            worker.join(3_000)
        }
    }

    @Test fun completeUnmarkedTargetIsHashedAndOnlyThenMarkedReady() {
        val target = File(context.filesDir, "recreate-model/${asset.name}").apply { parentFile!!.mkdirs(); writeBytes(bytes) }
        val store = makeStore(openConnection = { error("verified target must not be downloaded") })

        store.download()

        assertEquals("ready", store.snapshot().getString("state"))
        assertEquals(asset.size, store.snapshot().getLong("installedBytes"))
        assertEquals(hash, context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
        assertArrayEquals(bytes, target.readBytes())
    }

    @Test fun sameLengthCorruptInstalledTargetIsReplacedOnlyAfterFreshHashVerification() {
        val corrupt = bytes.copyOf().apply { this[0] = (this[0].toInt() xor 1).toByte() }
        val target = File(context.filesDir, "recreate-model/${asset.name}").apply {
            parentFile!!.mkdirs()
            writeBytes(corrupt)
        }
        val store = makeStore(openConnection = { FakeConnection(200, bytes) })

        store.download()

        assertEquals("ready", store.snapshot().getString("state"))
        assertArrayEquals(bytes, target.readBytes())
        assertEquals(hash, context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
        assertTrue(store.verifyInstalled())
    }

    @Test fun cancellationAfterDigestButBeforePromotionStillKeepsOnlyThePartial() {
        lateinit var store: RecreateModelStore
        store = makeStore(openHashInput = { file ->
            val input = FileInputStream(file)
            object : InputStream() {
                override fun read(): Int = input.read()
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int = input.read(buffer, offset, length)
                override fun close() { input.close(); store.cancel() }
            }
        })

        store.download()

        assertEquals("paused", store.snapshot().getString("state"))
        assertArrayEquals(bytes, File(context.filesDir, "recreate-model/${asset.name}.part").readBytes())
        assertFalse(File(context.filesDir, "recreate-model/${asset.name}").exists())
        assertNull(context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
    }

    @Test fun installedVerificationIgnoresAStaleDownloadCancellationFlag() {
        val store = makeStore()
        store.download()
        store.cancel()

        assertTrue(store.verifyInstalled())
        assertEquals("ready", store.snapshot().getString("state"))
    }

    @Test fun installedVerificationRejectsMissingWrongLengthAndUnmarkedFiles() {
        val model = File(context.filesDir, "recreate-model/${asset.name}").apply { parentFile!!.mkdirs() }
        val preferences = context.getSharedPreferences("recreate-model", 0)
        val store = makeStore()

        assertFalse(store.verifyInstalled())
        assertEquals("MODEL_INTEGRITY_FAILED", store.snapshot().getString("error"))

        model.writeBytes(bytes.copyOf(bytes.size - 1))
        preferences.edit().putString(asset.name, hash).commit()
        assertFalse(store.verifyInstalled())
        assertFalse(preferences.contains(asset.name))

        model.writeBytes(bytes)
        assertFalse(store.verifyInstalled())
        assertFalse(preferences.contains(asset.name))

        preferences.edit().putString(asset.name, hash).commit()
        assertTrue(store.verifyInstalled())
        assertTrue(preferences.contains(asset.name))
    }

    @Test fun installedVerificationDetectsSameLengthCorruptionDespiteAnExistingHashMarker() {
        val corrupt = bytes.copyOf().apply { this[0] = (this[0].toInt() xor 1).toByte() }
        val target = File(context.filesDir, "recreate-model/${asset.name}").apply {
            parentFile!!.mkdirs()
            writeBytes(corrupt)
        }
        val preferences = context.getSharedPreferences("recreate-model", 0)
        preferences.edit().putString(asset.name, hash).commit()
        val store = makeStore()

        assertFalse(store.verifyInstalled())

        assertFalse(preferences.contains(asset.name))
        assertEquals("MODEL_INTEGRITY_FAILED", store.snapshot().getString("error"))
        assertTrue(target.exists())
        assertArrayEquals(corrupt, target.readBytes())
    }

    @Test fun oversizedPartialIsDiscardedAndTheNextRequestStartsAtZero() {
        val part = File(context.filesDir, "recreate-model/${asset.name}.part").apply { parentFile!!.mkdirs(); writeBytes(bytes + byteArrayOf(99)) }
        lateinit var connection: FakeConnection
        val store = makeStore(openConnection = { url -> FakeConnection(200, bytes).also { connection = it } })

        store.download()

        assertNull(connection.getRequestProperty("Range"))
        assertEquals("ready", store.snapshot().getString("state"))
        assertArrayEquals(bytes, File(part.parentFile, asset.name).readBytes())
    }

    @Test fun nonPartialResponseRestartsAResumedRequestWithoutAppendingOldBytes() {
        val part = File(context.filesDir, "recreate-model/${asset.name}.part").apply { parentFile!!.mkdirs(); writeBytes(bytes.copyOfRange(0, 4)) }
        lateinit var connection: FakeConnection
        val store = makeStore(openConnection = { url -> FakeConnection(200, bytes).also { connection = it } })

        store.download()

        assertEquals("bytes=4-", connection.getRequestProperty("Range"))
        assertEquals("ready", store.snapshot().getString("state"))
        assertArrayEquals(bytes, File(part.parentFile, asset.name).readBytes())
    }

    @Test fun validPartialResponseAppendsOnlyTheRequestedSuffixBeforePromotion() {
        val offset = 4
        val part = File(context.filesDir, "recreate-model/${asset.name}.part")
            .apply { parentFile!!.mkdirs(); writeBytes(bytes.copyOfRange(0, offset)) }
        lateinit var connection: FakeConnection
        val store = makeStore(openConnection = { url ->
            connection = FakeConnection(
                206,
                bytes.copyOfRange(offset, bytes.size),
                mapOf("Content-Range" to "bytes $offset-${bytes.size - 1}/${bytes.size}"),
            )
            connection
        })

        store.download()

        assertEquals("bytes=$offset-", connection.getRequestProperty("Range"))
        assertEquals("ready", store.snapshot().getString("state"))
        assertArrayEquals(bytes, File(part.parentFile, asset.name).readBytes())
        assertFalse(part.exists())
    }

    @Test fun mismatchedCompletePartialIsDiscardedAndDownloadedAgainFromZero() {
        val wrong = bytes.copyOf().apply { this[0] = (this[0].toInt() xor 1).toByte() }
        val part = File(context.filesDir, "recreate-model/${asset.name}.part").apply { parentFile!!.mkdirs(); writeBytes(wrong) }
        lateinit var connection: FakeConnection
        val store = makeStore(openConnection = { url -> FakeConnection(200, bytes).also { connection = it } })

        store.download()

        assertNull(connection.getRequestProperty("Range"))
        assertEquals("ready", store.snapshot().getString("state"))
        assertArrayEquals(bytes, File(part.parentFile, asset.name).readBytes())
    }

    @Test fun completeVerifiedPartialIsPromotedWithoutASecondNetworkRequest() {
        val part = File(context.filesDir, "recreate-model/${asset.name}.part").apply {
            parentFile!!.mkdirs()
            writeBytes(bytes)
        }
        var requested = false
        val store = makeStore(openConnection = { requested = true; error("complete verified part must be promoted locally") })

        store.download()

        assertFalse(requested)
        assertEquals("ready", store.snapshot().getString("state"))
        assertFalse(part.exists())
        assertArrayEquals(bytes, File(part.parentFile, asset.name).readBytes())
        assertEquals(hash, context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
    }

    @Test fun completePartialCancelledBeforeItsVerificationRemainsAvailableForRetry() {
        val partial = File(context.filesDir, "recreate-model/${asset.name}.part").apply {
            parentFile!!.mkdirs()
            writeBytes(bytes)
        }
        var requested = false
        val store = makeStore(openConnection = { requested = true; error("canceled complete part must not use network") })

        assertTrue(store.reserveDownload())
        store.cancel()
        store.downloadReserved()

        assertFalse(requested)
        assertEquals("paused", store.snapshot().getString("state"))
        assertEquals(bytes.size.toLong(), store.partialBytes())
        assertEquals(0L, store.modelBytes())
        assertTrue(partial.exists())
        assertFalse(File(partial.parentFile, asset.name).exists())
    }

    @Test fun lateCancellationAtFinalVerificationStillReportsTheFullyInstalledModelAsReady() {
        lateinit var store: RecreateModelStore
        var requested = false
        store = RecreateModelStore(
            context = context,
            changed = { state -> if (state.optString("state") == "verifying") store.cancel() },
            assets = listOf(asset),
            openConnection = { requested = true; FakeConnection(200, bytes) },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        store.download()

        assertTrue(requested)
        assertEquals("ready", store.snapshot().getString("state"))
        assertEquals("", store.snapshot().getString("error"))
        assertArrayEquals(bytes, File(context.filesDir, "recreate-model/${asset.name}").readBytes())
        assertEquals(hash, context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
        assertTrue(store.verifyInstalled())
    }

    @Test fun serverErrorsAndShortResponsesNeverPublishAReadyModel() {
        val failedStatus = makeStore(openConnection = { FakeConnection(503, bytes) })
        failedStatus.download()
        assertEquals("MODEL_DOWNLOAD_FAILED", failedStatus.snapshot().getString("error"))
        assertFalse(failedStatus.isReady())

        context.filesDir.resolve("recreate-model").deleteRecursively()
        context.getSharedPreferences("recreate-model", 0).edit().clear().commit()
        val short = makeStore(openConnection = { FakeConnection(200, bytes.copyOfRange(0, bytes.size - 1)) })
        short.download()
        assertEquals("MODEL_DOWNLOAD_FAILED", short.snapshot().getString("error"))
        assertFalse(short.isReady())
        assertFalse(File(context.filesDir, "recreate-model/${asset.name}").exists())
    }

    @Test fun partialResponseWithoutContentRangeIsRejectedAndDiscarded() {
        val part = File(context.filesDir, "recreate-model/${asset.name}.part").apply { parentFile!!.mkdirs(); writeBytes(bytes.copyOfRange(0, 4)) }
        val store = makeStore(openConnection = { FakeConnection(206, bytes.copyOfRange(4, bytes.size)) })

        store.download()

        assertEquals("MODEL_DOWNLOAD_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertFalse(part.exists())
    }

    @Test fun invalidContentRangeOffsetsAndTotalsAreAllRejected() {
        val ranges = listOf(
            0 to "bytes 0-${bytes.size - 1}/${bytes.size}",
            4 to "bytes 3-${bytes.size - 1}/${bytes.size}",
            4 to "bytes 4-${bytes.size - 1}/unknown",
            4 to "bytes 4-${bytes.size - 1}/${bytes.size + 1}",
        )
        ranges.forEach { (offset, range) ->
            context.filesDir.resolve("recreate-model").deleteRecursively()
            context.getSharedPreferences("recreate-model", 0).edit().clear().commit()
            val part = File(context.filesDir, "recreate-model/${asset.name}.part")
            if (offset > 0) part.apply { parentFile!!.mkdirs(); writeBytes(bytes.copyOfRange(0, offset)) }
            val store = makeStore(openConnection = { FakeConnection(206, bytes.copyOfRange(offset.coerceAtMost(bytes.size), bytes.size), mapOf("Content-Range" to range)) })

            store.download()

            assertEquals("MODEL_DOWNLOAD_FAILED", store.snapshot().getString("error"))
            assertFalse(store.isReady())
            assertFalse(part.exists())
        }
    }

    @Test fun oversizedResponseIsRejectedBeforeItCanExceedTheManifestSize() {
        val store = makeStore(openConnection = { FakeConnection(200, bytes + byteArrayOf(99)) })

        store.download()

        assertEquals("MODEL_INTEGRITY_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertFalse(File(context.filesDir, "recreate-model/${asset.name}").exists())
    }

    @Test fun sameLengthResponseWithWrongDigestIsDiscardedBeforeInstallation() {
        val corrupted = bytes.copyOf().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }
        val part = File(context.filesDir, "recreate-model/${asset.name}.part")
        val store = makeStore(openConnection = { FakeConnection(200, corrupted) })

        store.download()

        assertEquals("MODEL_INTEGRITY_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertFalse(part.exists())
        assertFalse(File(part.parentFile, asset.name).exists())
        assertNull(context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
    }

    @Test fun verifyingCallbackDetectsAFileThatChangesAfterPromotion() {
        var corrupted = false
        val store = RecreateModelStore(
            context = context,
            changed = { state ->
                if (state.optString("state") == "verifying" && !corrupted) {
                    corrupted = true
                    File(context.filesDir, "recreate-model/${asset.name}").writeBytes(byteArrayOf(1))
                }
            },
            assets = listOf(asset),
            openConnection = { FakeConnection(200, bytes) },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        store.download()

        assertTrue(corrupted)
        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_INTEGRITY_FAILED", store.snapshot().getString("error"))
    }

    @Test fun modelCannotBeDeletedWhileTheDownloadWorkerIsVerifyingItsFinalFiles() {
        lateinit var store: RecreateModelStore
        var deleteError: String? = null
        store = RecreateModelStore(
            context = context,
            changed = { state ->
                if (state.optString("state") == "verifying") {
                    try { store.delete() } catch (failure: AppFailure) { deleteError = failure.code }
                }
            },
            assets = listOf(asset),
            openConnection = { FakeConnection(200, bytes) },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        store.download()

        assertEquals("BUSY", deleteError)
        assertEquals("ready", store.snapshot().getString("state"))
        assertTrue(store.verifyInstalled())
    }

    @Test fun listenerFailureDoesNotAbortAnIntegrityCheckedDownload() {
        val store = RecreateModelStore(
            context = context,
            changed = { throw IllegalStateException("listener failure") },
            assets = listOf(asset),
            openConnection = { FakeConnection(200, bytes) },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        store.download()

        assertEquals("ready", store.snapshot().getString("state"))
        assertTrue(store.verifyInstalled())
    }

    @Test fun failedHashMarkerPersistenceNeverReportsAReadyDownload() {
        val failingContext = object : ContextWrapper(context) {
            override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
                val delegate = super.getSharedPreferences(name, mode)
                if (name != "recreate-model") return delegate
                return object : SharedPreferences by delegate {
                    override fun edit(): SharedPreferences.Editor = rejectingPreferencesEditor()
                }
            }
        }
        val store = RecreateModelStore(
            context = failingContext,
            changed = {},
            assets = listOf(asset),
            openConnection = { FakeConnection(200, bytes) },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        store.download()

        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("LOW_STORAGE", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertArrayEquals(bytes, File(context.filesDir, "recreate-model/${asset.name}").readBytes())
        assertNull(context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
    }

    @Test fun deletionFailurePreservesDiagnosticStateWhenAnAssetPathIsNotRemovable() {
        val blocked = File(context.filesDir, "recreate-model/${asset.name}").apply {
            mkdirs()
            resolve("keep.bin").writeText("preserve")
        }
        val store = makeStore()

        val error = try {
            store.delete()
            fail("A non-empty asset directory cannot be deleted as a model file")
            null
        } catch (failure: AppFailure) { failure }

        assertEquals("MODEL_DELETE_FAILED", error?.code)
        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_DELETE_FAILED", store.snapshot().getString("error"))
        assertTrue(blocked.resolve("keep.bin").exists())
    }

    @Test fun failedPreferenceCommitAfterDeletionIsReportedInsteadOfClaimingSuccess() {
        val model = File(context.filesDir, "recreate-model/${asset.name}").apply {
            parentFile!!.mkdirs()
            writeBytes(bytes)
        }
        val preferences = context.getSharedPreferences("recreate-model", 0)
        preferences.edit().putString(asset.name, hash).commit()
        val failingContext = object : ContextWrapper(context) {
            override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
                val delegate = super.getSharedPreferences(name, mode)
                if (name != "recreate-model") return delegate
                return object : SharedPreferences by delegate {
                    override fun edit(): SharedPreferences.Editor = rejectingPreferencesEditor()
                }
            }
        }
        val store = RecreateModelStore(
            context = failingContext,
            changed = {},
            assets = listOf(asset),
            openConnection = { error("delete must not access network") },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        val error = try {
            store.delete()
            fail("A failed deletion-marker commit must be surfaced")
            null
        } catch (failure: AppFailure) { failure }

        assertEquals("MODEL_DELETE_FAILED", error?.code)
        assertFalse(model.exists())
        assertEquals(hash, preferences.getString(asset.name, null))
        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_DELETE_FAILED", store.snapshot().getString("error"))
    }

    @Test fun nonEmptyInstalledTargetCannotBeSilentlyReplacedDuringPromotion() {
        val target = File(context.filesDir, "recreate-model/${asset.name}").apply {
            mkdirs()
            resolve("held").writeText("preserve existing data")
        }
        val store = makeStore()

        store.download()

        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("LOW_STORAGE", store.snapshot().getString("error"))
        assertTrue(target.resolve("held").exists())
        assertFalse(context.getSharedPreferences("recreate-model", 0).contains(asset.name))
    }

    @Test fun downloadPublishesRealProgressAtTheEightMebibyteBoundary() {
        val largeBytes = ByteArray(8 * 1024 * 1024 + 1) { (it % 251).toByte() }
        val largeHash = MessageDigest.getInstance("SHA-256").digest(largeBytes).joinToString("") { "%02x".format(it) }
        val largeAsset = RecreateModelStore.Asset("progress.gguf", "https://models.example.invalid/progress.gguf", largeBytes.size.toLong(), largeHash)
        val progressSnapshots = mutableListOf<Long>()
        val store = RecreateModelStore(
            context = context,
            changed = { state -> if (state.optString("state") == "downloading") progressSnapshots.add(state.optLong("downloadedBytes")) },
            assets = listOf(largeAsset),
            openConnection = { FakeConnection(200, largeBytes) },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        store.download()

        assertTrue(progressSnapshots.any { it >= 8L * 1024 * 1024 })
        assertEquals("ready", store.snapshot().getString("state"))
        assertEquals(largeBytes.size.toLong(), store.modelBytes())
    }

    @Test fun workerAndFailureCallbacksAreNoOpsWithoutAReservation() {
        var requested = false
        val store = makeStore(openConnection = { requested = true; error("no reservation means no network") })

        store.downloadReserved()
        store.failReserved("SERVICE_START_FAILED")

        assertFalse(requested)
        assertEquals("absent", store.snapshot().getString("state"))
        assertEquals("", store.snapshot().getString("error"))
    }

    @Test fun cancelledReservationDoesNotStartNetworkWhenForegroundDispatchArrivesLate() {
        var requested = false
        val store = makeStore(openConnection = { requested = true; error("cancelled transfer must not connect") })

        assertTrue(store.reserveDownload())
        store.cancel()
        store.downloadReserved()

        assertFalse(requested)
        assertFalse(store.isDownloading())
        assertEquals("paused", store.snapshot().getString("state"))
        assertEquals("", store.snapshot().getString("error"))
    }

    @Test fun downloadConvenienceMethodDoesNotStartASecondActiveTransfer() {
        var requests = 0
        val store = makeStore(openConnection = { requests++; error("active transfer must remain the only one") })

        assertTrue(store.reserveDownload())
        store.download()

        assertEquals(0, requests)
        assertTrue(store.isDownloading())
        assertEquals("downloading", store.snapshot().getString("state"))
        store.failReserved("SERVICE_START_FAILED")
    }

    @Test fun freshStoreRestoresAnInterruptedPartialAsPausedWithAccurateBytes() {
        val partial = File(context.filesDir, "recreate-model/${asset.name}.part").apply {
            parentFile!!.mkdirs()
            writeBytes(bytes.copyOfRange(0, 5))
        }
        val restored = makeStore()

        val state = restored.snapshot()

        assertEquals("paused", state.getString("state"))
        assertEquals(5L, state.getLong("downloadedBytes"))
        assertEquals(0L, state.getLong("installedBytes"))
        assertEquals(asset.size, state.getLong("totalBytes"))
        assertFalse(restored.isDownloading())
        assertEquals(5L, partial.length())
    }

    @Test fun concurrentDownloadReservationIsRejectedUntilTheFirstReservationSettles() {
        val store = makeStore()

        assertTrue(store.reserveDownload())
        assertFalse(store.reserveDownload())
        store.failReserved("SERVICE_START_FAILED")

        assertFalse(store.isDownloading())
        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("SERVICE_START_FAILED", store.snapshot().getString("error"))
        assertTrue(store.reserveDownload())
        store.failReserved("SERVICE_START_FAILED")
    }

    @Test fun insufficientSpaceIsReportedBeforeOpeningThePinnedModelUrl() {
        var requested = false
        val store = RecreateModelStore(
            context = context,
            changed = {},
            assets = listOf(asset),
            openConnection = { requested = true; error("storage preflight must happen before network") },
            availableBytes = { 0L },
        )

        store.download()

        assertFalse(requested)
        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("LOW_STORAGE", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertEquals(0L, store.modelBytes())
        assertEquals(0L, store.partialBytes())
    }

    @Test fun connectionConstructionFailureMapsToSafeDownloadCodeAndReleasesReservation() {
        val store = makeStore(openConnection = { throw SecurityException("private transport detail") })

        store.download()

        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_DOWNLOAD_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isDownloading())
        assertFalse(store.isReady())
        assertEquals(0L, store.modelBytes())
    }

    @Test fun diskFullAndQuotaWriteErrnosMapToLowStorageWhileGenericWriteIoStaysDownloadFailure() {
        val prefix = bytes.copyOfRange(0, 5)
        val remainder = bytes.copyOfRange(prefix.size, bytes.size)
        val contentRange = "bytes ${prefix.size}-${bytes.lastIndex}/${bytes.size}"

        for (errno in listOf(android.system.OsConstants.ENOSPC, android.system.OsConstants.EDQUOT)) {
            val part = File(context.filesDir, "recreate-model/${asset.name}.part").apply {
                parentFile!!.mkdirs()
                writeBytes(prefix)
            }
            val connection = FakeConnection(206, remainder, mapOf("Content-Range" to contentRange))
            val store = makeStore(
                openConnection = { connection },
                openOutput = { file, append ->
                    assertTrue("resumed transfer must append to the existing partial", append)
                    object : FileOutputStream(file, append) {
                        override fun write(buffer: ByteArray, offset: Int, length: Int) {
                            throw java.io.IOException("private write details", java.io.IOException("wrapped", android.system.ErrnoException("write", errno)))
                        }
                    }
                },
            )

            store.download()

            assertEquals("failed", store.snapshot().getString("state"))
            assertEquals("LOW_STORAGE", store.snapshot().getString("error"))
            assertArrayEquals(prefix, part.readBytes())
            assertFalse(store.isReady())
            connection.disconnect()
            part.delete()
        }

        val part = File(context.filesDir, "recreate-model/${asset.name}.part").apply {
            parentFile!!.mkdirs()
            writeBytes(prefix)
        }
        val connection = FakeConnection(206, remainder, mapOf("Content-Range" to contentRange))
        val genericIo = makeStore(
            openConnection = { connection },
            openOutput = { file, append ->
                object : FileOutputStream(file, append) {
                    override fun write(buffer: ByteArray, offset: Int, length: Int) {
                        throw java.io.IOException("private write details")
                    }
                }
            },
        )

        genericIo.download()

        assertEquals("failed", genericIo.snapshot().getString("state"))
        assertEquals("MODEL_DOWNLOAD_FAILED", genericIo.snapshot().getString("error"))
        assertArrayEquals(prefix, part.readBytes())
        assertFalse(genericIo.snapshot().toString().contains("private write details"))
    }

    @Test fun cyclicGenericWriteCauseChainTerminatesAndKeepsTheSafeDownloadError() {
        val outer = java.io.IOException("private outer detail")
        val inner = java.io.IOException("private inner detail")
        outer.initCause(inner)
        inner.initCause(outer)
        val store = makeStore(
            openOutput = { file, append ->
                object : FileOutputStream(file, append) {
                    override fun write(buffer: ByteArray, offset: Int, length: Int) {
                        throw outer
                    }
                }
            },
        )

        store.download()

        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_DOWNLOAD_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertFalse(store.snapshot().toString().contains("private"))
    }

    @Test fun storageErrnoDuringOutputOpenMapsToLowStorageAndDisconnectsTheResponse() {
        val connection = FakeConnection(200, bytes)
        val store = makeStore(
            openConnection = { connection },
            openOutput = { _, _ ->
                throw java.io.IOException(
                    "private open detail",
                    android.system.ErrnoException("open", android.system.OsConstants.ENOSPC),
                )
            },
        )

        store.download()

        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("LOW_STORAGE", store.snapshot().getString("error"))
        assertEquals(1, connection.disconnectCount)
        assertEquals(0L, store.modelBytes())
        assertFalse(store.snapshot().toString().contains("private"))
    }

    @Test fun unrelatedFilesystemErrnoRemainsADownloadFailure() {
        val store = makeStore(
            openOutput = { file, append ->
                object : FileOutputStream(file, append) {
                    override fun write(buffer: ByteArray, offset: Int, length: Int) {
                        throw java.io.IOException(
                            "private write detail",
                            android.system.ErrnoException("write", android.system.OsConstants.EIO),
                        )
                    }
                }
            },
        )

        store.download()

        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_DOWNLOAD_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
        assertFalse(store.snapshot().toString().contains("private"))
    }

    @Test fun flushFailureKeepsPartialBytesAndNeverMarksAnUnsyncedAssetInstalled() {
        val store = makeStore(
            openOutput = { file, append ->
                object : FileOutputStream(file, append) {
                    override fun flush() { throw java.io.IOException("private flush detail") }
                }
            },
        )

        store.download()

        assertEquals("failed", store.snapshot().getString("state"))
        assertEquals("MODEL_DOWNLOAD_FAILED", store.snapshot().getString("error"))
        assertEquals(bytes.size.toLong(), store.partialBytes())
        assertEquals(0L, store.modelBytes())
        assertFalse(store.isReady())
        assertFalse(store.snapshot().toString().contains("private"))
    }

    @Test fun responseCodeFailureDisconnectsTheActiveConnectionAndMapsToSafeError() {
        val connection = FakeConnection(200, bytes, responseFailure = java.io.IOException("private server detail"))
        val store = makeStore(openConnection = { connection })

        store.download()

        assertEquals(1, connection.disconnectCount)
        assertFalse(store.isDownloading())
        assertEquals("MODEL_DOWNLOAD_FAILED", store.snapshot().getString("error"))
        assertFalse(store.isReady())
    }

    @Test fun successfulModelCanBeReusedWithoutHashingOrOpeningANetworkRequestAgain() {
        val store = makeStore()
        store.download()

        store.download()

        assertEquals("ready", store.snapshot().getString("state"))
        assertEquals(hash, context.getSharedPreferences("recreate-model", 0).getString(asset.name, null))
    }

    @Test fun bundleResumeReusesAnAlreadyVerifiedAssetAndFetchesOnlyTheMissingCompanion() {
        val installed = File(context.filesDir, "recreate-model/${asset.name}").apply {
            parentFile!!.mkdirs()
            writeBytes(bytes)
        }
        val preferences = context.getSharedPreferences("recreate-model", 0)
        preferences.edit().putString(asset.name, hash).commit()
        val companion = RecreateModelStore.Asset(
            "edge-lora.safetensors", "https://models.example.invalid/edge-lora.safetensors", bytes.size.toLong(), hash,
        )
        val requested = mutableListOf<String>()
        val store = RecreateModelStore(
            context = context,
            changed = {},
            assets = listOf(asset, companion),
            openConnection = { url -> requested.add(url.toString()); FakeConnection(200, bytes) },
            availableBytes = { 2L * 1024 * 1024 * 1024 },
        )

        store.download()

        assertEquals(listOf(companion.url), requested)
        assertEquals("ready", store.snapshot().getString("state"))
        assertEquals(2L * bytes.size, store.snapshot().getLong("installedBytes"))
        assertArrayEquals(bytes, installed.readBytes())
        assertArrayEquals(bytes, File(installed.parentFile, companion.name).readBytes())
        assertEquals(hash, preferences.getString(asset.name, null))
        assertEquals(hash, preferences.getString(companion.name, null))
    }

    @Test fun convenienceStoreExposesThePinnedModelPathsWithoutStartingNetworkIo() {
        val store = RecreateModelStore(context, {})

        assertEquals("sd15-q4.gguf", store.diffusionModel().name)
        assertEquals("lcm-lora.safetensors", store.loraModel().name)
        assertFalse(store.diffusionModel().exists())
        assertFalse(store.loraModel().exists())
        val opener = RecreateModelStore::class.java.getDeclaredField("openConnection").apply { isAccessible = true }
            .get(store) as (URL) -> HttpURLConnection
        val connection = opener(URL("https://models.example.invalid/no-network"))
        assertTrue(connection is HttpsURLConnection)
        connection.disconnect()
    }

    private fun makeStore(
        openConnection: (URL) -> HttpURLConnection = { FakeConnection(200, bytes) },
        openOutput: (File, Boolean) -> FileOutputStream = { file, append -> FileOutputStream(file, append) },
        openHashInput: (File) -> InputStream = ::FileInputStream,
    ) = RecreateModelStore(
        context = context,
        changed = {},
        assets = listOf(asset),
        openConnection = openConnection,
        availableBytes = { 2L * 1024 * 1024 * 1024 },
        openOutput = openOutput,
        openHashInput = openHashInput,
    )

    private fun blockingStream(file: File, entered: CountDownLatch, release: CountDownLatch): InputStream {
        val input = FileInputStream(file)
        return object : InputStream() {
            private var blocked = false
            override fun read(): Int = input.read()
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                if (!blocked) {
                    entered.countDown()
                    check(release.await(3, TimeUnit.SECONDS))
                    blocked = true
                }
                return input.read(buffer, offset, length)
            }
            override fun close() = input.close()
        }
    }

    private class FakeConnection(
        status: Int,
        private val body: ByteArray,
        private val headers: Map<String, String> = emptyMap(),
        private val responseFailure: java.io.IOException? = null,
    ) : HttpURLConnection(URL("https://models.example.invalid/edge.gguf")) {
        private val responseStatus = status
        var disconnectCount = 0
        override fun connect() { connected = true }
        override fun disconnect() { connected = false; disconnectCount++ }
        override fun usingProxy() = false
        override fun getResponseCode(): Int { responseFailure?.let { throw it }; return responseStatus }
        override fun getInputStream() = ByteArrayInputStream(body)
        override fun getHeaderField(name: String): String? = headers[name]
    }
}
