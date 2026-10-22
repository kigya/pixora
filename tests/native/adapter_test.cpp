#include <cassert>
#include <net.h>
extern "C" int omp_get_num_places(){return 0;}
#ifndef UPSCALE_ANDROID_SHIM
#define UPSCALE_ANDROID_SHIM "../../android/app/src/main/cpp/engine/upscale.cpp"
#endif
#include UPSCALE_ANDROID_SHIM
#include <atomic>
#include <vector>
using ncnn::fault;
static void sharedProcessRejectsInvalidBoundaryViews() {
    using namespace upscale;
    std::vector<uint8_t> source(4*4*4),target(16*16*4);
    PixelsView input{source.data(),4,4,16},output{target.data(),16,16,64};
    std::atomic<bool> cancelled{false};
    int stages=0,loads=0;
    bool cancelAtFinalTiming=false;
    Callbacks callbacks{
        [&](int,int){return true;},
        [&](int){++stages;return true;},
        [&](int kind,double){if(cancelAtFinalTiming && kind==4)cancelled.store(true);return true;}
    };
    auto load=[&](void*,const Model&){++loads;return 0;};
    auto run=[&](PixelsView in,PixelsView out,int tile=32,int profile=0) {
        stages=0;loads=0;cancelled.store(false);
        const int status=process(in,out,false,tile,profile,false,cancelled,callbacks,load);
        assert(stages==0 && loads==0);
        return status;
    };
    assert(run({nullptr,4,4,16},output)==-2);
    assert(run(input,{nullptr,16,16,64})==-2);
    assert(run({source.data(),0,4,0},output)==-2);
    assert(run({source.data(),4,0,16},output)==-2);
    assert(run(input,{target.data(),15,16,64})==-2);
    assert(run(input,{target.data(),16,15,64})==-2);
    assert(run(input,{target.data(),16,16,63})==-2);
    assert(run(input,{target.data(),15,16,64})==-2);
    assert(run(input,{target.data(),16,15,64})==-2);
    assert(run({source.data(),4,4,15},output)==-2);
    assert(run({source.data(),1025,4,4100}, {target.data(),4100,16,65600})==-2);
    assert(run({source.data(),4,1025,16}, {target.data(),16,4100,256})==-2);
    assert(run(input,output,31)==-2);
    assert(run(input,output,32,-1)==-4);
    assert(run(input,output,32,5)==-4);
    stages=0;loads=0;cancelAtFinalTiming=true;cancelled.store(false);
    assert(process(input,output,false,32,0,false,cancelled,callbacks,load)==1);
    assert(cancelled.load() && stages==2 && loads==1);
}
int main(){
    assert(upscale::paddingFor(0)==64 && upscale::paddingFor(2)==64 && upscale::paddingFor(4)==64);
    assert(upscale::paddingFor(1)==32 && upscale::paddingFor(3)==32);
    sharedProcessRejectsInvalidBoundaryViews();
    assert(JNI_OnLoad(nullptr,nullptr)==JNI_VERSION_1_6);
    JNIEnv env;AAssetManager assets;FakeBitmap in(33,35),out(132,140);
    assert(std::string(Java_dev_kigya_pixora_NativeEngine_feedbackEndpoint(&env,nullptr))=="x");
    auto reset=[&]{env=JNIEnv{};fault=ncnn::Fault{};Java_dev_kigya_pixora_NativeEngine_resetCancellation(nullptr,nullptr);};
    auto invoke=[&](bool gpu=false,bool fast=false,bool test=false,int tile=32)->int{
        return Java_dev_kigya_pixora_NativeEngine_processWithModel(&env,nullptr,&assets,&in,&out,gpu,tile,&env,fast,test);
    };
    reset();assert(invoke()==0);assert(Java_dev_kigya_pixora_NativeEngine_process(&env,nullptr,&assets,&in,&out,false,32,&env)==0);
    for(bool gpu:{false,true})for(bool fast:{false,true})for(bool check:{false,true}){reset();assert(invoke(gpu,fast,check)==0);}
    reset();assert(Java_dev_kigya_pixora_NativeEngine_gpuAvailable(nullptr,nullptr));fault.gpuCount=0;assert(!Java_dev_kigya_pixora_NativeEngine_gpuAvailable(nullptr,nullptr));assert(invoke(true)==-3);
    for(auto bitmap:{&in,&out}){
        reset();bitmap->infoCode=1;assert(invoke()==-2);bitmap->infoCode=0;
        bitmap->info.format=0;assert(invoke()==-2);bitmap->info.format=1;
        bitmap->lockCode=1;assert(invoke()==-2);bitmap->lockCode=0;
    }
    for(bool gpu:{false,true})for(int error:{1,2}){
        reset();in.throwCode=error;assert(invoke(gpu)==(error==1?-5:gpu?-3:-6));
        assert(Java_dev_kigya_pixora_NativeEngine_process(&env,nullptr,&assets,&in,&out,gpu,32,&env)==(error==1?-5:gpu?-3:-6));in.throwCode=0;
    }
    reset();out.info.width--;assert(invoke()==-2);out.info.width++;
    out.info.height--;assert(invoke()==-2);out.info.height++;
    in.info.width=1025;out.info.width=4100;assert(invoke()==-2);in.info.width=33;out.info.width=132;
    in.info.height=1025;out.info.height=4100;assert(invoke()==-2);in.info.height=35;out.info.height=140;
    assert(invoke(false,false,false,31)==-2);
    for(auto name:{"onProgress","onStage","onTiming"}){reset();env.missing=name;assert(invoke()==-2);}
    reset();assert(Java_dev_kigya_pixora_NativeEngine_processWithModel(&env,nullptr,nullptr,&in,&out,false,32,&env,false,false)==-4);
    reset();fault.param=-1;assert(invoke()==-4);reset();fault.model=-1;assert(invoke()==-4);
    reset();Java_dev_kigya_pixora_NativeEngine_cancel(nullptr,nullptr);assert(invoke()==1);
    reset();env.stageHook=[](int stage){if(stage==1)cancelled.store(true);};assert(invoke()==1);
    reset();fault.extractHook=[]{cancelled.store(true);};assert(invoke()==1);
    reset();env.progressHook=[]{cancelled.store(true);};assert(invoke()==1);
    reset();env.proceed=false;assert(invoke()==1);
    for(int call:{1,2,3,4,5,6,7,8,9,10}){reset();env.throwAt=call;assert(invoke()!=0);}
    for(int call:{1,2,3,4,5,6,7,8,9,10}){reset();env.throwAt=call;assert(invoke(true,true,true)!=0);}
    reset();fault.fromEmpty=true;assert(invoke()==-5);
    for(bool gpu:{false,true}) {
        reset();fault.inputAt=1;assert(invoke(gpu)==(gpu?-3:-6));
        reset();fault.extractAt=1;assert(invoke(gpu)==(gpu?-3:-6));
        reset();fault.emptyAt=1;assert(invoke(gpu)==(gpu?-3:-6));
        reset();fault.bits=16;assert(invoke(gpu)==0);
        reset();fault.pack=4;assert(invoke(gpu)==0);
        reset();fault.bits=16;fault.castEmpty=true;assert(invoke(gpu)==-5);
        reset();fault.pack=4;fault.castEmpty=true;assert(invoke(gpu)==-5);
        for(int property:{0,1,2,3}){reset();if(property==0)fault.bits=8;if(property==1)fault.wrongC=1;if(property==2)fault.wrongW=1;if(property==3)fault.wrongH=1;assert(invoke(gpu)==(gpu?-3:-6));}
        reset();fault.nan=true;assert(invoke(gpu)==(gpu?-3:-6));
    }
    for(int property=0;property<12;property++) {
        reset();if(property==0)fault.inputAt=1;if(property==1)fault.extractAt=1;if(property==2)fault.emptyAt=1;
        if(property==3)fault.bits=16;if(property==4)fault.pack=4;
        if(property==5)fault.wrongW=1;if(property==6)fault.wrongH=1;if(property==7)fault.wrongC=1;
        if(property==8)fault.nan=true;if(property==9)fault.constant=true;if(property==10){fault.bits=16;fault.castEmpty=true;}
        if(property==11)fault.nanLast=true;
        assert(invoke(true,true,true)==((property==3 || property==4)?0:-3));
    }
    for(int profile:{-1,0,1,2,3,4,5})for(bool gpu:{false,true}) {
        reset();assert(Java_dev_kigya_pixora_NativeEngine_processProfile(&env,nullptr,&assets,&in,&out,gpu,32,&env,profile,false)==(profile<0 || profile>4?-4:0));
    }
    for(int error:{1,2})for(bool gpu:{false,true}) {
        reset();in.throwCode=error;assert(Java_dev_kigya_pixora_NativeEngine_processProfile(&env,nullptr,&assets,&in,&out,gpu,32,&env,2,false)==(error==1?-5:gpu?-3:-6));in.throwCode=0;
    }
    Java_dev_kigya_pixora_NativeEngine_setCoveragePath(&env,nullptr,"unused");
    Java_dev_kigya_pixora_NativeEngine_flushCoverage(&env,nullptr);
}
