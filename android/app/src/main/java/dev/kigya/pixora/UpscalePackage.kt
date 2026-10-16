package dev.kigya.pixora
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
class UpscalePackage:BaseReactPackage(){
 override fun getModule(name:String,context:ReactApplicationContext):NativeModule?=if(name==UpscaleModule.NAME)UpscaleModule(context)else null
 override fun getReactModuleInfoProvider()=ReactModuleInfoProvider{mapOf(UpscaleModule.NAME to ReactModuleInfo(UpscaleModule.NAME,UpscaleModule.NAME,false,false,false,true))}
}
