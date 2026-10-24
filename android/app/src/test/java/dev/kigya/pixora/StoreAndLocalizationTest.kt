package dev.kigya.pixora

import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.SharedPreferences
import android.content.res.AssetManager
import android.app.LocaleManager
import android.os.LocaleList
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.io.ByteArrayInputStream
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.mockito.ArgumentMatchers.eq

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35], application=Application::class)
class StoreAndLocalizationTest {
    private lateinit var ctx:Context
    @Before fun setup() {
        ctx=RuntimeEnvironment.getApplication()
        reset()
        ctx.filesDir.deleteRecursively();ctx.filesDir.mkdirs()
        ctx.cacheDir.deleteRecursively();ctx.cacheDir.mkdirs()
        ctx.getSharedPreferences("settings",0).edit().clear().commit()
    }
    @After fun reset() {
        for(name in listOf("context","journal"))SessionStore::class.java.getDeclaredField(name).apply{isAccessible=true}.set(SessionStore,null)
        SessionStore.listeners.clear();SessionStore.workerAlive=false;SessionStore.serviceAlive=false
    }
    private fun journal(value:JSONObject) { File(ctx.filesDir,"session.json").writeText(value.toString()) }
    private fun base(state:String="READY")=JSONObject().put("schemaVersion",1).put("sequence",7).put("state",state).put("jobId","j").put("image",JSONObject.NULL)
    @Test fun failedAtomicWriteDoesNotPublishOrReplaceTheSession() {
        SessionStore.init(ctx)
        val previous=SessionStore.snapshot().toString()
        var rolledBack=false
        val failedFile=object:android.util.AtomicFile(File(ctx.filesDir,"fault.json")) {
            override fun startWrite()=object:java.io.FileOutputStream(File(ctx.filesDir,"fault-stream")) {
                override fun write(bytes:ByteArray){throw java.io.IOException("controlled disk failure")}
            }
            override fun failWrite(stream:java.io.FileOutputStream?) {rolledBack=true;stream?.close()}
        }
        SessionStore::class.java.getDeclaredField("journal").apply{isAccessible=true}.set(SessionStore,failedFile)
        val image=JSONObject().put("id","new").put("sourcePath","/synthetic")
        for(action in listOf<()->Unit>({SessionStore.update{it.put("state","FAILED")}}, {SessionStore.replace(image)}, {SessionStore.discard()})) {
            try{action();fail("Expected journal failure")}catch(_:java.io.IOException){}
            assertTrue(rolledBack);assertEquals(previous,SessionStore.snapshot().toString())
        }
        var events=0;SessionStore.listeners.add{events++}
        assertEquals("CANCELLING",SessionStore.updateProcessingState{it.put("state","CANCELLING")}.getString("state"));assertEquals(1,events)
    }
    @Test fun emptyJournalSettingsAndLanguageMapping() {
        SessionStore.init(ctx);SessionStore.init(ctx)
        assertEquals("EMPTY",SessionStore.snapshot().getString("state"))
        assertEquals("system",SessionStore.settings(ctx).getString("language"))
        assertFalse(SessionStore.settings(ctx).getBoolean("languageChosen"))
        val ids=Localizer.supported(ctx)
        assertEquals(org.json.JSONArray(readAssetText(ctx,"locales/registry.json")).length(),ids.size)
        for(id in ids)assertEquals(id,Localizer.resolve(ctx,id,"xx"))
        for(tag in listOf("zh","zh-TW","zh_CN"))assertEquals("zh-Hans",Localizer.resolve(ctx,"system",tag))
        assertEquals("pt-BR",Localizer.resolve(ctx,"system","pt-BR"));assertEquals("pt-BR",Localizer.resolve(ctx,"system","pt-PT"));assertEquals("en",Localizer.resolve(ctx,"system","fi-FI"))
        assertEquals("ru",Localizer.resolve(ctx,"system","ru-RU"))
        assertEquals("en",Localizer.language(ctx));assertTrue(Localizer.text(ctx,"stages.upscaling").isNotBlank())
        ctx.getSharedPreferences("settings",0).edit().putString("language","ru").commit()
        assertEquals("ru",Localizer.language(ctx));assertTrue(Localizer.text(ctx,"processing").contains("\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430"))
        @Suppress("UNCHECKED_CAST")
        val cache=Localizer::class.java.getDeclaredField("cache").apply{isAccessible=true}.get(Localizer) as MutableMap<String,JSONObject>
        val original=cache.remove("ru")
        cache["ru"]=JSONObject().put("stages",JSONObject())
        assertEquals(Localizer.text(ctx,"processing"),"Processing")
        cache.remove("ru");if(original!=null)cache["ru"]=original
        ctx.getSharedPreferences("settings",0).edit().putInt("language",123).commit();assertEquals("en",Localizer.language(ctx))
    }
    @Test fun systemLanguageComesFromSystemLocaleManagerInsteadOfAppLocaleResources() {
        SessionStore.init(ctx)
        val systemLanguage = ctx.getSystemService(LocaleManager::class.java).systemLocales[0].toLanguageTag()
        val appConfiguration = ctx.resources.configuration
        try {
            appConfiguration.setLocales(LocaleList.forLanguageTags("ar"))
            ctx.resources.updateConfiguration(appConfiguration, ctx.resources.displayMetrics)
            assertEquals(systemLanguage, SessionStore.settings(ctx).getString("systemLanguage"))
        } finally {
            appConfiguration.setLocales(LocaleList.getDefault())
            ctx.resources.updateConfiguration(appConfiguration, ctx.resources.displayMetrics)
        }
    }
    @Test @Config(sdk=[32]) fun preAndroid13SystemLanguageIgnoresAppCompatDefaultLocaleOverride() {
        val systemResources = android.content.res.Resources.getSystem()
        val originalSystemConfiguration = systemResources.configuration
        val originalDefaultLocales = LocaleList.getDefault()
        try {
            val systemConfiguration = android.content.res.Configuration(originalSystemConfiguration)
            systemConfiguration.setLocales(LocaleList.forLanguageTags("en-GB"))
            systemResources.updateConfiguration(systemConfiguration, systemResources.displayMetrics)
            LocaleList.setDefault(LocaleList.forLanguageTags("ar")) // AppCompat changes this global default before API 33.

            assertEquals("en-GB", SessionStore.systemLanguage(ctx))
        } finally {
            systemResources.updateConfiguration(originalSystemConfiguration, systemResources.displayMetrics)
            LocaleList.setDefault(originalDefaultLocales)
        }
    }
    @Test fun missingLocaleManagerUsesTheSystemResourceLocaleFallback() {
        SessionStore.init(ctx)
        val app = ctx.applicationContext as Application
        val shadow = org.robolectric.Shadows.shadowOf(app)
        val manager = ctx.getSystemService(LocaleManager::class.java)
        val expected = android.content.res.Resources.getSystem().configuration.locales[0].toLanguageTag()
        try {
            shadow.setSystemService(Context.LOCALE_SERVICE, null)
            assertEquals(expected, SessionStore.settings(ctx).getString("systemLanguage"))
        } finally {
            shadow.setSystemService(Context.LOCALE_SERVICE, manager)
        }
    }
    @Test fun portugueseSystemFallbackUsesEnglishWhenBrazilianLocaleIsUnavailable() {
        val assets=mock(AssetManager::class.java)
        `when`(assets.open("locales/registry.json")).thenReturn(ByteArrayInputStream("[{\"id\":\"en\"}]".toByteArray()))
        val englishOnly=object:ContextWrapper(ctx) {
            override fun getAssets():AssetManager=assets
        }
        assertEquals("en",Localizer.resolve(englishOnly,"system","pt-PT"))
    }
    @Test fun oldPortuguesePreferenceMigratesAndExistingChoicesRemainChosen() {
        ctx.getSharedPreferences("settings",0).edit().putString("language","pt").putString("theme","dark").commit()
        val settings=SessionStore.settings(ctx)
        assertEquals("pt-BR",settings.getString("language"));assertTrue(settings.getBoolean("languageChosen"))
        assertEquals("pt-BR",ctx.getSharedPreferences("settings",0).getString("language",null))
    }
    @Test fun settingsTreatNullLanguageAsSystemAndRecognizeAnUpgrade() {
        SessionStore.init(ctx)
        val prefs=mock(SharedPreferences::class.java)
        `when`(prefs.getString("language","system")).thenReturn(null)
        `when`(prefs.all).thenReturn(emptyMap())
        `when`(prefs.contains("language")).thenReturn(false)
        val info=PackageInfo().apply{firstInstallTime=10;lastUpdateTime=11}
        val packageManager=mock(PackageManager::class.java)
        `when`(packageManager.getPackageInfo(eq(ctx.packageName),eq(0))).thenReturn(info)
        val wrapped=object:ContextWrapper(ctx) {
            override fun getSharedPreferences(name:String,mode:Int):SharedPreferences = if(name=="settings") prefs else super.getSharedPreferences(name,mode)
            override fun getPackageManager():PackageManager = packageManager
        }
        val settings=SessionStore.settings(wrapped)
        assertEquals("system",settings.getString("language"))
        assertTrue("a changed package version signals an existing install",settings.getBoolean("languageChosen"))
        info.lastUpdateTime=info.firstInstallTime
        assertFalse("a clean install with no settings or journal has no prior language choice",SessionStore.settings(wrapped).getBoolean("languageChosen"))
    }
    @Test fun settingsDetectEachExistingInstallSignalIndependently() {
        SessionStore.init(ctx)
        val prefs=ctx.getSharedPreferences("settings",0)
        prefs.edit().clear().commit()
        val info=PackageInfo().apply{firstInstallTime=10;lastUpdateTime=10}
        val packageManager=mock(PackageManager::class.java)
        `when`(packageManager.getPackageInfo(eq(ctx.packageName),eq(0))).thenReturn(info)
        val wrapped=object:ContextWrapper(ctx) {
            override fun getPackageManager():PackageManager=packageManager
        }
        val journal=File(ctx.filesDir,"session.json")
        journal.delete()
        assertFalse(SessionStore.settings(wrapped).getBoolean("languageChosen"))
        prefs.edit().putString("theme","dark").commit()
        assertTrue("an unrelated saved setting proves this is an existing install",SessionStore.settings(wrapped).getBoolean("languageChosen"))
        prefs.edit().clear().commit()
        journal.writeText("{}")
        assertTrue("a persisted session journal proves this is an existing install",SessionStore.settings(wrapped).getBoolean("languageChosen"))
        journal.delete()
        info.lastUpdateTime=11
        assertTrue("a package update proves this is an existing install",SessionStore.settings(wrapped).getBoolean("languageChosen"))
    }
    @Test fun migrationInterruptionAndInvalidJournals() {
        journal(base("RUNNING"));SessionStore.init(ctx)
        assertEquals("INTERRUPTED",SessionStore.snapshot().getString("state"));assertEquals("quality",SessionStore.snapshot().getString("mode"))
        assertEquals(3,SessionStore.snapshot().getInt("schemaVersion"));assertEquals("enhance",SessionStore.snapshot().getString("processingKind"))
        assertEquals(0L,SessionStore.snapshot().getLong("recreateSeed"));assertEquals("",SessionStore.snapshot().getString("recreateModelRevision"))
        assertEquals("",SessionStore.snapshot().getString("recreatePrompt"));assertEquals(0,SessionStore.snapshot().getInt("recreateSteps"))
        reset();journal(base().put("schemaVersion",0));SessionStore.init(ctx);assertEquals("EMPTY",SessionStore.snapshot().getString("state"))
        reset();journal(base().put("schemaVersion",2));SessionStore.init(ctx);assertEquals(3,SessionStore.snapshot().getInt("schemaVersion"))
        reset();journal(base().put("schemaVersion",99));SessionStore.init(ctx);assertEquals("EMPTY",SessionStore.snapshot().getString("state"))
        reset();val available=File(ctx.filesDir,"available").apply{writeText("source")};journal(base().put("image",JSONObject().put("sourcePath",available.path)));SessionStore.init(ctx);assertEquals("READY",SessionStore.snapshot().getString("state"))
        reset();journal(base().put("image",JSONObject().put("sourcePath","/missing")));SessionStore.init(ctx);assertEquals("EMPTY",SessionStore.snapshot().getString("state"))
        reset();journal(base("SUCCEEDED").put("resultPath","/missing"));SessionStore.init(ctx);assertEquals("INTERRUPTED",SessionStore.snapshot().getString("state"))
        reset();val result=File(ctx.filesDir,"result").apply{writeText("ok")};journal(base("SUCCEEDED").put("resultPath",result.path).put("phase","complete").put("mode","fast").put("modelId","realesr-general-x4v3"));SessionStore.init(ctx)
        assertEquals("SUCCEEDED",SessionStore.snapshot().getString("state"));assertEquals("fast",SessionStore.snapshot().getString("mode"))
    }
    @Test fun ownershipSnapshotsListenersBusyAndDiscard() {
        SessionStore.init(ctx)
        val source=File(ctx.filesDir,"sessions/a/source").apply{parentFile!!.mkdirs();writeText("source")}
        val image=JSONObject().put("id","a").put("sourcePath",source.path).put("workPath","private")
        var events=0;SessionStore.listeners.add{events++;assertFalse(it.optJSONObject("image")?.has("sourcePath") ?: false)}
        SessionStore.replace(image);assertTrue(SessionStore.snapshot().getJSONObject("image").has("sourcePath"));assertFalse(SessionStore.publicSnapshot().getJSONObject("image").has("sourcePath"))
        val copy=SessionStore.snapshot();copy.put("state","FAILED");assertEquals("READY",SessionStore.snapshot().getString("state"))
        for(state in SessionStore.activeStates) {SessionStore.update(false){it.put("state",state)};assertTrue(SessionStore.busy());try{SessionStore.requireIdle();fail()}catch(e:AppFailure){assertEquals("BUSY",e.code)}}
        SessionStore.update{it.put("state","READY")}
        for(flag in listOf("workerAlive","serviceAlive")) {SessionStore::class.java.getDeclaredField(flag).apply{isAccessible=true}.setBoolean(SessionStore,true);try{SessionStore.requireIdle();fail()}catch(e:AppFailure){assertEquals("BUSY",e.code)};SessionStore::class.java.getDeclaredField(flag).apply{isAccessible=true}.setBoolean(SessionStore,false)}
        val next=File(ctx.filesDir,"sessions/b/source").apply{parentFile!!.mkdirs();writeText("next")}
        SessionStore.replace(JSONObject().put("id","b").put("sourcePath",next.path));assertFalse(source.exists());SessionStore.discard();assertFalse(next.exists())
        val outside=File(ctx.filesDir,"keep/source").apply{parentFile!!.mkdirs();writeText("keep")}
        SessionStore.replace(JSONObject().put("id","c").put("sourcePath",outside.path));SessionStore.discard();assertTrue(outside.exists());SessionStore.discard();assertTrue(events>8)
        for(path in listOf("/","/source","")) {
            SessionStore.replace(JSONObject().put("id","guard").put("sourcePath",path));SessionStore.discard()
        }
        SessionStore.replace(JSONObject().put("id","guard").put("sourcePath","/"));SessionStore.replace(JSONObject().put("id","guard").put("sourcePath","/source"));SessionStore.replace(JSONObject().put("id","next").put("sourcePath",""));SessionStore.replace(JSONObject().put("id","empty-next").put("sourcePath",""));SessionStore.discard()
    }
}
