package dev.kigya.pixora

import android.content.Intent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject

/** Exercises the shipped release UI using accessibility actions, not mocked strings. */
@RunWith(AndroidJUnit4::class)
class LocalizationUiTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val ctx=instrumentation.targetContext
    private val automation get()=instrumentation.uiAutomation
    private fun nodes(node:AccessibilityNodeInfo?):List<AccessibilityNodeInfo> {
        if(node==null)return emptyList()
        return listOf(node)+(0 until node.childCount).flatMap{nodes(node.getChild(it))}
    }
    private fun fullyVisible(node:AccessibilityNodeInfo):Boolean {
        val rect=android.graphics.Rect();node.getBoundsInScreen(rect)
        var parent=node.parent
        while(parent!=null) {
            if(parent.isScrollable) {
                val clip=android.graphics.Rect();parent.getBoundsInScreen(clip)
                if(!rect.intersect(clip))return false
            }
            parent=parent.parent
        }
        return node.isVisibleToUser && rect.height() >= (if(node.isClickable)46*ctx.resources.displayMetrics.density else 20f)
    }
    private fun match(text:String,interactive:Boolean=false)=nodes(automation.rootInActiveWindow).filter{(!interactive || it.isClickable) && (it.text?.toString()==text || it.contentDescription?.toString()==text) && fullyVisible(it)}.sortedBy{!it.isClickable}.firstOrNull()
    private fun waitText(text:String):AccessibilityNodeInfo {
        val until=System.currentTimeMillis()+15000
        while(System.currentTimeMillis()<until) {match(text)?.let{return it};Thread.sleep(100)}
        throw AssertionError("Missing visible text: $text. Visible labels: ${nodes(automation.rootInActiveWindow).mapNotNull{it.text?.toString() ?: it.contentDescription?.toString()}.take(50)}")
    }
    private fun click(node:AccessibilityNodeInfo) {
        // Exercise the accessible click contract; absolute coordinates can become stale
        // while a modal animates or the emulator changes density/window size.
        if(node.performAction(AccessibilityNodeInfo.ACTION_CLICK))return
        val rect=android.graphics.Rect();node.getBoundsInScreen(rect)
        val now=android.os.SystemClock.uptimeMillis()
        for(action in listOf(android.view.MotionEvent.ACTION_DOWN,android.view.MotionEvent.ACTION_UP)) {
            val event=android.view.MotionEvent.obtain(now,android.os.SystemClock.uptimeMillis(),action,rect.exactCenterX(),rect.exactCenterY(),0)
            event.source=android.view.InputDevice.SOURCE_TOUCHSCREEN
            assertTrue(automation.injectInputEvent(event,true));event.recycle()
        }
    }
    private fun resumeApp() {
        android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("am start -W -n dev.kigya.pixora/.MainActivity")).use{it.readBytes()}
        Thread.sleep(500)
    }
    private fun scrollSmall() {
        val node=nodes(automation.rootInActiveWindow).firstOrNull{it.isScrollable} ?: return
        val r=android.graphics.Rect();node.getBoundsInScreen(r)
        val now=android.os.SystemClock.uptimeMillis()
        for(step in 0..12) {
            val action=if(step==0)android.view.MotionEvent.ACTION_DOWN else if(step==12)android.view.MotionEvent.ACTION_UP else android.view.MotionEvent.ACTION_MOVE
            val event=android.view.MotionEvent.obtain(now,android.os.SystemClock.uptimeMillis(),action,r.exactCenterX(),r.top+r.height()*(0.75f-0.3f*step/12),0)
            event.source=android.view.InputDevice.SOURCE_TOUCHSCREEN;automation.injectInputEvent(event,true);event.recycle();Thread.sleep(15)
        }
    }
    private fun tap(text:String,scroll:Boolean=false) {
        var node=match(text,true)
        if(scroll && node==null){top();node=match(text,true)}
        if(scroll) for(i in 0..12) {
            if(node!=null)break
            nodes(automation.rootInActiveWindow).firstOrNull{it.isScrollable}?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
            Thread.sleep(500);node=match(text,true)
        }
        if(scroll && node==null) {
            top()
            for(i in 0..45){node=match(text,true);if(node!=null)break;scrollSmall();Thread.sleep(200)}
        }
        val target=node?:throw AssertionError("Missing tappable action: $text. Labels: ${nodes(automation.rootInActiveWindow).mapNotNull{it.contentDescription?.toString() ?: it.text?.toString()}}")
        click(target)
        Thread.sleep(500)
    }
    private fun seek(text:String):AccessibilityNodeInfo {
        match(text)?.let{return it}
        top()
        for(i in 0..16) {
            match(text)?.let{return it}
            nodes(automation.rootInActiveWindow).firstOrNull{it.isScrollable}?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
            Thread.sleep(350)
        }
        return waitText(text)
    }
    private fun top() {repeat(8){nodes(automation.rootInActiveWindow).firstOrNull{it.isScrollable}?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)};Thread.sleep(150)}
    @Test fun languagePickerHelpAndThemes() {
        val prefs=ctx.getSharedPreferences("settings",0)
        val oldLanguage=prefs.getString("language","system");val oldTheme=prefs.getString("theme","system")
        val registry=org.json.JSONArray(ctx.assets.open("locales/registry.json").bufferedReader().use{it.readText()})
        val registeredCodes=(0 until registry.length()).map{registry.getJSONObject(it).getString("id")}
        val requestedCodes=InstrumentationRegistry.getArguments().getString("languages")?.split(",") ?: registeredCodes
        // Preserve explicit test-matrix selection while migrating its legacy Portuguese alias.
        val codes=requestedCodes.map{if(it=="pt")"pt-BR" else it}
        assertTrue("Configured locale IDs must exist in the shipped registry",codes.all{it in registeredCodes})
        fun dictionary(code:String)=JSONObject(ctx.assets.open("locales/$code.json").bufferedReader().use{it.readText()})
        fun appCompatTag(language:String?)=when(language) {null,"system"->"";"pt"->"pt-BR";else->language}

        SessionStore.init(ctx);SessionStore.discard()
        prefs.edit().putString("language","en").putString("theme","light").commit()
        instrumentation.runOnMainSync {
            androidx.appcompat.app.AppCompatDelegate.setApplicationLocales(
                androidx.core.os.LocaleListCompat.forLanguageTags("en"),
            )
        }
        instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

        fun resumedActivity():MainActivity? {
            var result:MainActivity?=null
            instrumentation.runOnMainSync {
                result=androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                    .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED)
                    .filterIsInstance<MainActivity>().lastOrNull()
            }
            return result
        }
        fun awaitHomeOrSettings(t:JSONObject):Boolean {
            val deadline=System.currentTimeMillis()+20000
            while(System.currentTimeMillis()<deadline) {
                if(match(t.getString("choose"))!=null)return true
                if(match(t.getString("language"))!=null)return false
                Thread.sleep(100)
            }
            throw AssertionError("Locale change did not restore Home or Settings")
        }
        fun awaitHome(t:JSONObject) {
            assertTrue("Expected Home after locale/theme recreation",awaitHomeOrSettings(t))
            assertNotNull("A resumed MainActivity should own the restored Home screen",resumedActivity())
        }
        fun openSettings(t:JSONObject) {
            top();tap(t.getString("settings"));waitText(t.getString("language"))
        }
        var current=dictionary("en")
        var activeCode="en"
        try {
            awaitHome(current)
            for(theme in listOf("light","dark")) {
                openSettings(current)
                tap(current.getString(theme),true)
                if(!awaitHomeOrSettings(current)) {
                    top();tap(current.getString("back"))
                }
                awaitHome(current)
                for(code in codes) {
                    openSettings(current)
                    val row=nodes(automation.rootInActiveWindow).firstOrNull{it.viewIdResourceName?.endsWith("language-picker")==true}
                    assertNotNull("Language row",row);click(row!!);Thread.sleep(500)
                    val name=(0 until registry.length()).map{registry.getJSONObject(it)}.first{it.getString("id")==code}.getString("name")
                    val previousActivity=resumedActivity()
                    tap(name,true)
                    current=dictionary(code)
                    val restoredHome=awaitHomeOrSettings(current)
                    assertEquals("Native settings persist the selected locale",code,prefs.getString("language",null))
                    if(code!=activeCode) {
                        assertTrue("Changing locale must restore Home after AppCompat recreation",restoredHome)
                        assertNotNull("Settings must be hosted by a resumed MainActivity before locale selection",previousActivity)
                        assertNotNull("The recreated MainActivity must be resumed",resumedActivity())
                        assertNotSame("Locale changes recreate MainActivity",previousActivity,resumedActivity())
                    } else if(!restoredHome) {
                        // Selecting the current locale closes the picker without recreation.
                        top();tap(current.getString("back"))
                    }
                    awaitHome(current)
                    activeCode=code

                    top();seek(current.getString("hero"));tap(current.getString("how"),true)
                    waitText(current.getString("howTitle"))
                    tap(current.getString("understood"),true)
                    awaitHome(current)
                    val liveActivity=resumedActivity()
                    assertNotNull(liveActivity)
                    assertEquals("Navigation bar contrast must follow the selected theme",theme=="light",androidx.core.view.WindowInsetsControllerCompat(liveActivity!!.window,liveActivity.window.decorView).isAppearanceLightNavigationBars)
                    val shot=automation.takeScreenshot();java.io.File(ctx.getExternalFilesDir(null),"validation-03-$theme-$code-home.png").outputStream().use{shot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};shot.recycle()
                    println("UI locale=$code theme=$theme OK")
                }
            }
        } finally {
            prefs.edit().putString("language",oldLanguage).putString("theme",oldTheme).commit()
            instrumentation.runOnMainSync {
                androidx.appcompat.app.AppCompatDelegate.setApplicationLocales(
                    androidx.core.os.LocaleListCompat.forLanguageTags(appCompatTag(oldLanguage)),
                )
            }
            Thread.sleep(500)
            instrumentation.runOnMainSync {
                androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                    .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED)
                    .filterIsInstance<MainActivity>().forEach{it.finish()}
            }
        }
    }
    @Test fun supportProfilesPreviewAndRetention() {
        val prefs=ctx.getSharedPreferences("settings",0)
        val oldLanguage=prefs.getString("language","system");val oldTheme=prefs.getString("theme","system");val oldFormat=prefs.getString("format","png");val oldLimit=prefs.getInt("cacheLimitMiB",-1)
        val language=InstrumentationRegistry.getArguments().getString("language") ?: "en"
        val theme=InstrumentationRegistry.getArguments().getString("theme") ?: "light"
        val t=JSONObject(ctx.assets.open("locales/$language.json").bufferedReader().use{it.readText()})
        prefs.edit().putString("language",language).putString("theme",theme).putString("format","png").putInt("cacheLimitMiB",-1).commit()
        SessionStore.init(ctx);SessionStore.discard()
        val bitmap=android.graphics.Bitmap.createBitmap(48,96,android.graphics.Bitmap.Config.ARGB_8888).apply{eraseColor(android.graphics.Color.BLUE)}
        val file=java.io.File(ctx.cacheDir,"05-ui-portrait.png");ImageFiles.write(bitmap,file,"png");bitmap.recycle()
        SessionStore.replace(ImageFiles.import(ctx,android.net.Uri.fromFile(file)))
        val activity=instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        fun capture(name:String){Thread.sleep(1500);automation.waitForIdle(500,5000);val b=automation.takeScreenshot();java.io.File(ctx.getExternalFilesDir(null),"validation-05-$theme-$language-$name.png").outputStream().use{b.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};b.recycle()}
        try {
            seek(t.getString("upscale"));top()
            val picture=nodes(automation.rootInActiveWindow).first{it.contentDescription?.toString()==t.getString("original")}
            val bounds=android.graphics.Rect();picture.getBoundsInScreen(bounds)
            assertEquals("Portrait preview must preserve the source shape",0.5,bounds.width().toDouble()/bounds.height(),0.02)
            capture("prepare")
            tap(t.getString("profileTitle")+": "+t.getJSONObject("presets").getJSONObject("standard").getString("title"),true)
            waitText(t.getString("profileTitle"));Thread.sleep(1000);capture("models");tap(t.getJSONObject("presets").getJSONObject("art").getString("title"),true)
            tap(t.getString("profileTitle")+": "+t.getJSONObject("presets").getJSONObject("art").getString("title"),true);tap(t.getJSONObject("presets").getJSONObject("pixel").getString("title"),true)
            tap(t.getString("upscale"),true)
            val until=System.currentTimeMillis()+30000
            while(SessionStore.snapshot().getString("state")!="SUCCEEDED" && System.currentTimeMillis()<until)Thread.sleep(100)
            assertEquals(SessionStore.snapshot().toString(),"SUCCEEDED",SessionStore.snapshot().getString("state"))
            top();seek(t.getString("done"));tap(t.getString("before"),true);tap(t.getString("after"),true);tap(t.getString("compare"),true)
            tap("WebP",true);seek(t.getString("webpNote"));capture("result");tap(t.getString("save"),true);Thread.sleep(1000);if(match(t.getString("rateTitle"))!=null)tap(t.getString("notNow"),true);seek(t.getString("saved"))
            top();tap(t.getString("settings"));tap(t.getString("cacheHelpTitle"),true);seek(t.getString("cacheHelpBody"));tap(t.getString("understood"),true)
            tap(t.getString("cacheNo"),true);seek(t.getString("cacheLimitNote"))
            assertEquals(0,prefs.getInt("cacheLimitMiB",-1));assertEquals("Current result survives a retention change","SUCCEEDED",SessionStore.snapshot().getString("state"))
            tap(t.getString("issues"),true);seek(t.getString("email"));capture("feedback")
            if(InstrumentationRegistry.getArguments().getString("feedbackDelivery")=="true") {
                fun enter(label:String,value:String){val node=nodes(automation.rootInActiveWindow).first{it.contentDescription?.toString()==label && it.isEditable};assertTrue(node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,android.os.Bundle().apply{putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,value)}))}
                enter(t.getString("email"),"kirillborichevskiy+upselora-test@gmail.com")
                enter(t.getString("message"),"Upselora 0.5 Android device feedback delivery test. No reply required.")
                tap(t.getString("send"),true);seek(t.getString("feedbackSuccess"));capture("sent")
                println("Feedback sent from the real Android form")
            }
            top();tap(t.getString("back"));top();tap(t.getString("back"))
            println("Support/models/portrait/WebP/retention language=$language theme=$theme OK")
        } finally {
            val exports=SessionStore.snapshot().getJSONArray("exports");for(i in 0 until exports.length())ctx.contentResolver.delete(android.net.Uri.parse(exports.getJSONObject(i).getString("uri")),null,null)
            prefs.edit().putString("language",oldLanguage).putString("theme",oldTheme).putString("format",oldFormat).putInt("cacheLimitMiB",oldLimit).commit()
            instrumentation.runOnMainSync{activity.finish()};file.delete();SessionStore.discard()
            // Explicit cleanup of counters created only by QA of this newly introduced feature.
            if(InstrumentationRegistry.getArguments().getString("cleanupTestCounters")=="true")prefs.edit().remove("savedJobs").remove("reviewPrompts").remove("reviewShownAt").remove("notificationHintCount").commit()
        }
    }

    @Test fun languageSwitchDuringJobBackgroundComparisonAndExport() {
        val prefs=ctx.getSharedPreferences("settings",0)
        val oldLanguage=prefs.getString("language","system");val oldTheme=prefs.getString("theme","system");val oldFormat=prefs.getString("format","png")
        val withNotice=InstrumentationRegistry.getArguments().getString("notifications")?.let{it=="true"} ?: androidx.core.app.NotificationManagerCompat.from(ctx).areNotificationsEnabled()
        val manager=ctx.getSystemService(android.app.NotificationManager::class.java)
        val originalChannel=manager.getNotificationChannel("processing")
        val simulateBlockedChannel=!withNotice && android.os.Build.VERSION.SDK_INT<33
        if(simulateBlockedChannel) {
            manager.deleteNotificationChannel("processing")
            manager.createNotificationChannel(android.app.NotificationChannel("processing","Processing",android.app.NotificationManager.IMPORTANCE_NONE))
        }
        val theme=if(withNotice)"light" else "dark"
        prefs.edit().putString("language","en").putString("theme",theme).putString("format","png").remove("notificationDismissedSession").putInt("notificationHintCount",0).putInt("savedJobs",0).commit()
        SessionStore.init(ctx);SessionStore.discard()
        val width=InstrumentationRegistry.getArguments().getString("workflowSize")?.toInt() ?: 128
        val bitmap=android.graphics.Bitmap.createBitmap(width,width*3/4,android.graphics.Bitmap.Config.ARGB_8888)
        for(y in 0 until bitmap.height)for(x in 0 until bitmap.width)bitmap.setPixel(x,y,android.graphics.Color.rgb(x%256,(y*3)%256,(x+y)%256))
        val file=java.io.File(ctx.cacheDir,"workflow-input.png");ImageFiles.write(bitmap,file,"png");bitmap.recycle()
        val image=ImageFiles.import(ctx,android.net.Uri.fromFile(file));SessionStore.replace(image)
        val activity=instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val en=JSONObject(ctx.assets.open("locales/en.json").bufferedReader().use{it.readText()})
        val ar=JSONObject(ctx.assets.open("locales/ar.json").bufferedReader().use{it.readText()})
        fun shot(name:String){val b=automation.takeScreenshot();java.io.File(ctx.getExternalFilesDir(null),"validation-03-$name.png").outputStream().use{b.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};b.recycle()}
        try {
            seek(en.getString("upscale"));tap(en.getString("upscale"),true)
            seek(en.getString(if(withNotice)"backgroundTitle" else "returnTitle"))
            if(!withNotice){tap(en.getString("notNow"),true);assertNull(match(en.getString("enableNotifications")))}
            top();tap(en.getString("settings"));waitText(en.getString("language"))
            val row=nodes(automation.rootInActiveWindow).first{it.viewIdResourceName?.endsWith("language-picker")==true};click(row);Thread.sleep(500);tap("العربية",true)
            waitText(ar.getString("back"));assertEquals("ar",prefs.getString("language",null));top();tap(ar.getString("back"));seek(ar.getString(if(withNotice)"backgroundTitle" else "returnTitle"))
            assertTrue("Language switch must occur during the same job",SessionStore.busy())
            if(!withNotice)assertNull("Not now remains dismissed after language change",match(ar.getString("enableNotifications")))
            shot("$theme-ar-processing")
            if(withNotice) {
                val manager=ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                val allowed=listOf(ar.getString("processing"),ar.getString("finalizing"),ar.getString("imageReady"))
                val deadline=System.currentTimeMillis()+30000
                while(System.currentTimeMillis()<deadline && manager.activeNotifications.none{it.notification.extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() in allowed})Thread.sleep(500)
                assertTrue("Active notification adopts Arabic at next normal update",manager.activeNotifications.any{it.notification.extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() in allowed})
            }
            val homeTime=android.os.SystemClock.uptimeMillis()
                for(action in listOf(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.ACTION_UP))automation.injectInputEvent(android.view.KeyEvent(homeTime,android.os.SystemClock.uptimeMillis(),action,android.view.KeyEvent.KEYCODE_HOME,0),true)
                val pauseDeadline=System.currentTimeMillis()+5000
                while(automation.rootInActiveWindow?.packageName?.toString()==ctx.packageName && System.currentTimeMillis()<pauseDeadline)Thread.sleep(100)
                Thread.sleep(300)
            val until=System.currentTimeMillis()+300000
            while(SessionStore.busy() && System.currentTimeMillis()<until)Thread.sleep(500)
            assertEquals("SUCCEEDED",SessionStore.snapshot().getString("state"))
            resumeApp()
            top();waitText(ar.getString("done"));tap(ar.getString("before"),true);tap(ar.getString("after"),true);tap(ar.getString("compare"),true)
            shot("$theme-ar-result")
            tap(ar.getString("save"),true)
            val exportDeadline=System.currentTimeMillis()+30000
            while(SessionStore.snapshot().getJSONArray("exports").length()==0 && System.currentTimeMillis()<exportDeadline)Thread.sleep(100)
            assertTrue("PNG export: ${SessionStore.snapshot()}",SessionStore.snapshot().getJSONArray("exports").length()>0)
            seek(ar.getString("saved"))
            tap("JPEG",true);tap(ar.getString("save"),true)
            if(SessionStore.snapshot().getJSONObject("image").getBoolean("hasAlpha")) {
                waitText(ar.getString("alphaTitle"));tap(ar.getString("confirmJpeg"),true)
            }
            val jpegDeadline=System.currentTimeMillis()+30000
            while(SessionStore.snapshot().getJSONArray("exports").length()<2 && System.currentTimeMillis()<jpegDeadline)Thread.sleep(100)
            seek(ar.getString("saved"))
            assertEquals(2,SessionStore.snapshot().getJSONArray("exports").length())
            println("Workflow $theme notification=$withNotice, same-job Arabic switch, background, comparison, PNG/JPEG OK")
        } finally {
            prefs.edit().putString("language",oldLanguage).putString("theme",oldTheme).putString("format",oldFormat).commit()
            val exports=SessionStore.snapshot().getJSONArray("exports")
            for(i in 0 until exports.length())ctx.contentResolver.delete(android.net.Uri.parse(exports.getJSONObject(i).getString("uri")),null,null)
            if(SessionStore.busy())NativeEngine.cancel()
            val cleanupDeadline=System.currentTimeMillis()+60000
            while((SessionStore.workerAlive || SessionStore.serviceAlive) && System.currentTimeMillis()<cleanupDeadline)Thread.sleep(100)
            if(simulateBlockedChannel) {
                manager.deleteNotificationChannel("processing")
                if(originalChannel!=null)manager.createNotificationChannel(originalChannel)
            }
            instrumentation.runOnMainSync{activity.finish()};file.delete()
        }
    }

    @Test fun backgroundCardInEveryLanguageAndTheme() {
        val prefs=ctx.getSharedPreferences("settings",0)
        val oldLanguage=prefs.getString("language","system");val oldTheme=prefs.getString("theme","system")
        prefs.edit().putString("language","en").putString("theme","light").remove("notificationDismissedSession").putInt("notificationHintCount",0).putInt("savedJobs",0).commit()
        SessionStore.init(ctx);SessionStore.discard()
        val bitmap=android.graphics.Bitmap.createBitmap(1024,768,android.graphics.Bitmap.Config.ARGB_8888).apply{eraseColor(android.graphics.Color.BLUE)}
        val file=java.io.File(ctx.cacheDir,"language-cards.png");ImageFiles.write(bitmap,file,"png");bitmap.recycle()
        SessionStore.replace(ImageFiles.import(ctx,android.net.Uri.fromFile(file)))
        val activity=instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        fun dictionary(code:String)=JSONObject(ctx.assets.open("locales/$code.json").bufferedReader().use{it.readText()})
        var current=dictionary("en")
        val registry=org.json.JSONArray(ctx.assets.open("locales/registry.json").bufferedReader().use{it.readText()})
        try {
            waitText(current.getString("upscale"))
            tap(current.getString("upscale"),true)
            val startupDeadline=System.currentTimeMillis()+10000
            while(!SessionStore.workerAlive && System.currentTimeMillis()<startupDeadline)Thread.sleep(100)
            assertTrue("Service owns test job",SessionStore.workerAlive)
            for(theme in listOf("light","dark"))for(index in 0 until registry.length()) {
                val item=registry.getJSONObject(index)
                prefs.edit().putString("theme",theme).putString("language",item.getString("id")).commit()
                val homeTime=android.os.SystemClock.uptimeMillis()
                for(action in listOf(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.ACTION_UP))automation.injectInputEvent(android.view.KeyEvent(homeTime,android.os.SystemClock.uptimeMillis(),action,android.view.KeyEvent.KEYCODE_HOME,0),true)
                val pauseDeadline=System.currentTimeMillis()+5000
                while(automation.rootInActiveWindow?.packageName?.toString()==ctx.packageName && System.currentTimeMillis()<pauseDeadline)Thread.sleep(100)
                Thread.sleep(300)
                resumeApp()
                Thread.sleep(500)
                current=dictionary(item.getString("id"));top()
                val granted=androidx.core.app.NotificationManagerCompat.from(ctx).areNotificationsEnabled()
                seek(current.getString(if(granted)"backgroundTitle" else "returnTitle"))
                seek(current.getString(if(granted)"backgroundBody" else "returnBody"))
                assertTrue("Card belongs to an actual active job",SessionStore.busy())
                val shot=automation.takeScreenshot();java.io.File(ctx.getExternalFilesDir(null),"validation-03-card-$theme-${item.getString("id")}.png").outputStream().use{shot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};shot.recycle()
                println("Background card locale=${item.getString("id")} theme=$theme OK")
            }
            tap(current.getString("cancelJob"),true)
            val deadline=System.currentTimeMillis()+60000
            while((SessionStore.workerAlive || SessionStore.serviceAlive) && System.currentTimeMillis()<deadline)Thread.sleep(200)
            assertEquals("CANCELLED",SessionStore.snapshot().getString("state"))
        } finally {
            val exports=SessionStore.snapshot().getJSONArray("exports")
            for(i in 0 until exports.length())ctx.contentResolver.delete(android.net.Uri.parse(exports.getJSONObject(i).getString("uri")),null,null)
            if(SessionStore.busy())NativeEngine.cancel()
            val cleanupDeadline=System.currentTimeMillis()+60000
            while((SessionStore.workerAlive || SessionStore.serviceAlive) && System.currentTimeMillis()<cleanupDeadline)Thread.sleep(100)
            prefs.edit().putString("language",oldLanguage).putString("theme",oldTheme).commit()
            instrumentation.runOnMainSync{activity.finish()};file.delete()
        }
    }

}
