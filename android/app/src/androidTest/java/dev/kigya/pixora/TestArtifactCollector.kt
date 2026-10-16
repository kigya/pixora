package dev.kigya.pixora

import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Android 11 hides app-specific external files from adb. Export only test captures. */
@RunWith(AndroidJUnit4::class)
class TestArtifactCollector {
    @Test fun copyCoverageFilesToDownloadUsingShellIdentity() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val names=(InstrumentationRegistry.getArguments().getString("files") ?: "native-06.ec").split(",")
        for(name in names) {
            require(name.matches(Regex("[a-zA-Z0-9-]+\\.ec")))
            val source=File(instrumentation.targetContext.getExternalFilesDir(null),name);assertTrue(source.exists())
            val streams=instrumentation.uiAutomation.executeShellCommandRw("sh -c cat>/sdcard/Download/$name")
            ParcelFileDescriptor.AutoCloseOutputStream(streams[1]).use{output->source.inputStream().use{it.copyTo(output)}}
            ParcelFileDescriptor.AutoCloseInputStream(streams[0]).use{assertTrue(String(it.readBytes()).isEmpty())}
        }
    }
    @Test fun copyUiCapturesToDownloadUsingShellIdentity() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val names=InstrumentationRegistry.getArguments().getString("files")!!.split(",")
        for(name in names) {
            require(name.matches(Regex("(?:validation-(?:03|05|06)-[a-zA-Z0-9-]+|06-speed-(?:quality|fast))\\.png")))
            val source=File(instrumentation.targetContext.getExternalFilesDir(null),name);assertTrue(source.exists())
            val streams=instrumentation.uiAutomation.executeShellCommandRw("sh -c cat>/sdcard/Download/$name")
            ParcelFileDescriptor.AutoCloseOutputStream(streams[1]).use{output->source.inputStream().use{it.copyTo(output)}}
            ParcelFileDescriptor.AutoCloseInputStream(streams[0]).use{assertTrue(String(it.readBytes()).isEmpty())}
        }
    }
    @Test fun copyReadmeCapturesToDownloadUsingShellIdentity() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        for(theme in listOf("light","dark")) {
            val source=File(instrumentation.targetContext.getExternalFilesDir(null),"validation-03-$theme-ru-home.png")
            assertTrue(source.exists())
            val streams=instrumentation.uiAutomation.executeShellCommandRw("sh -c cat>/sdcard/Download/Upselora-test-$theme.png")
            ParcelFileDescriptor.AutoCloseOutputStream(streams[1]).use{output->source.inputStream().use{it.copyTo(output)}}
            ParcelFileDescriptor.AutoCloseInputStream(streams[0]).use{assertTrue(String(it.readBytes()).isEmpty())}
            val stat=instrumentation.uiAutomation.executeShellCommand("stat -c %s /sdcard/Download/Upselora-test-$theme.png")
            ParcelFileDescriptor.AutoCloseInputStream(stat).use{org.junit.Assert.assertEquals(source.length(),String(it.readBytes()).trim().toLong())}
        }
    }
}
