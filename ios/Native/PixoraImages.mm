#import "PixoraImages.h"
#import <ImageIO/ImageIO.h>
#import <CommonCrypto/CommonDigest.h>
#include <libwebp/encode.h>
#include <cmath>
#include <algorithm>
#include <functional>
#include <memory>
#include "engine.h"
#include <net.h>
[[noreturn]] void PixoraFail(NSString* code) { @throw [NSException exceptionWithName:code reason:@"Operation failed" userInfo:nil]; }
NSBundle* PixoraAssets(NSBundle* appBundle) {
 NSURL* url=[appBundle URLForResource:@"PixoraAssets" withExtension:@"bundle"];
 return url?[NSBundle bundleWithURL:url]:[NSBundle bundleForClass:NSClassFromString(@"PixoraUpscale")];
}
namespace pixora {
static bool persistImage(NSData* data,NSURL* url){return [data writeToURL:url options:NSDataWritingAtomic error:nil];}
const ImageAPI& imageAPI(){static const ImageAPI api={CGBitmapContextCreate,CGBitmapContextCreateImage,CGImageSourceCreateThumbnailAtIndex,CGImageDestinationCreateWithData,CGImageDestinationFinalize,CGImageSourceCopyPropertiesAtIndex,CGImageSourceGetType,CGImageSourceGetCount,persistImage};return api;}
int loadModel(void* opaque,const upscale::Model& model,NSBundle* bundle) {
 auto& net=*static_cast<ncnn::Net*>(opaque);NSURL* param=[bundle URLForResource:[NSString stringWithUTF8String:model.param] withExtension:nil];NSURL* weights=[bundle URLForResource:[NSString stringWithUTF8String:model.weights] withExtension:nil];if(!param || !weights)return -1;return net.load_param(param.fileSystemRepresentation) || net.load_model(weights.fileSystemRepresentation);
}
void copyBounded(NSInputStream* input,NSOutputStream* output) {
 if(!input || !output)PixoraFail(@"SOURCE_UNAVAILABLE");
 const long long maximum=50LL*1024*1024;long long total=0;uint8_t buffer[65536];[input open];[output open];
 @try {for(;;){NSInteger count=[input read:buffer maxLength:std::min((long long)sizeof(buffer),maximum-total+1)];if(count<0)PixoraFail(@"SOURCE_UNAVAILABLE");if(!count)break;if(total+count>maximum)PixoraFail(@"FILE_TOO_LARGE");NSInteger offset=0;while(offset<count){NSInteger written=[output write:buffer+offset maxLength:count-offset];if(written<=0)PixoraFail(@"SOURCE_UNAVAILABLE");offset+=written;}total+=count;}}
 @finally{[input close];[output close];}
}
void copyImport(NSURL* source,NSURL* destination) {
 NSNumber* bytes=nil;[source getResourceValue:&bytes forKey:NSURLFileSizeKey error:nil];if(!bytes)PixoraFail(@"SOURCE_UNAVAILABLE");if(bytes.longLongValue>50LL*1024*1024)PixoraFail(@"FILE_TOO_LARGE");
 @try{copyBounded([NSInputStream inputStreamWithURL:source],[NSOutputStream outputStreamWithURL:destination append:NO]);}
 @catch(NSException* error){[NSFileManager.defaultManager removeItemAtURL:destination error:nil];@throw error;}
}
static CGImageRef cg(const Image& image,const ImageAPI& api) {
 CGColorSpaceRef color=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
 CGContextRef context=api.context((void*)image.rgba.data(),image.width,image.height,8,image.width*4,color,kCGImageAlphaPremultipliedLast|kCGBitmapByteOrder32Big);
 CGColorSpaceRelease(color);
 if(!context)PixoraFail(@"LOW_MEMORY");
 CGImageRef result=api.image(context);CGContextRelease(context);if(!result)PixoraFail(@"LOW_MEMORY");return result;
}
NSDictionary* inspect(NSURL* url,const ImageAPI& api) {
 NSNumber* bytes=nil;[url getResourceValue:&bytes forKey:NSURLFileSizeKey error:nil];
 if(bytes.longLongValue>50LL*1024*1024)PixoraFail(@"FILE_TOO_LARGE");
 CGImageSourceRef source=CGImageSourceCreateWithURL((__bridge CFURLRef)url,nullptr);
 if(!source)PixoraFail(@"DECODE_FAILED");
 NSString* type=(__bridge NSString*)api.type(source);
 NSDictionary* p=CFBridgingRelease(api.properties(source,0,nullptr));
 size_t count=api.count(source);CFRelease(source);
 NSString* mime=[type isEqual:@"public.png"]?@"image/png":[type isEqual:@"public.jpeg"]?@"image/jpeg":[type isEqual:@"org.webmproject.webp"] || [type isEqual:@"public.webp"]?@"image/webp":nil;
 if(!mime)PixoraFail(@"UNSUPPORTED_FORMAT");
 if(count!=1)PixoraFail(@"ANIMATED_IMAGE");
 int w=[p[(id)kCGImagePropertyPixelWidth] intValue],h=[p[(id)kCGImagePropertyPixelHeight] intValue];
 int orientation=[p[(id)kCGImagePropertyOrientation] intValue];if(orientation>=5 && orientation<=8)std::swap(w,h);
 if(w<1 || h<1)PixoraFail(@"DECODE_FAILED");
 if(w>20000 || h>20000 || (long long)w*h>50000000)PixoraFail(@"DIMENSIONS_TOO_LARGE");
 double factor=std::min(1.,1024./std::max(w,h));
 return @{@"mime":mime,@"size":bytes?:@0,@"width":@(w),@"height":@(h),@"workWidth":@(std::max(1,(int)(w*factor))),@"workHeight":@(std::max(1,(int)(h*factor))),@"hasAlpha":@([p[(id)kCGImagePropertyHasAlpha] boolValue]),@"needsPreparation":@(factor<1)};
}
Image decode(NSURL* url,int maxSide,const ImageAPI& api) {
 CGImageSourceRef source=CGImageSourceCreateWithURL((__bridge CFURLRef)url,nullptr);if(!source)PixoraFail(@"DECODE_FAILED");
 CGImageRef input=api.thumbnail(source,0,(__bridge CFDictionaryRef)@{(id)kCGImageSourceCreateThumbnailFromImageAlways:@YES,(id)kCGImageSourceCreateThumbnailWithTransform:@YES,(id)kCGImageSourceThumbnailMaxPixelSize:@(maxSide),(id)kCGImageSourceShouldCacheImmediately:@YES});
 CFRelease(source);if(!input)PixoraFail(@"DECODE_FAILED");
 std::unique_ptr<std::remove_pointer_t<CGImageRef>,decltype(&CGImageRelease)> retained(input,CGImageRelease);
 Image result;result.width=(int)CGImageGetWidth(input);result.height=(int)CGImageGetHeight(input);result.rgba.resize((size_t)result.width*result.height*4);
 CGColorSpaceRef color=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
 CGContextRef context=api.context(result.rgba.data(),result.width,result.height,8,result.width*4,color,kCGImageAlphaPremultipliedLast|kCGBitmapByteOrder32Big);CGColorSpaceRelease(color);
 if(!context)PixoraFail(@"LOW_MEMORY");
 CGContextDrawImage(context,CGRectMake(0,0,result.width,result.height),input);CGContextRelease(context);return result;
}
Image resize(const Image& source,int width,int height,bool nearest,const ImageAPI& api) {
 Image result;result.width=width;result.height=height;result.rgba.resize((size_t)width*height*4);
 if(nearest) {
  for(int y=0;y<height;y++)for(int x=0;x<width;x++)std::copy_n(source.rgba.data()+((size_t)(y*source.height/height)*source.width+x*source.width/width)*4,4,result.rgba.data()+((size_t)y*width+x)*4);
 } else {
  CGImageRef input=cg(source,api);CGColorSpaceRef color=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context=api.context(result.rgba.data(),width,height,8,width*4,color,kCGImageAlphaPremultipliedLast|kCGBitmapByteOrder32Big);CGColorSpaceRelease(color);
  if(!context){CGImageRelease(input);PixoraFail(@"LOW_MEMORY");}
  CGContextSetInterpolationQuality(context,kCGInterpolationHigh);CGContextDrawImage(context,CGRectMake(0,0,width,height),input);CGContextRelease(context);CGImageRelease(input);
 }
 return result;
}
NSData* encode(const Image& image,NSString* format,const ImageAPI& api) {
 if([format isEqual:@"webp"]) {
  // libwebp takes straight RGBA, while the shared engine owns premultiplied RGBA.
  std::vector<uint8_t> straight=image.rgba;
  for(size_t i=0;i<straight.size();i+=4)for(int c=0;c<3;c++)straight[i+c]=straight[i+3]?std::min(255,(int)straight[i+c]*255/straight[i+3]):0;
  uint8_t* output=nullptr;size_t size=WebPEncodeLosslessRGBA(straight.data(),image.width,image.height,image.width*4,&output);
  if(!size)PixoraFail(@"EXPORT_FAILED");NSData* result=[NSData dataWithBytes:output length:size];WebPFree(output);return result;
 }
 if(![format isEqual:@"png"] && ![format isEqual:@"jpeg"])PixoraFail(@"EXPORT_FAILED");
 Image flattened;
 const Image* selected=&image;
 if([format isEqual:@"jpeg"]) {
  flattened=image;for(size_t i=0;i<flattened.rgba.size();i+=4){int a=flattened.rgba[i+3];for(int c=0;c<3;c++)flattened.rgba[i+c]=std::min(255,(int)flattened.rgba[i+c]+255-a);flattened.rgba[i+3]=255;}selected=&flattened;
 }
 NSMutableData* data=[NSMutableData data];CGImageRef input=cg(*selected,api);
 CGImageDestinationRef output=api.destination((__bridge CFMutableDataRef)data,[format isEqual:@"png"]?CFSTR("public.png"):CFSTR("public.jpeg"),1,nullptr);
 if(!output){CGImageRelease(input);PixoraFail(@"EXPORT_FAILED");}
 CGImageDestinationAddImage(output,input,(__bridge CFDictionaryRef)@{(id)kCGImageDestinationLossyCompressionQuality:@.95});
 bool ok=api.finalize(output);CFRelease(output);CGImageRelease(input);if(!ok)PixoraFail(@"EXPORT_FAILED");return data;
}
bool write(const Image& image,NSURL* url,NSString* format,const ImageAPI& api) {return api.write(encode(image,format,api),url);}
bool finish(Image& image,const Image& original,NSString* preset,const std::function<bool()>& cancelled,const ImageAPI& api) {
 if([preset isEqual:@"balanced"]) {
  Image base=resize(original,image.width,image.height,false,api);
  for(int y=0;y<image.height;y++){if(cancelled())return false;for(int x=0;x<image.width;x++){size_t i=((size_t)y*image.width+x)*4;for(int c=0;c<3;c++){double a=image.rgba[i+3],ba=base.rgba[i+3];double value=a?image.rgba[i+c]*255./a:0;double background=ba?base.rgba[i+c]*255./ba:0;image.rgba[i+c]=(uint8_t)std::round((value*.8+background*.2)*a/255.);}}}
 } else if([preset isEqual:@"details"] || [preset isEqual:@"sharp"]) {
  double weights[7],sum=0;for(int k=0;k<7;k++){weights[k]=std::exp(-(k-3)*(k-3)/2.);sum+=weights[k];}for(auto& w:weights)w/=sum;
  auto luminance=[&](int x,int y){const auto* p=image.rgba.data()+((size_t)y*image.width+x)*4;double a=p[3];return a?(.2126*p[0]+.7152*p[1]+.0722*p[2])*255/a:0;};
  auto horizontal=[&](int y){std::vector<double> row(image.width);y=std::clamp(y,0,image.height-1);for(int x=0;x<image.width;x++)for(int k=0;k<7;k++)row[x]+=luminance(std::clamp(x+k-3,0,image.width-1),y)*weights[k];return row;};
  std::vector<double> ring[7];for(int k=0;k<7;k++)ring[k]=horizontal(k-3);
  double amount=[preset isEqual:@"sharp"]?.35:.15;
  for(int y=0;y<image.height;y++) {
   if(cancelled())return false;
   auto next=horizontal(y+4);
   for(int x=0;x<image.width;x++){size_t i=((size_t)y*image.width+x)*4;double blur=0;for(int k=0;k<7;k++)blur+=ring[(y+k)%7][x]*weights[k];double difference=luminance(x,y)-blur;if(std::abs(difference)>=3 && image.rgba[i+3])for(int c=0;c<3;c++){double straight=image.rgba[i+c]*255./image.rgba[i+3];image.rgba[i+c]=(uint8_t)std::round(std::clamp(straight+difference*amount,0.,255.)*image.rgba[i+3]/255.);}}
   ring[y%7]=std::move(next);
  }
 }
 return !cancelled();
}
}
