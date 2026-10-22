package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.mockito.Mockito.*
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class OnboardingAndResolutionTest {
    @Test fun newInstallAndUpgradeAreIndependentOfLanguageChoice() {
        val ctx=RuntimeEnvironment.getApplication();ctx.getSharedPreferences("settings",0).edit().clear().commit();ctx.getSharedPreferences("product-intro",0).edit().clear().commit();File(ctx.filesDir,"session.json").delete()
        val manager=mock(PackageManager::class.java);val info=PackageInfo().apply{firstInstallTime=1;lastUpdateTime=1}
        `when`(manager.getPackageInfo(ctx.packageName,0)).thenReturn(info)
        val wrapped=object:ContextWrapper(ctx){override fun getPackageManager()=manager}
        assertEquals(0,OnboardingStore.version(wrapped));
        ctx.getSharedPreferences("settings",0).edit().putString("language","en").commit()
        assertEquals(0,OnboardingStore.version(wrapped));OnboardingStore.complete(wrapped);assertEquals(1,OnboardingStore.version(wrapped))
        ctx.getSharedPreferences("product-intro",0).edit().clear().commit();assertEquals(1,OnboardingStore.version(wrapped))
        ctx.getSharedPreferences("settings",0).edit().clear().commit();ctx.getSharedPreferences("product-intro",0).edit().clear().commit();File(ctx.filesDir,"session.json").writeText("{}")
        assertEquals(1,OnboardingStore.version(wrapped));File(ctx.filesDir,"session.json").delete()
        ctx.getSharedPreferences("product-intro",0).edit().clear().commit();info.lastUpdateTime=2;assertEquals(1,OnboardingStore.version(wrapped))
    }
    @Test fun failedPreferenceWritesDoNotPretendCompletion() {
        val ctx=RuntimeEnvironment.getApplication();val prefs=mock(SharedPreferences::class.java)
        val editor=rejectingPreferencesEditor();`when`(prefs.edit()).thenReturn(editor)
        val wrapped=object:ContextWrapper(ctx){override fun getSharedPreferences(name:String,mode:Int):SharedPreferences=if(name=="product-intro")prefs else super.getSharedPreferences(name,mode)}
        for(action in listOf<()->Unit>({OnboardingStore.version(wrapped)},{OnboardingStore.complete(wrapped)})) {
            try{action();fail("disk error must be reported")}catch(e:IllegalStateException){assertEquals("SETTINGS_WRITE_FAILED",e.message)}
        }
    }
    @Test fun originalResultLimitsMatchThePublicContract() {
        assertTrue(OriginalProcessor.allowed(4000,4000,2));assertTrue(OriginalProcessor.allowed(2000,2000,4))
        for(v in listOf(Triple(0,1,2),Triple(1,0,2),Triple(1,1,3),Triple(8193,1,2),Triple(1,8193,2),Triple(4001,4000,2)))assertFalse(OriginalProcessor.allowed(v.first,v.second,v.third))
    }
}
