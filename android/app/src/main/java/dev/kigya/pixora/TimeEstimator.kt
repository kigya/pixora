package dev.kigya.pixora

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.*

/** Local observations only. Tile area includes actual clipped context padding. */
class TimeEstimator(context:Context,model:String,backend:String,private val width:Int,private val height:Int,private val tile:Int,profile:String,speed:String,scale:Int,private val outputPixels:Long=width.toLong()*height*scale*scale,private val elapsed:()->Long) {
    private val preferences=context.getSharedPreferences("processing-estimates",Context.MODE_PRIVATE)
    private val padding=ProcessingProfiles.padding(profile)
    private val key="${BuildConfig.VERSION_NAME}:$model:$backend:$tile:$profile:$speed:$scale:pad$padding"
    private val history=try{
        val raw=JSONArray(preferences.getString(key,"[]"));val valid=JSONArray()
        for(i in 0 until raw.length()) {
            val item=raw.optJSONObject(i) ?: continue
            val rate=item.optDouble("rate",Double.NaN);val overhead=item.optDouble("overhead",Double.NaN)
            if(rate.isFinite() && rate>0 && overhead.isFinite() && overhead>=0)valid.put(item)
        }
        valid
    }catch(_:Exception){JSONArray()}
    private val nx=(width+tile-1)/tile
    private val areas=DoubleArray(nx*((height+tile-1)/tile)){i->val x=i%nx*tile;val y=i/nx*tile;(min(width,x+tile+padding)-max(0,x-padding)).toDouble()*(min(height,y+tile+padding)-max(0,y-padding))}
    private val total=areas.sum()
    private var completed=0.0
    private var previousDone=0
    private var previousTime=0L
    private var rate:Double?=null
    private var lastPublication=-1000L
    private fun overhead():Double {
        if(history.length()==0)return 0.0
        return (0 until history.length()).sumOf{history.getJSONObject(it).getDouble("overhead")*outputPixels/max(1L,history.getJSONObject(it).optLong("outputPixels",outputPixels))}/history.length()
    }
    fun begin(loading:Boolean=false) {
        previousTime=elapsed()
        SessionStore.update(false){for(k in listOf("estimatedTotalLowMs","estimatedTotalHighMs","remainingLowMs","remainingHighMs"))it.remove(k)}
        if(history.length()>0) {
            rate=(0 until history.length()).sumOf{history.getJSONObject(it).getDouble("rate")}/history.length()
            publish(total*rate!!+overhead()+if(loading)(0 until history.length()).sumOf{history.getJSONObject(it).optDouble("modelLoad",0.0)}/history.length() else 0.0,true)
        }
    }
    fun tileDone(done:Int) {
        val now=elapsed();val bounded=done.coerceIn(previousDone,areas.size)
        var area=0.0;for(i in previousDone until bounded)area+=areas[i]
        if(area>0) {
            val observation=max(1,now-previousTime)/area
            rate=rate?.let{.75*it+.25*observation} ?: observation
            completed+=area;previousDone=bounded;previousTime=now
        }
        if(done>=2 && done<areas.size)publish((total-completed)*rate!!+overhead(),false)
    }
    private fun publish(remaining:Double,force:Boolean) {
        val now=elapsed();if(!force && now-lastPublication<1000)return
        lastPublication=now
        val low=max(1000L,(remaining*.8).roundToLong());val high=max(low,(remaining*1.5).roundToLong())
        SessionStore.update(false){it.put("remainingLowMs",low).put("remainingHighMs",high).put("estimatedTotalLowMs",now+low).put("estimatedTotalHighMs",now+high)}
    }
    fun remember(inferenceMs:Double,finalizationMs:Long,modelLoadMs:Double=0.0) {
        if(inferenceMs<=0 || total<=0)return
        val values=JSONArray();for(i in max(0,history.length()-9) until history.length())values.put(history.getJSONObject(i))
        values.put(JSONObject().put("rate",inferenceMs/total).put("overhead",max(0.0,finalizationMs.toDouble())).put("modelLoad",modelLoadMs).put("outputPixels",outputPixels))
        preferences.edit().putString(key,values.toString()).apply()
    }
}
