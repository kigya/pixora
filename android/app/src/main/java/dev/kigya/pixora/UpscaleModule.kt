package dev.kigya.pixora

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.ClipData
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.PickVisualMediaRequest
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.google.android.play.core.review.ReviewManagerFactory
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

class UpscaleModule(private val ctx:ReactApplicationContext, private val bridge:JsonBridge=JsonBridge(), private val models:ModelVerifier=BundledModels(ctx), private val control:JobControl=NativeJobControl, private val feedback:FeedbackClient=FeedbackClient(NativeEngine.feedbackEndpoint())):NativeUpscaleSpec(ctx) {
    companion object{const val NAME="NativeUpscale"; const val PICK=4301;const val NOTIFY=4302}
    private val io=Executors.newSingleThreadExecutor()
    private val feedbackIo=Executors.newSingleThreadExecutor()
    private val main=Handler(Looper.getMainLooper())
    private var pickerPromise:Promise?=null
    private var permissionPromise:Promise?=null
    private val listener:(JSONObject)->Unit={json->main.post{if(ctx.hasActiveReactInstance() && mEventEmitterCallback!=null)emitOnSessionChanged(map(json))}}
    private val windowListener:(JSONObject)->Unit={json->main.post{if(ctx.hasActiveReactInstance() && mEventEmitterCallback!=null)emitOnWindowLayoutChanged(map(json))}}
    private val availabilityListener:(JSONObject)->Unit={json->main.post{if(ctx.hasActiveReactInstance() && mEventEmitterCallback!=null)emitOnProfileAvailabilityChanged(map(json))}}
    override fun getProfileAvailability(p:Promise)=async(p){map(ProfileAvailability.snapshot())}
    override fun getTelemetrySettings(p:Promise)=async(p){map(Telemetry.settings())}
    override fun updateTelemetrySettings(analytics:Boolean,crashes:Boolean,noticeSeen:Boolean,p:Promise)=async(p){map(Telemetry.update(analytics,crashes,noticeSeen))}
    override fun logTelemetryEvent(name:String,parameters:String){try{Telemetry.event(name,JSONObject(parameters))}catch(_:Exception){}}
    override fun getWindowLayout(p:Promise)=async(p){map(WindowLayout.value)}
    private val activityListener = object:BaseActivityEventListener(){
            override fun onActivityResult(activity:Activity,requestCode:Int,resultCode:Int,data:Intent?) {
                if(requestCode!=PICK)return
                val p=pickerPromise ?: return;pickerPromise=null
                if(resultCode!=Activity.RESULT_OK || data?.data==null){Telemetry.event("image_import_finished",JSONObject().put("source","picker").put("status","cancelled"));p.resolve(null);return}
                async(p,"SOURCE_UNAVAILABLE"){
                    try {
                    SessionStore.requireIdle()
                    val image=ImageFiles.import(ctx,data.data!!)
                    try {SessionStore.replace(image)}
                    catch(error:Throwable) {File(image.getString("sourcePath")).parentFile!!.deleteRecursively();throw error}
                    image.remove("sourcePath");image.remove("workPath");Telemetry.event("image_import_finished",JSONObject().put("source","picker").put("status","success"));map(image)
                    }catch(error:Throwable){Telemetry.event("image_import_finished",JSONObject().put("source","picker").put("status","error").put("error_code",if(error is AppFailure)error.code else "SOURCE_UNAVAILABLE"));throw error}
                }
            }
        }
    init {
        ProfileAvailability.listeners.add(availabilityListener)
        WindowLayout.listeners.add(windowListener)
        SessionStore.init(ctx);SessionStore.listeners.add(listener)
        ctx.addActivityEventListener(activityListener)
    }
    override fun getName()=NAME
    override fun finishStartup() {
        main.post { (ctx.currentActivity as? MainActivity)?.finishStartup() }
    }
    private fun async(p:Promise,fallback:String="INFERENCE_FAILED",executor:java.util.concurrent.Executor=io,block:()->Any?) {
        executor.execute {try{val result=block();if(result !== Deferred)p.resolve(result)}catch(e:Throwable){p.reject(if(e is AppFailure)e.code else if(e is OutOfMemoryError)"LOW_MEMORY" else fallback,"Operation failed")}}
    }
    private fun requireImage(id:String):JSONObject {
        val image=SessionStore.snapshot().optJSONObject("image") ?: throw AppFailure("SOURCE_UNAVAILABLE")
        if(image.getString("id")!=id)throw AppFailure("SOURCE_UNAVAILABLE");return image
    }
    private fun requireResult(job:String):JSONObject {
        val s=SessionStore.snapshot();if(s.getString("jobId")!=job || s.getString("state")!="SUCCEEDED")throw AppFailure("EXPORT_FAILED")
        return s
    }
    override fun getCapabilities(p:Promise)=async(p){
        val mem=ActivityManager.MemoryInfo();(ctx.getSystemService(Context.ACTIVITY_SERVICE)as ActivityManager).getMemoryInfo(mem)
        // Android reports less than marketed capacity; 3.5GiB includes the 4GB device class.
        val supported=Build.SUPPORTED_ABIS.contains("arm64-v8a") && mem.totalMem>=3.5*1024*1024*1024
        val bytes=File(ctx.filesDir,"sessions").walkTopDown().filter{it.isFile}.sumOf{it.length()}+File(ctx.cacheDir,"share").walkTopDown().filter{it.isFile}.sumOf{it.length()}
        map(JSONObject().put("modes",JSONArray(if(BuildConfig.FAST_MODEL_ENABLED)ProcessingProfiles.presets else ProcessingProfiles.presets.filter{it!="lite"})).put("sdk",Build.VERSION.SDK_INT).put("supported",supported).put("modelValid",models.valid()).put("ramBytes",mem.totalMem).put("storageBytes",ImageFiles.space(ctx)).put("workBytes",bytes).put("version",BuildConfig.VERSION_NAME))
    }
    override fun pickImage(p:Promise) {
        main.post {
            try {
                SessionStore.requireIdle();if(pickerPromise!=null)throw AppFailure("BUSY")
                val activity=ctx.currentActivity ?: throw AppFailure("SOURCE_UNAVAILABLE")
                val intent=if(ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(ctx)) ActivityResultContracts.PickVisualMedia().createIntent(ctx,PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    else Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("image/jpeg","image/png","image/webp"))
                Telemetry.event("image_import_started",JSONObject().put("source","picker"));pickerPromise=p;activity.startActivityForResult(intent,PICK)
            }catch(e:Exception){if(pickerPromise===p)pickerPromise=null;Telemetry.event("image_import_finished",JSONObject().put("source","picker").put("status","error").put("error_code",if(e is AppFailure)e.code else "SOURCE_UNAVAILABLE"));p.reject(if(e is AppFailure)e.code else "SOURCE_UNAVAILABLE","Selection unavailable")}
        }
    }
    override fun inspectSelection(id:String,p:Promise)=async(p){val image=requireImage(id);image.remove("sourcePath");image.remove("workPath");map(image)}
    override fun getImageRecommendation(id:String,p:Promise)=async(p){
        val image=requireImage(id)
        val reason=try { RecommendationEngine.analyze(image.getString("previewUri")) }
        catch(_:Throwable) { "generic" }
        val profile=when(reason) { "photo" -> "lite"; "art" -> "art"; "pixel" -> "pixel"; else -> "lite" }
        if(!ProfileAvailability.allowed(profile)) null else map(JSONObject()
            .put("imageId",id).put("profileId",profile).put("speed","quality").put("reasonId",reason))
    }
    override fun prepareSelection(id:String,p:Promise)=async(p){
        SessionStore.requireIdle();val image=requireImage(id);val work=ImageFiles.prepare(image)
        SessionStore.update{it.getJSONObject("image").put("workPath",work.path)}
        image.remove("sourcePath");image.remove("workPath");map(image)
    }
    override fun startJob(id:String,scale:Double,preparationConfirmed:Boolean,p:Promise) = launchJob(id,scale,preparationConfirmed,"quality",p)
    override fun startJobWithMode(id:String,scale:Double,preparationConfirmed:Boolean,mode:String,p:Promise) = launchJob(id,scale,preparationConfirmed,mode,p)
    override fun startJobWithProfile(id:String,scale:Double,profile:String,speed:String,preparationConfirmed:Boolean,p:Promise) {
        if(profile !in ProcessingProfiles.presets || speed !in setOf("fast","quality") || (profile=="pixel" && speed!="quality")){p.reject("INFERENCE_FAILED","Invalid profile");return}
        launchJob(id,scale,preparationConfirmed,profile,p,speed,profile)
    }
    private fun launchJob(id:String,scale:Double,preparationConfirmed:Boolean,mode:String,p:Promise,speed:String="quality",profile:String="")=async(p){
        if(mode !in ProcessingProfiles.modes || (!BuildConfig.FAST_MODEL_ENABLED && mode in setOf("fast","illustration-fast","lite")))throw AppFailure("INFERENCE_FAILED")
        synchronized(SessionStore.lock) {
            if(!ProfileAvailability.allowed(mode))throw AppFailure("PROFILE_UNAVAILABLE")
            SessionStore.requireIdle();if(scale!=2.0 && scale!=4.0)throw AppFailure("INFERENCE_FAILED")
            val image=requireImage(id);if(!models.valid())throw AppFailure("MODEL_INVALID")
            val mem=ActivityManager.MemoryInfo();(ctx.getSystemService(Context.ACTIVITY_SERVICE)as ActivityManager).getMemoryInfo(mem)
            if(mem.totalMem<3.5*1024*1024*1024)throw AppFailure("DEVICE_UNSUPPORTED")
            if(ImageFiles.space(ctx)<ImageFiles.reserve(image.getInt("workWidth"),image.getInt("workHeight"),scale.toInt()))throw AppFailure("LOW_STORAGE")
            if(image.getBoolean("needsPreparation") && !preparationConfirmed)throw AppFailure("PREPARATION_REQUIRED")
            val activity=ctx.currentActivity ?: throw AppFailure("SERVICE_START_FAILED")
            if(activity.isFinishing || activity.isDestroyed)throw AppFailure("SERVICE_START_FAILED")
            control.reset()
            SessionStore.update{for(key in listOf("estimatedTotalLowMs","estimatedTotalHighMs","remainingLowMs","remainingHighMs","aiInputWidth","aiInputHeight"))it.remove(key);it.put("restrictAnimation",MotionPolicy.restricted(ctx)).put("profileId",profile).put("speed",speed).put("mode",mode).put("modelId",ProcessingProfiles.model(mode)).put("timings",JSONObject()).put("jobId",UUID.randomUUID().toString()).put("scale",scale.toInt()).put("state","PREPARING").put("phase","preparing_image").put("completedTiles",0).put("totalTiles",0).put("startedAt",System.currentTimeMillis()).put("elapsedMs",0).put("progress",-1).put("error","").put("resultUri","").put("exports",JSONArray()).put("exportState","EXPORT_IDLE")}
            try{ContextCompat.startForegroundService(ctx,Intent(ctx,ProcessingService::class.java).setAction("PROCESS"))}
            catch(_:Exception){SessionStore.update{it.put("state","FAILED").put("error","SERVICE_START_FAILED")};throw AppFailure("SERVICE_START_FAILED")}
            Telemetry.event("job_started",Telemetry.jobContext(SessionStore.snapshot()))
            map(SessionStore.publicSnapshot())
        }
    }
    override fun getCurrentSession(p:Promise)=async(p){
        val exports=SessionStore.snapshot().getJSONArray("exports");val valid=JSONArray()
        for(i in 0 until exports.length()) {
            val entry=exports.getJSONObject(i)
            val exists=try{ctx.contentResolver.query(Uri.parse(entry.getString("uri")),arrayOf("_id"),null,null,null)?.let{cursor->withClosed(cursor){it.moveToFirst()}}==true}catch(_:Exception){false}
            if(exists)valid.put(entry)
        }
        if(valid.length()!=exports.length()) SessionStore.update{it.put("exports",valid).put("exportState",if(valid.length()>0)"EXPORTED" else "EXPORT_IDLE")}
        map(SessionStore.publicSnapshot())
    }
    override fun cancelJob(id:String,p:Promise)=async(p){
        synchronized(SessionStore.lock){if(SessionStore.snapshot().getString("jobId")==id && SessionStore.busy()){control.cancel();SessionStore.update{it.put("state","CANCELLING")}};map(SessionStore.publicSnapshot())}
    }
    override fun exportResult(job:String,format:String,p:Promise)=async(p,"EXPORT_FAILED"){
        val s=requireResult(job)
        val existing=s.getJSONArray("exports")
        for(i in 0 until existing.length()) {
            val entry=existing.getJSONObject(i)
            if(entry.getString("format")==format && ctx.contentResolver.query(Uri.parse(entry.getString("uri")),arrayOf("_id"),null,null,null)?.let{cursor->withClosed(cursor){it.moveToFirst()}}==true){Telemetry.event("export_finished",Telemetry.jobContext(s).put("format",format).put("status","already_saved"));return@async map(entry)}
        }
        SessionStore.update{it.put("exportState","EXPORTING")}
        try{val out=ImageFiles.export(ctx,s,format);SessionStore.update{it.put("exportState","EXPORTED");it.getJSONArray("exports").put(out)};if(existing.length()==0){val prefs=ctx.getSharedPreferences("settings",0);prefs.edit().putInt("savedJobs",prefs.getInt("savedJobs",0)+1).commit()};Telemetry.event("export_finished",Telemetry.jobContext(s).put("format",format).put("status","success"));map(out)}
        catch(e:Throwable){SessionStore.update{it.put("exportState","EXPORT_FAILED")};Telemetry.event("export_finished",Telemetry.jobContext(s).put("format",format).put("status","error").put("error_code","EXPORT_FAILED"));throw e}
    }
    override fun shareResult(job:String,format:String,p:Promise)=async(p,"SHARE_FAILED"){
        val file=ImageFiles.shareFile(ctx,requireResult(job),format)
        val uri=FileProvider.getUriForFile(ctx,"${BuildConfig.APPLICATION_ID}.files",file)
        val intent=Intent(Intent.ACTION_SEND).setType(if(format=="png")"image/png" else if(format=="webp")"image/webp" else "image/jpeg").putExtra(Intent.EXTRA_STREAM,uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply{clipData=ClipData.newUri(ctx.contentResolver,"Upscale Image",uri)}
        main.post{try{val activity=ctx.currentActivity ?: throw AppFailure("SHARE_FAILED");activity.startActivity(Intent.createChooser(intent,null));Telemetry.event("share_opened",Telemetry.jobContext(SessionStore.snapshot()).put("format",format).put("status","success"));p.resolve(true)}catch(_:Exception){p.reject("SHARE_FAILED","Cannot share result")}}
        // Promise completion belongs to the main-thread launch above.
        Deferred
    }
    private object Deferred
    override fun openExport(id:String,p:Promise)=async(p,"EXPORT_FAILED"){
        val list=SessionStore.snapshot().getJSONArray("exports");var entry:JSONObject?=null
        for(i in 0 until list.length())if(list.getJSONObject(i).getString("id")==id)entry=list.getJSONObject(i)
        val out=entry ?: throw AppFailure("EXPORT_FAILED")
        val intent=Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(out.getString("uri")),if(out.getString("format")=="png")"image/png" else "image/jpeg").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        main.post{try{ctx.startActivity(intent);p.resolve(true)}catch(_:Exception){p.reject("EXPORT_FAILED","Cannot open result")}};Deferred
    }
    override fun discardSession(p:Promise)=async(p){map(SessionStore.discard())}
    override fun clearTemporaryFiles(p:Promise)=async(p){if(SessionStore.busy())throw AppFailure("BUSY");ImageFiles.cleanupShares(ctx,true).toDouble()}
    override fun dismissNotificationHint(sessionId:String,p:Promise)=async(p){
        if(SessionStore.snapshot().optString("sessionId")!=sessionId)throw AppFailure("SOURCE_UNAVAILABLE")
        ctx.getSharedPreferences("settings",0).edit().putString("notificationDismissedSession",sessionId).commit()
        map(SessionStore.settings(ctx))
    }
    override fun getSettings(p:Promise)=async(p){map(SessionStore.settings(ctx))}
    override fun updateSettings(language:String,format:String,theme:String,p:Promise)=async(p){
        if(theme !in setOf("system","light","dark"))throw AppFailure("INFERENCE_FAILED")
        val selectedLanguage = if(language == "pt") "pt-BR" else language
        if(selectedLanguage !in Localizer.supported(ctx) + "system" || format !in setOf("png","jpeg","webp"))throw AppFailure("INFERENCE_FAILED")
        val preferences = ctx.getSharedPreferences("settings",Context.MODE_PRIVATE)
        val previous = SessionStore.settings(ctx)
        check(preferences.edit().putString("language",selectedLanguage).putString("format",format).putString("theme",theme).commit()) { "SETTINGS_WRITE_FAILED" }
        for ((key, value) in mapOf("language" to selectedLanguage, "format" to format, "theme" to theme)) {
            if (previous.optString(key) != value) Telemetry.event("settings_changed", JSONObject().put("setting",key).put("value",value))
        }
        main.post {
            androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(ThemePolicy.nightMode(theme))
            androidx.appcompat.app.AppCompatDelegate.setApplicationLocales(
                androidx.core.os.LocaleListCompat.forLanguageTags(if (selectedLanguage == "system") "" else selectedLanguage),
            )
        }
        map(SessionStore.settings(ctx))
    }
    override fun requestNotifications(p:Promise) {
        main.post {
            val prefs=ctx.getSharedPreferences("settings",Context.MODE_PRIVATE)
            if(Build.VERSION.SDK_INT<33){prefs.edit().putBoolean("notificationAsked",true).apply();p.resolve(true);return@post}
            if(ContextCompat.checkSelfPermission(ctx,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED){prefs.edit().putBoolean("notificationAsked",true).apply();p.resolve(true);return@post}
            if(prefs.getBoolean("notificationAsked",false)){p.resolve(false);return@post}
            val activity=ctx.currentActivity as? PermissionAwareActivity
            if(activity==null || permissionPromise!=null){p.resolve(false);return@post}
            permissionPromise=p;prefs.edit().putBoolean("notificationAsked",true).apply()
            activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),NOTIFY,PermissionListener{code,_,grants->
                if(code==NOTIFY){permissionPromise?.resolve(grants.isNotEmpty() && grants[0]==PackageManager.PERMISSION_GRANTED);permissionPromise=null;true}else false})
        }
    }
    override fun getNotificationStatus(p:Promise)=async(p){
        val manager=ctx.getSystemService(android.app.NotificationManager::class.java)
        manager.areNotificationsEnabled() && (manager.getNotificationChannel("processing")?.importance ?: 2)!=android.app.NotificationManager.IMPORTANCE_NONE
    }
    override fun openNotificationSettings(p:Promise) {
        main.post { try { ctx.startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));p.resolve(true) } catch(_:Exception){p.resolve(false)} }
    }
    override fun setCacheLimit(mebibytes:Double,p:Promise)=async(p){
        if(mebibytes!=mebibytes.toInt().toDouble() || mebibytes.toInt() !in RetentionPolicy.limits)throw AppFailure("INFERENCE_FAILED")
        check(ctx.getSharedPreferences("settings",0).edit().putInt("cacheLimitMiB",mebibytes.toInt()).commit()) { "SETTINGS_WRITE_FAILED" }
        Telemetry.event("settings_changed", JSONObject().put("setting","cache_limit").put("value",mebibytes.toInt()))
        map(SessionStore.settings(ctx))
    }
    override fun markNotificationIntroSeen(p:Promise)=async(p){
        check(ctx.getSharedPreferences("settings",0).edit().putBoolean("notificationIntroSeen",true).commit()) { "SETTINGS_WRITE_FAILED" }
        map(SessionStore.settings(ctx))
    }
    override fun markNotificationHint(p:Promise)=async(p){
        val prefs=ctx.getSharedPreferences("settings",0);prefs.edit().putInt("notificationHintCount",minOf(3,prefs.getInt("notificationHintCount",0)+1)).commit();map(SessionStore.settings(ctx))
    }
    override fun claimReviewPrompt(jobId:String,p:Promise)=async(p){
        synchronized(SessionStore.lock) {
            val prefs=ctx.getSharedPreferences("settings",0)
            val eligible=SessionStore.snapshot().optString("jobId")==jobId && SessionStore.snapshot().optString("state")=="SUCCEEDED" && prefs.getInt("savedJobs",0)>=3 && prefs.getInt("reviewPrompts",0)<2 && System.currentTimeMillis()-prefs.getLong("reviewShownAt",0)>=30L*86400000
            if (!eligible) return@synchronized false
            prefs.edit()
                .putInt("reviewPrompts",prefs.getInt("reviewPrompts",0)+1)
                .putLong("reviewShownAt",System.currentTimeMillis())
                .commit()
        }
    }
    override fun requestReview(p:Promise) {
        main.post {
            val activity = ctx.currentActivity
            if (activity == null) { p.resolve(false); return@post }
            try {
                val manager = ReviewManagerFactory.create(ctx)
                manager.requestReviewFlow().addOnCompleteListener(activity) { request ->
                    if (!request.isSuccessful) { p.resolve(false); return@addOnCompleteListener }
                    manager.launchReviewFlow(activity, request.result).addOnCompleteListener(activity) { result ->
                        // Play does not reveal whether its neutral system dialog was shown or submitted.
                        p.resolve(result.isSuccessful)
                    }
                }
            } catch (_: Exception) { p.resolve(false) }
        }
    }
    override fun getFeedbackStatus(p:Promise)=async(p){feedback.configured()}
    override fun sendFeedback(email:String,message:String,rating:Double,requestId:String,p:Promise)=async(p,"FEEDBACK_FAILED",feedbackIo){
        if(rating!=rating.toInt().toDouble())throw AppFailure("FEEDBACK_INVALID")
        feedback.send(email,message,rating.toInt(),requestId)
    }
    override fun getLegalText(p:Promise)=async(p){readAssetText(ctx,"LEGAL.txt")}
    override fun invalidate(){ProfileAvailability.listeners.remove(availabilityListener);ctx.removeActivityEventListener(activityListener);WindowLayout.listeners.remove(windowListener);SessionStore.listeners.remove(listener);pickerPromise?.reject("SOURCE_UNAVAILABLE","Activity closed");permissionPromise?.resolve(false);io.shutdown();feedbackIo.shutdown();super.invalidate()}
    private fun map(json:JSONObject)=bridge.map(json)
}
