package dev.kigya.pixora

import android.content.Context
import java.io.File

/** Limits retained files between process launches, never active job storage or gallery. */
object RetentionPolicy {
    val limits=setOf(0,10,50,200,-1)
    fun bytes(file:File):Long = if(file.isFile)file.length() else file.listFiles()?.sumOf{bytes(it)} ?: 0L
    fun applyAtLaunch(ctx:Context) {
        val limit=ctx.getSharedPreferences("settings",0).getInt("cacheLimitMiB",-1)
        if(limit<0)return
        val sessions=File(ctx.filesDir,"sessions");val shares=File(ctx.cacheDir,"share")
        if(limit==0 || bytes(sessions)+bytes(shares)>limit*1048576L) {
            ImageFiles.cleanupShares(ctx,true)
            if(limit==0 || bytes(sessions)>limit*1048576L) {
                SessionStore.discard()
                // Only app-owned retained files: also clear orphaned imports after a crash.
                sessions.deleteRecursively()
            }
        }
    }
}
