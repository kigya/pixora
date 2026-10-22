package dev.kigya.pixora

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.util.concurrent.Executors

class ProcessingService : Service() {
    internal var executor:java.util.concurrent.ExecutorService=Executors.newSingleThreadExecutor()
    internal var control:JobControl=NativeJobControl
    internal var runWork:(android.content.Context,(Boolean)->Unit,()->Boolean)->Unit={context,notice,timeout->ImageProcessor(context,notice,timeout).process()}
    private var wake: PowerManager.WakeLock?=null
    private var lastNotice=0L
    private val handler=Handler(Looper.getMainLooper())
    @Volatile private var timeLimit=false
    @Volatile private var stopping=false
    private val deadline=Runnable { timeLimit=true; control.cancel(); SessionStore.updateProcessingState{it.put("state","CANCELLING")} }
    override fun onCreate(){super.onCreate();SessionStore.init(this);SessionStore.serviceAlive=true}
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action=="CANCEL") {
            if(intent.getStringExtra("jobId")==SessionStore.snapshot().optString("jobId"))cancel()
            if(!SessionStore.workerAlive)stopSelf();return START_NOT_STICKY
        }
        if(intent?.action!="PROCESS" || SessionStore.workerAlive) { if(!SessionStore.workerAlive) stopSelf(); return START_NOT_STICKY }
        SessionStore.workerAlive=true
        try {
            createChannel()
            val type=if(Build.VERSION.SDK_INT>=35) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING else ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            // minSdk29 supports the platform overload. ServiceCompat masks newer types.
            startForeground(1001,notification(),type)
            wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"UpscaleImage:inference").apply{acquire(1_830_000)}
            handler.postDelayed(deadline,1_800_000)
            executor.execute {
                try { runWork(applicationContext, {force -> notice(force)}, {timeLimit}) }
                finally { handler.post { finish() } }
            }
        } catch(e: Exception) {
            // Startup involves only system service APIs, never image names or URIs.
            android.util.Log.w("UpscaleLifecycle", "Foreground startup: ${e.javaClass.simpleName}")
            SessionStore.updateProcessingState{it.put("state","FAILED").put("error","SERVICE_START_FAILED")}; finish()
        }
        return START_NOT_STICKY
    }
    private fun cancel() { control.cancel(); if(SessionStore.busy()) SessionStore.updateProcessingState{it.put("state","CANCELLING")} }
    private fun createChannel() {
        val channel=NotificationChannel("processing",Localizer.text(this,"processing"),NotificationManager.IMPORTANCE_LOW).apply{setSound(null,null);enableVibration(false);lockscreenVisibility=Notification.VISIBILITY_PRIVATE}
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    private fun titleKey(state:String):String {
        if(state=="SUCCEEDED")return "imageReady"
        if(state=="FAILED")return "processingFailed"
        if(state=="FINALIZING")return "finalizing"
        if(state=="CANCELLING")return "cancelling"
        return "processing"
    }
    private fun notification(): Notification {
        val s=SessionStore.snapshot(); val active=SessionStore.busy()
        val title=Localizer.text(this,titleKey(s.optString("state")))
        val phase=s.optString("phase")
        val body=if(phase in setOf("preparing_image","checking_device","loading_model","recreating","upscaling","building_result","writing_result"))Localizer.text(this,"stages.$phase") else Localizer.text(this,"output")
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder=NotificationCompat.Builder(this,"processing").setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
            .setContentIntent(open).setOngoing(active).setSilent(true).setAutoCancel(!active).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        if(active) {
            val p=s.optDouble("progress",-1.0);builder.setProgress(100,p.toInt().coerceIn(0,100),p<0)
            val cancel=PendingIntent.getService(this,s.optString("jobId").hashCode(),Intent(this,ProcessingService::class.java).setAction("CANCEL").putExtra("jobId",s.optString("jobId")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(0,Localizer.text(this,"cancelJob"),cancel)
        }
        return builder.build()
    }
    private fun notice(force:Boolean) {
        if(stopping)return
        val now=SystemClock.elapsedRealtime();if(force || now-lastNotice>=1000) {lastNotice=now;try{createChannel();getSystemService(NotificationManager::class.java).notify(1001,notification())}catch(_:SecurityException){}}
    }
    private fun finish() {
        stopping=true;handler.removeCallbacks(deadline);wake?.let{if(it.isHeld)it.release()};wake=null
        SessionStore.workerAlive=false
        ServiceCompat.stopForeground(this,ServiceCompat.STOP_FOREGROUND_REMOVE)
        if(SessionStore.snapshot().optString("state") in setOf("SUCCEEDED","FAILED"))try{getSystemService(NotificationManager::class.java).notify(1002,notification())}catch(_:SecurityException){}
        stopSelf()
    }
    override fun onTimeout(startId:Int,fgsType:Int) {timeLimit=true;control.cancel();SessionStore.updateProcessingState{it.put("state","CANCELLING")};ServiceCompat.stopForeground(this,ServiceCompat.STOP_FOREGROUND_REMOVE);stopSelf()}
    override fun onDestroy(){SessionStore.serviceAlive=false;handler.removeCallbacks(deadline);wake?.let{if(it.isHeld)it.release()};executor.shutdown();super.onDestroy()}
}
