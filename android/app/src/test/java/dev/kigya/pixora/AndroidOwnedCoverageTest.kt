package dev.kigya.pixora

import android.app.Application
import android.graphics.Bitmap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.ReactHost
import com.facebook.react.bridge.BaseJavaModule
import com.facebook.react.bridge.CxxCallbackImpl
import com.facebook.react.ReactPackage
import com.facebook.soloader.nativeloader.NativeLoader
import com.facebook.soloader.nativeloader.SystemDelegate
import expo.modules.ExpoReactHostFactory
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.Shadows
import java.util.concurrent.atomic.AtomicReference

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class AndroidOwnedCoverageTest {
    private var module: UpscaleModule? = null

    @After fun disposeNativeModule() {
        val current = module ?: return
        current.invalidate()
        module = null
    }

    @Test fun onDeviceBackendForwardsRealBoundaryArgumentsWithoutClaimingInference() {
        assertTrue(OnDeviceBackend.gpuAvailable())
        val input = Bitmap.createBitmap(2, 3, Bitmap.Config.ARGB_8888)
        val output = Bitmap.createBitmap(8, 12, Bitmap.Config.ARGB_8888)
        val callback = RecordingCallback()
        try {
            val profileResult = OnDeviceBackend.processProfile(
                RuntimeEnvironment.getApplication(), input, output, true, 32,
                callback, "art", true,
            )
            assertEquals(2323, profileResult)
            assertEquals(listOf(2), callback.stages)
            assertEquals(listOf(2 to 32.0), callback.timings)
            assertEquals(listOf(1 to 1), callback.progress)

            callback.clear()
            val legacyResult = OnDeviceBackend.process(
                RuntimeEnvironment.getApplication(), input, output, false, 64,
                callback, true, true,
            )
            assertEquals(3645, legacyResult)
            assertEquals(listOf(1), callback.stages)
            assertEquals(listOf(1 to 64.0), callback.timings)
            assertEquals(listOf(1 to 0), callback.progress)

            NativeJobControl.reset()
            NativeJobControl.cancel()
            assertEquals("https://fixture.invalid/feedback", NativeEngine.feedbackEndpoint())
        } finally {
            input.recycle()
            output.recycle()
        }
    }

    @Test fun defaultBackendAdapterPassesFastFlagAndTestGpu() {
        val context = RuntimeEnvironment.getApplication()
        val input = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        val output = Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888)
        val observed = AtomicReference<Pair<Boolean, Boolean>>()
        val backend = object : ProcessingBackend {
            override fun gpuAvailable() = false
            override fun process(
                context: android.content.Context, input: Bitmap, output: Bitmap,
                gpu: Boolean, tile: Int, callback: ProgressCallback,
                fast: Boolean, testGPU: Boolean,
            ): Int {
                observed.set(fast to testGPU)
                return 19
            }
        }
        try {
            assertEquals(19, backend.processProfile(context, input, output, false, 16,
                RecordingCallback(), "fast", true))
            assertEquals(true to true, observed.get())
            backend.processProfile(context, input, output, false, 16,
                RecordingCallback(), "quality", false)
            assertEquals(false to false, observed.get())
        } finally {
            input.recycle()
            output.recycle()
        }
    }

    @Test fun packageRegistersOnlyItsNativeModuleAndHostAddsPackage() {
        val context = com.facebook.react.bridge.BridgeReactContext(RuntimeEnvironment.getApplication())
        val packageUnderTest = UpscalePackage()
        assertNull(packageUnderTest.getModule("unrelated", context))
        val created = packageUnderTest.getModule(UpscaleModule.NAME, context)
        assertTrue(created is UpscaleModule)
        module = created as UpscaleModule
        val infos = packageUnderTest.getReactModuleInfoProvider().getReactModuleInfos()
        assertTrue(infos.containsKey(UpscaleModule.NAME))

        val application = MainApplication()
        org.robolectric.util.ReflectionHelpers.callInstanceMethod<Void>(application, "attach",
            org.robolectric.util.ReflectionHelpers.ClassParameter.from(
                android.content.Context::class.java, RuntimeEnvironment.getApplication(),
            ))
        val host = mock(ReactHost::class.java)
        val registeredPackages = AtomicReference<List<ReactPackage>>()
        val hostFactory = org.mockito.stubbing.Answer<Any?> { invocation ->
            // Kotlin calls this @JvmStatic factory through its synthetic $default bridge.
            // Capture the package-list argument without depending on that compiler-generated
            // method name, then return the host so React Native does not initialize a runtime.
            @Suppress("UNCHECKED_CAST")
            invocation.arguments.filterIsInstance<List<*>>().firstOrNull()?.let {
                registeredPackages.set(it as List<ReactPackage>)
            }
            host
        }
        mockStatic(ExpoReactHostFactory::class.java, hostFactory).use {
            assertSame(host, application.reactHost)
            assertNotNull(registeredPackages.get())
            assertTrue(registeredPackages.get().any { it is UpscalePackage })
        }
    }

    @Test fun activeReactLifecycleCallbacksReachBoundNativeEmitter() {
        NativeLoader.initIfUninitialized(SystemDelegate())
        val context = ModuleUnitTest.BoundaryContext(RuntimeEnvironment.getApplication()).apply { active = true }
        val current = UpscaleModule(context)
        module = current
        val emitter = mock(CxxCallbackImpl::class.java)
        BaseJavaModule::class.java.getDeclaredField("mEventEmitterCallback")
            .apply { isAccessible = true }.set(current, emitter)

        mockStatic(Arguments::class.java).use { values ->
            values.`when`<com.facebook.react.bridge.WritableMap> { Arguments.createMap() }
                .thenAnswer { JavaOnlyMap() }
            values.`when`<com.facebook.react.bridge.WritableArray> { Arguments.createArray() }
                .thenAnswer { JavaOnlyArray() }
            SessionStore.update(false) { it.put("state", "READY") }
            ProfileAvailability.listeners.forEach { it(org.json.JSONObject().put("standard", true)) }
            WindowLayout.listeners.forEach { it(org.json.JSONObject().put("width", 320)) }
            Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
        }

        val calls = mockingDetails(emitter).invocations.count { it.method.name == "invoke" }
        assertEquals("session, availability, and window changes each emit", 3, calls)
    }

    private class RecordingCallback : ProgressCallback {
        val stages = mutableListOf<Int>()
        val timings = mutableListOf<Pair<Int, Double>>()
        val progress = mutableListOf<Pair<Int, Int>>()
        override fun onStage(stage: Int) { stages += stage }
        override fun onTiming(stage: Int, milliseconds: Double) { timings += stage to milliseconds }
        override fun onProgress(done: Int, total: Int): Boolean {
            progress += done to total
            return true
        }
        fun clear() { stages.clear(); timings.clear(); progress.clear() }
    }
}
