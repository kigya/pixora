#pragma once
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <ImageIO/ImageIO.h>
#include <vector>
#include <functional>
NSBundle* PixoraAssets(NSBundle* appBundle=NSBundle.mainBundle);
[[noreturn]] void PixoraFail(NSString* code);
namespace upscale {struct Model;}
namespace pixora {
struct ImageAPI {
 decltype(&CGBitmapContextCreate) context;
 decltype(&CGBitmapContextCreateImage) image;
 decltype(&CGImageSourceCreateThumbnailAtIndex) thumbnail;
 decltype(&CGImageDestinationCreateWithData) destination;
 decltype(&CGImageDestinationFinalize) finalize;
 decltype(&CGImageSourceCopyPropertiesAtIndex) properties;
 decltype(&CGImageSourceGetType) type;
 decltype(&CGImageSourceGetCount) count;
 bool (*write)(NSData*,NSURL*);
};
const ImageAPI& imageAPI();
int loadModel(void* net,const upscale::Model& model,NSBundle* bundle=PixoraAssets());
struct Image {
 int width=0,height=0;
 std::vector<uint8_t> rgba;
};
void copyBounded(NSInputStream* input,NSOutputStream* output);
void copyImport(NSURL* source,NSURL* destination);
Image decode(NSURL* url,int maxSide,const ImageAPI& api=imageAPI());
Image resize(const Image& source,int width,int height,bool nearest=false,const ImageAPI& api=imageAPI());
NSData* encode(const Image& image,NSString* format,const ImageAPI& api=imageAPI());
bool write(const Image& image,NSURL* url,NSString* format,const ImageAPI& api=imageAPI());
NSDictionary* inspect(NSURL* url,const ImageAPI& api=imageAPI());
bool finish(Image& image,const Image& original,NSString* preset,const std::function<bool()>& cancelled,const ImageAPI& api=imageAPI());
}
