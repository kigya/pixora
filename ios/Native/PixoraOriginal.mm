#import "PixoraImages.h"
#import <CoreImage/CoreImage.h>
#include "engine.h"
#include "raster.h"
#include <algorithm>
#include <atomic>
#include <memory>
#include <stdexcept>
#include <cstring>

namespace pixora {
NSDictionary* inspectOutput(NSURL* url) {
 NSNumber* size=nil;[url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(size.longLongValue<=0)PixoraFail(@"INFERENCE_FAILED");
 CGImageSourceRef source=CGImageSourceCreateWithURL((__bridge CFURLRef)url,nullptr);if(!source)PixoraFail(@"INFERENCE_FAILED");
 NSDictionary* properties=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,nullptr));CFRelease(source);
 return @{@"width":properties[(id)kCGImagePropertyPixelWidth]?:@0,@"height":properties[(id)kCGImagePropertyPixelHeight]?:@0};
}

bool processOriginal(NSURL* source,NSURL* destination,NSString* profile,int width,int height,int scale,std::atomic<bool>& cancelled,const upscale::Callbacks& callbacks,const std::function<bool()>& shouldCancel) {
 if(!upscale::originalSizeAllowed(width,height,scale))PixoraFail(@"DIMENSIONS_TOO_LARGE");
 NSURL* raw=[destination URLByAppendingPathExtension:@"rgba.partial"];
 NSURL* png=[destination URLByAppendingPathExtension:@"partial"];
 @try {try {
  CIImage* image=[CIImage imageWithContentsOfURL:source options:@{kCIImageApplyOrientationProperty:@YES}];
  if(!image)PixoraFail(@"DECODE_FAILED");
  CGRect extent=image.extent;
  if((int)extent.size.width!=width || (int)extent.size.height!=height)PixoraFail(@"DECODE_FAILED");
  image=[image imageByApplyingTransform:CGAffineTransformMakeTranslation(-extent.origin.x,-extent.origin.y)];
  CGColorSpaceRef color=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CIContext* context=[CIContext contextWithOptions:@{kCIContextCacheIntermediates:@NO,kCIContextUseSoftwareRenderer:@YES,kCIContextWorkingColorSpace:(__bridge id)color,kCIContextOutputColorSpace:(__bridge id)color}];
  CGColorSpaceRelease(color);
  upscale::Raster raster(raw.fileSystemRepresentation,width*scale,height*scale,true);
  const bool pixel=[profile isEqual:@"pixel"];
  const int selected=[profile isEqual:@"lite"]?1:[profile isEqual:@"art"]?2:[profile isEqual:@"natural"]?4:0;
  const int padding=pixel?0:upscale::paddingFor(selected);
  const int nx=(width+255)/256,ny=(height+255)/256,total=nx*ny;
  if(!callbacks.stage(0))return false;
  for(int ty=0;ty<ny;ty++)for(int tx=0;tx<nx;tx++) {@autoreleasepool {
   if(shouldCancel())return false;
   const int x=tx*256,y=ty*256,right=std::min(width,x+256),bottom=std::min(height,y+256);
   const int left=std::max(0,x-padding),top=std::max(0,y-padding),r=std::min(width,right+padding),b=std::min(height,bottom+padding);
   CGImageRef region=[context createCGImage:image fromRect:CGRectMake(left,height-b,r-left,b-top)];
   if(!region)PixoraFail(@"DECODE_FAILED");
   Image input;input.width=r-left;input.height=b-top;input.rgba.resize((size_t)input.width*input.height*4);
   CGColorSpaceRef space=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
   CGContextRef bitmap=CGBitmapContextCreate(input.rgba.data(),input.width,input.height,8,input.width*4,space,kCGImageAlphaPremultipliedLast|kCGBitmapByteOrder32Big);CGColorSpaceRelease(space);
   if(!bitmap){CGImageRelease(region);PixoraFail(@"LOW_MEMORY");}
   CGContextDrawImage(bitmap,CGRectMake(0,0,input.width,input.height),region);CGContextRelease(bitmap);CGImageRelease(region);
   Image full;full.width=input.width*4;full.height=input.height*4;full.rgba.resize((size_t)full.width*full.height*4);
   if([profile isEqual:@"pixel"])full=resize(input,full.width,full.height,true);
   else {
    upscale::Callbacks hooks;
    hooks.stage=[&](int){return !shouldCancel();};
    hooks.timing=[&](int stage,double value){return callbacks.timing(stage,value);};
    hooks.progress=[&](int,int){return !shouldCancel();};
    if(!callbacks.stage(1))return false;
    auto infer=[&](int tile)->int {try{return upscale::process({input.rgba.data(),input.width,input.height,input.width*4},{full.rgba.data(),full.width,full.height,full.width*4},false,tile,selected,false,cancelled,hooks,[&](void* net,const upscale::Model& model){return loadModel(net,model);});}catch(const std::bad_alloc&){return -5;}catch(const std::exception&){return -6;}};
    int code=infer(64);if(code==-5 && !shouldCancel()){std::fill(full.rgba.begin(),full.rgba.end(),0);code=infer(32);}
    if(code==1)return false;
    if(code)PixoraFail(code==-4?@"MODEL_INVALID":code==-5?@"LOW_MEMORY":@"INFERENCE_FAILED");
   }
   Image output=scale==4?std::move(full):resize(full,input.width*2,input.height*2,[profile isEqual:@"pixel"]);
   if(!finish(output,input,profile,shouldCancel))return false;
   raster.write({output.rgba.data(),output.width,output.height,output.width*4},x*scale,y*scale,(x-left)*scale,(y-top)*scale,(right-x)*scale,(bottom-y)*scale);
   if(!callbacks.progress(ty*nx+tx+1,total))return false;
  }}
  if(shouldCancel())return false;
  if(!raster.png(png.fileSystemRepresentation,shouldCancel))return false;
  if(shouldCancel())return false;
  [NSFileManager.defaultManager removeItemAtURL:destination error:nil];
  if(![NSFileManager.defaultManager moveItemAtURL:png toURL:destination error:nil])PixoraFail(@"LOW_STORAGE");
  return true;
 }catch(const std::runtime_error& error){if(std::strcmp(error.what(),"RASTER_IO_FAILED")==0)PixoraFail(@"LOW_STORAGE");throw;}} @finally {[NSFileManager.defaultManager removeItemAtURL:raw error:nil];[NSFileManager.defaultManager removeItemAtURL:png error:nil];}
}
}
