package dev.kigya.pixora

import android.app.Application
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.Rule
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class StorageUsageTest {
    @get:Rule val folder = TemporaryFolder()

    @Test fun scanAssignsPersistentAndTemporaryFilesToDisjointBuckets() {
        val data = folder.newFolder("data")
        val cache = File(data, "cache").apply { mkdirs() }
        val sessions = File(data, "files/sessions").apply { mkdirs() }
        val models = File(data, "files/recreate-model").apply { mkdirs() }
        val journal = File(data, "files/session.json")
        File(cache, "preview.bin").writeBytes(ByteArray(5))
        File(cache, "partial.part").writeBytes(ByteArray(3))
        File(sessions, "source.png").writeBytes(ByteArray(11))
        File(sessions, "result.partial").writeBytes(ByteArray(2))
        File(models, "model.gguf").writeBytes(ByteArray(13))
        File(models, "model.gguf.part").writeBytes(ByteArray(4))
        File(data, "files/incoming-preview").writeBytes(ByteArray(6))
        File(data, "files/shared_prefs/settings.xml").apply { parentFile!!.mkdirs(); writeBytes(ByteArray(17)) }
        journal.writeBytes(ByteArray(7))
        File(folder.root, "unmanaged.txt").writeBytes(ByteArray(19))

        val usage = StorageUsage.scan(data, cache, sessions, journal, models, 101L)

        assertEquals(5L, usage.cacheBytes)
        assertEquals(18L, usage.sessionBytes)
        assertEquals(15L, usage.temporaryBytes)
        assertEquals(13L, usage.recreateModelBytes)
        assertEquals(17L, usage.otherBytes)
        assertEquals(101L, usage.freeBytes)
        assertEquals(68L, usage.totalBytes)
        assertEquals(68L, usage.toJson().getLong("totalBytes"))
        assertEquals(17L, usage.toJson().getLong("otherBytes"))
    }

    @Test fun missingRootsAreZeroAndTotalSaturatesInsteadOfWrapping() {
        val missing = File(folder.root, "missing")
        val empty = StorageUsage.scan(missing, File(missing, "cache"), File(missing, "sessions"), File(missing, "session.json"), File(missing, "model"), 0L)
        assertEquals(0L, empty.totalBytes)
        val saturated = StorageUsageSnapshot(Long.MAX_VALUE, 1L, 0L, 0L, 0L, -1L)
        assertEquals(Long.MAX_VALUE, saturated.totalBytes)
        assertEquals(0L, saturated.freeBytes)
    }
}
