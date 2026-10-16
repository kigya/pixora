#import <XCTest/XCTest.h>
#import "../Native/PixoraImages.h"
#include "engine.h"
#include <atomic>
static NSDictionary* Metadata;
static int ContextCalls,FailContext;
static CGContextRef TestContext(void* data,size_t width,size_t height,size_t bits,size_t row,CGColorSpaceRef space,uint32_t info){if(++ContextCalls==FailContext)return nullptr;return CGBitmapContextCreate(data,width,height,bits,row,space,info);}
static CGImageRef NoImage(CGContextRef context){return nullptr;}
static CGImageRef NoThumbnail(CGImageSourceRef source,size_t index,CFDictionaryRef options){return nullptr;}
static CGImageDestinationRef NoDestination(CFMutableDataRef data,CFStringRef type,size_t count,CFDictionaryRef options){return nullptr;}
static bool FailedFinalize(CGImageDestinationRef destination){return false;}
static CFDictionaryRef TestProperties(CGImageSourceRef source,size_t index,CFDictionaryRef options){return (__bridge_retained CFDictionaryRef)Metadata;}
static size_t AnimatedCount(CGImageSourceRef source){return 2;}
static CFStringRef WebPType(CGImageSourceRef source){return CFSTR("public.webp");}
@interface EmptyAssets : NSObject
@end
@implementation EmptyAssets
- (NSURL*)URLForResource:(NSString*)resource withExtension:(NSString*)extension{return nil;}
@end
@interface PixoraImageFailureTests : XCTestCase
@end
@implementation PixoraImageFailureTests {
 NSURL* _folder;NSURL* _source;pixora::Image _image;
}
- (void)setUp{[super setUp];_folder=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString] isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:_folder withIntermediateDirectories:YES attributes:nil error:nil];_source=[_folder URLByAppendingPathComponent:@"image.png"];_image.width=3;_image.height=2;_image.rgba.assign(3*2*4,255);XCTAssertTrue(pixora::write(_image,_source,@"png"));ContextCalls=0;FailContext=1;}
- (void)tearDown{[NSFileManager.defaultManager removeItemAtURL:_folder error:nil];Metadata=nil;[super tearDown];}
- (void)testMetadataGuardsAndDecoderAliases {
 XCTAssertEqual(PixoraAssets((NSBundle*)[EmptyAssets new]),[NSBundle bundleForClass:NSClassFromString(@"PixoraUpscale")]);
 auto api=pixora::imageAPI();api.type=WebPType;XCTAssertEqualObjects(pixora::inspect(_source,api)[@"mime"],@"image/webp");api=pixora::imageAPI();api.count=AnimatedCount;XCTAssertThrowsSpecificNamed(pixora::inspect(_source,api),NSException,@"ANIMATED_IMAGE");
 api=pixora::imageAPI();api.properties=TestProperties;
 for(NSArray* dimensions in @[@[@0,@1],@[@1,@0]]){Metadata=@{(id)kCGImagePropertyPixelWidth:dimensions[0],(id)kCGImagePropertyPixelHeight:dimensions[1]};XCTAssertThrowsSpecificNamed(pixora::inspect(_source,api),NSException,@"DECODE_FAILED");}
 Metadata=@{(id)kCGImagePropertyPixelWidth:@10000,(id)kCGImagePropertyPixelHeight:@6000};XCTAssertThrowsSpecificNamed(pixora::inspect(_source,api),NSException,@"DIMENSIONS_TOO_LARGE");
 Metadata=@{(id)kCGImagePropertyPixelWidth:@7,(id)kCGImagePropertyPixelHeight:@5,(id)kCGImagePropertyOrientation:@9};XCTAssertEqual([pixora::inspect(_source,api)[@"width"] intValue],7);
}
- (void)testCodecAllocationAndFinalizationFailures {
 auto api=pixora::imageAPI();api.thumbnail=NoThumbnail;XCTAssertThrowsSpecificNamed(pixora::decode(_source,1024,api),NSException,@"DECODE_FAILED");
 api=pixora::imageAPI();api.context=TestContext;XCTAssertThrowsSpecificNamed(pixora::decode(_source,1024,api),NSException,@"LOW_MEMORY");ContextCalls=0;FailContext=2;XCTAssertThrowsSpecificNamed(pixora::resize(_image,6,4,false,api),NSException,@"LOW_MEMORY");
 api=pixora::imageAPI();api.image=NoImage;XCTAssertThrowsSpecificNamed(pixora::encode(_image,@"png",api),NSException,@"LOW_MEMORY");
 api=pixora::imageAPI();api.destination=NoDestination;XCTAssertThrowsSpecificNamed(pixora::encode(_image,@"png",api),NSException,@"EXPORT_FAILED");api=pixora::imageAPI();api.finalize=FailedFinalize;XCTAssertThrowsSpecificNamed(pixora::encode(_image,@"png",api),NSException,@"EXPORT_FAILED");
 XCTAssertFalse(pixora::write(_image,_folder,@"png"));
}
- (void)testInvalidModelContentsAreRejected {
 NSURL* bundleURL=[_folder URLByAppendingPathComponent:@"FaultAssets.bundle" isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:bundleURL withIntermediateDirectories:YES attributes:nil error:nil];[@{@"CFBundleIdentifier":@"dev.kigya.pixora.tests.assets",@"CFBundlePackageType":@"BNDL"} writeToURL:[bundleURL URLByAppendingPathComponent:@"Info.plist"] atomically:YES];
 [@"invalid model" writeToURL:[bundleURL URLByAppendingPathComponent:@"invalid.param"] atomically:YES encoding:NSUTF8StringEncoding error:nil];[[NSMutableData dataWithLength:4] writeToURL:[bundleURL URLByAppendingPathComponent:@"invalid.bin"] atomically:YES];[NSFileManager.defaultManager copyItemAtURL:[PixoraAssets() URLForResource:@"realesr-general-x4v3.param" withExtension:nil] toURL:[bundleURL URLByAppendingPathComponent:@"valid.param"] error:nil];NSBundle* bundle=[NSBundle bundleWithURL:bundleURL];XCTAssertNotNil(bundle);
 std::atomic<bool> cancelled{false};std::vector<uint8_t> output(3*2*16*4);upscale::Callbacks hooks;hooks.stage=[](int){return true;};hooks.timing=[](int,double){return true;};hooks.progress=[](int,int){return true;};
 for(upscale::Model model:{upscale::Model{"invalid.param","invalid.bin","in0","out0"},upscale::Model{"valid.param","invalid.bin","in0","out0"}}){auto load=[&](void* net,const upscale::Model&){return pixora::loadModel(net,model,bundle);};XCTAssertEqual(upscale::process({_image.rgba.data(),3,2,12},{output.data(),12,8,48},false,32,1,false,cancelled,hooks,load),-4);}
}
@end
