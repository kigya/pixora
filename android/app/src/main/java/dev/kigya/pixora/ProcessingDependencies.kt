package dev.kigya.pixora

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONObject
import java.io.File

/** System boundaries can be controlled in tests; production always uses local AI. */
interface ProcessingBackend {
    fun processProfile(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,mode:String,testGPU:Boolean):Int=process(context,input,output,gpu,tile,callback,mode=="fast",testGPU)
    fun gpuAvailable():Boolean
    fun process(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,fast:Boolean,testGPU:Boolean):Int
}
object OnDeviceBackend:ProcessingBackend {
    override fun processProfile(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,mode:String,testGPU:Boolean)=NativeEngine.processProfile(context.assets,input,output,gpu,tile,callback,ProcessingProfiles.nativeId(mode),testGPU)
    override fun gpuAvailable()=NativeEngine.gpuAvailable()
    override fun process(context:Context,input:Bitmap,output:Bitmap,gpu:Boolean,tile:Int,callback:ProgressCallback,fast:Boolean,testGPU:Boolean)=NativeEngine.processWithModel(context.assets,input,output,gpu,tile,callback,fast,testGPU)
}
interface WorkFiles {
    fun prepare(image:JSONObject):File
    fun decode(file:File):Bitmap?
    fun createOutput(input:Bitmap):Bitmap
    fun half(full:Bitmap):Bitmap
    fun write(bitmap:Bitmap,file:File)
    fun dimensions(file:File):Pair<Int,Int>
    fun preview(bitmap:Bitmap,dir:File):String
}
object AndroidWorkFiles:WorkFiles {
    override fun prepare(image:JSONObject)=ImageFiles.prepare(image)
    override fun decode(file:File)=BitmapFactory.decodeFile(file.path)
    override fun createOutput(input:Bitmap)=Bitmap.createBitmap(input.width*4,input.height*4,Bitmap.Config.ARGB_8888).apply{setHasAlpha(input.hasAlpha())}
    override fun half(full:Bitmap)=Bitmap.createScaledBitmap(full,full.width/2,full.height/2,true)
    override fun write(bitmap:Bitmap,file:File)=ImageFiles.write(bitmap,file,"png")
    override fun dimensions(file:File):Pair<Int,Int> {
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
        BitmapFactory.decodeFile(file.path,bounds)
        return bounds.outWidth to bounds.outHeight
    }
    override fun preview(bitmap:Bitmap,dir:File)=ImageFiles.preview(bitmap,dir)
}
