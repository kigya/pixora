package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.PowerManager
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class PixoraPresetsTest {
    private val ctx:Context get()=RuntimeEnvironment.getApplication()
    @Before fun setup(){ctx.getSharedPreferences("processing-estimates",0).edit().clear().commit();SessionStore.init(ctx);SessionStore.update{it.put("state","READY")}}
    @Test fun inputAndLegacyProfiles() {
        assertEquals(8,ProcessingProfiles.presets.size)
        assertEquals("realesrgan-x4plus",ProcessingProfiles.model("unknown"));assertEquals(0,ProcessingProfiles.nativeId("unknown"))
        assertEquals(512 to 384,ProcessingProfiles.inputSize(1024,768,"fast"))
        assertEquals(384 to 512,ProcessingProfiles.inputSize(768,1024,"fast"))
        assertEquals(8 to 8,ProcessingProfiles.inputSize(8,8,"fast"))
        assertEquals(1024 to 768,ProcessingProfiles.inputSize(1024,768,"quality"))
        for(mode in ProcessingProfiles.modes)assertTrue(ProcessingProfiles.nativeId(mode) in 0..4)
        assertEquals("standard",ProcessingProfiles.publicId("quality"));assertEquals("lite",ProcessingProfiles.publicId("fast"))
        assertEquals("art",ProcessingProfiles.publicId("illustration"));assertEquals("art",ProcessingProfiles.publicId("illustration-fast"));assertEquals("natural",ProcessingProfiles.publicId("natural"))
    }
    @Test fun finishersPreserveAlphaAndExposeDistinctResults() {
        val input=Bitmap.createBitmap(3,3,Bitmap.Config.ARGB_8888);input.eraseColor(Color.argb(128,80,100,120))
        for(profile in listOf("standard","details","sharp","balanced")) {
            val output=Bitmap.createBitmap(12,12,Bitmap.Config.ARGB_8888);output.eraseColor(Color.argb(128,80,100,120));output.setPixel(6,6,Color.argb(128,180,190,200));output.setPixel(0,0,Color.TRANSPARENT)
            val before=output.getPixel(6,6);PresetFinisher.apply(output,input,profile){false}
            assertEquals(128,Color.alpha(output.getPixel(6,6)))
            if(profile=="standard")assertEquals(before,output.getPixel(6,6)) else assertNotEquals(before,output.getPixel(6,6))
            output.recycle()
        }
        for(profile in listOf("balanced","sharp")) {
            val output=Bitmap.createBitmap(1,1,Bitmap.Config.ARGB_8888)
            try{PresetFinisher.apply(output,input,profile){true};fail("Cancellation must stop postprocessing")}catch(e:AppFailure){assertEquals("CANCELLED",e.code)}finally{output.recycle()}
        }
        val tiny=Bitmap.createBitmap(1,1,Bitmap.Config.ARGB_8888);tiny.eraseColor(Color.WHITE);PresetFinisher.apply(tiny,input,"details"){false};assertEquals(Color.WHITE,tiny.getPixel(0,0));tiny.recycle();input.recycle()
    }
    @Test fun estimatesLearnLocallyResetAndKeepOnlyTenSamples() {
        var clock=0L
        fun estimate(backend:String="GPU")=TimeEstimator(ctx,"test-model",backend,256,256,64,"standard","quality",4){clock}
        val first=estimate();first.begin();assertFalse(SessionStore.snapshot().has("remainingLowMs"))
        clock=100;first.tileDone(1);clock=200;first.tileDone(2)
        // Updates are bounded; two real tiles produce a positive range.
        var state=SessionStore.snapshot();assertTrue(state.getLong("remainingLowMs")>0);assertTrue(state.getLong("remainingHighMs")>=state.getLong("remainingLowMs"))
        first.tileDone(2);clock=1200;first.tileDone(3);clock=1300;first.tileDone(16)
        TimeEstimator(ctx,"zero","CPU",0,0,64,"standard","quality",4){clock}.remember(10.0,1);first.remember(0.0,10);for(i in 0..11)estimate().remember(1000.0,100,4000.0)
        clock=0;estimate().begin();state=SessionStore.snapshot();assertTrue(state.has("estimatedTotalHighMs"))
        val afterLoad=state.getLong("remainingHighMs");
        TimeEstimator(ctx,"test-model","GPU",256,256,64,"standard","quality",4,4L*1024*1024){clock}.begin()
        assertTrue(SessionStore.snapshot().getLong("remainingHighMs")>afterLoad)
        estimate().begin(true);assertTrue(SessionStore.snapshot().getLong("remainingHighMs")>afterLoad)
        assertEquals(10,org.json.JSONArray(ctx.getSharedPreferences("processing-estimates",0).all.values.first() as String).length())
        estimate("CPU").begin();assertFalse(SessionStore.snapshot().has("remainingLowMs"))
        ctx.getSharedPreferences("processing-estimates",0).edit().putString("${BuildConfig.VERSION_NAME}:test-model:GPU:64:standard:quality:4","broken").commit();estimate().begin();assertFalse(SessionStore.snapshot().has("remainingLowMs"))
        ctx.getSharedPreferences("processing-estimates",0).edit().putString("${BuildConfig.VERSION_NAME}:test-model:GPU:64:standard:quality:4","[null,{}, {\"rate\":\"NaN\",\"overhead\":0},{\"rate\":1,\"overhead\":\"Infinity\"},{\"rate\":-1,\"overhead\":1},{\"rate\":1,\"overhead\":-1},{\"rate\":1,\"overhead\":0}]").commit()
        estimate().begin();assertTrue(SessionStore.snapshot().has("remainingLowMs"))
    }
    @Test fun powerAndThermalRestrictDecorativeWork() {
        val power=ctx.getSystemService(PowerManager::class.java);val shadow=Shadows.shadowOf(power)
        shadow.setIsPowerSaveMode(false);shadow.setCurrentThermalStatus(PowerManager.THERMAL_STATUS_NONE);assertFalse(MotionPolicy.restricted(ctx))
        shadow.setIsPowerSaveMode(true);assertTrue(MotionPolicy.restricted(ctx))
        shadow.setIsPowerSaveMode(false);shadow.setCurrentThermalStatus(PowerManager.THERMAL_STATUS_MODERATE);assertTrue(MotionPolicy.restricted(ctx))
    }
}
