#import <XCTest/XCTest.h>
#import <ImageIO/ImageIO.h>
#import <PixoraNative/PixoraUpscale.h>
#import "../Native/PixoraImages.h"
#import "../Native/PixoraFeedback.h"
#import <objc/runtime.h>
#include "engine.h"
#include <atomic>
#include <stdexcept>
@interface PixoraUpscale (TestSurface)
- (NSDictionary*)import:(NSURL*)url;
- (NSMutableDictionary*)empty;
- (NSDictionary*)snapshot;
- (void)expireBackgroundTask;
- (BOOL)validateModels;
- (void)configureTelemetry;
- (void)invalidate;
- (void)restoreSession;
- (void)persist;
- (void)perform:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject work:(id (^)(void))work;
@end
@interface FailingPreferences : NSUserDefaults
@end
@implementation FailingPreferences
- (BOOL)synchronize{return NO;}
@end
static IMP ShareDirectoryListing;static NSString* ShareRaceFolder;static NSString* ShareRaceFile;static BOOL ShareRaceTriggered;
static NSArray* ListShares(id manager,SEL cmd,NSURL* directory,NSArray* keys,NSDirectoryEnumerationOptions options,NSError** error){NSArray* entries=((NSArray*(*)(id,SEL,NSURL*,NSArray*,NSDirectoryEnumerationOptions,NSError**))ShareDirectoryListing)(manager,cmd,directory,keys,options,error);if([directory.path isEqual:ShareRaceFolder])for(NSURL* file in entries)if([file.path isEqual:ShareRaceFile]){[file removeAllCachedResourceValues];[manager removeItemAtURL:file error:nil];ShareRaceTriggered=YES;}return entries;}
@interface PixoraNativeTests : XCTestCase
@end
@implementation PixoraNativeTests {
 PixoraUpscale* _module;
 NSURL* _folder;
}
- (void)setUp {
 [super setUp];_module=[PixoraUpscale new];
 _folder=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString] isDirectory:YES];
 [NSFileManager.defaultManager createDirectoryAtURL:_folder withIntermediateDirectories:YES attributes:nil error:nil];
 [_module setValue:_folder forKey:@"root"];[_module setValue:[_module empty] forKey:@"session"];
 NSUserDefaults* prefs=[[NSUserDefaults alloc] initWithSuiteName:[@"test." stringByAppendingString:NSUUID.UUID.UUIDString]];[_module setValue:prefs forKey:@"prefs"];[_module setValue:nil forKey:@"telemetryOverride"];[_module configureTelemetry];
}
- (void)tearDown {[_module invalidate];_module=nil;[NSFileManager.defaultManager removeItemAtURL:_folder error:nil];[super tearDown];}
- (id)await:(void (^)(RCTPromiseResolveBlock,RCTPromiseRejectBlock))operation error:(NSString**)error {
 XCTestExpectation* finished=[self expectationWithDescription:@"native promise"];__block id result=nil;__block NSString* code=nil;
 operation(^(id value){result=value;[finished fulfill];},^(NSString* key,NSString* message,NSError* nativeError){code=key;[finished fulfill];});
 [self waitForExpectations:@[finished] timeout:120];if(error)*error=code;else XCTAssertNil(code);return result;
}
- (NSURL*)fixture:(int)width height:(int)height {
 pixora::Image image;image.width=width;image.height=height;image.rgba.resize((size_t)width*height*4);
 for(int y=0;y<height;y++)for(int x=0;x<width;x++){size_t i=((size_t)y*width+x)*4;uint8_t alpha=x==0?0:x==1?128:255;image.rgba[i]=x*7%256*alpha/255;image.rgba[i+1]=y*11%256*alpha/255;image.rgba[i+2]=128*alpha/255;image.rgba[i+3]=alpha;}
 NSURL* path=[_folder URLByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingString:@".png"]];XCTAssertTrue(pixora::write(image,path,@"png"));return path;
}
- (NSDictionary*)state {return [self await:^(RCTPromiseResolveBlock resolve,RCTPromiseRejectBlock reject){[self->_module getCurrentSession:resolve reject:reject];} error:nil];}
- (NSDictionary*)waitTerminal {
 NSDate* deadline=[NSDate dateWithTimeIntervalSinceNow:120];NSDictionary* state=nil;
 do {state=[self state];if([@[@"SUCCEEDED",@"FAILED",@"CANCELLED",@"INTERRUPTED"] containsObject:state[@"state"]]){@synchronized(_module){if(![[_module valueForKey:@"working"] boolValue])return state;}}[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.02]];}while(deadline.timeIntervalSinceNow>0);
 XCTFail(@"native job did not finish");return state;
}
- (void)testColdSessionRestoreAndStorageFailure {
 NSURL* journal=[_folder URLByAppendingPathComponent:@"session.json"];
 for(id invalid in @[@[],@{},@{@"schemaVersion":@1},@{@"schemaVersion":@2,@"state":@4},@{@"schemaVersion":@2,@"state":@"READY",@"exports":@4},@{@"schemaVersion":@2,@"state":@"READY",@"exports":@[],@"image":@4}]){[[NSJSONSerialization dataWithJSONObject:invalid options:0 error:nil] writeToURL:journal atomically:YES];[_module restoreSession];XCTAssertEqualObjects([self state][@"state"],@"EMPTY");}
 [[NSJSONSerialization dataWithJSONObject:[_module empty] options:0 error:nil]writeToURL:journal atomically:YES];[_module restoreSession];XCTAssertEqualObjects([self state][@"state"],@"EMPTY");XCTAssertEqualObjects([self state][@"image"],NSNull.null);
 NSDictionary* image=[_module import:[self fixture:8 height:6]];NSString* identifier=image[@"id"];
 for(NSString* state in @[@"READY",@"RUNNING",@"SUCCEEDED"]){NSMutableDictionary* session=[_module valueForKey:@"session"];session[@"state"]=state;[session removeObjectForKey:@"resultPath"];[_module persist];[_module restoreSession];XCTAssertEqualObjects([self state][@"state"],[state isEqual:@"READY"]?@"READY":@"INTERRUPTED");}
 XCTAssertEqualObjects([self state][@"image"][@"id"],identifier);
 NSMutableDictionary* session=[_module valueForKey:@"session"];session[@"image"][@"sourcePath"]=@"/not-present";[_module persist];[_module restoreSession];XCTAssertEqualObjects([self state][@"state"],@"EMPTY");
 [_module import:[self fixture:8 height:6]];NSUserDefaults* prefs=[_module valueForKey:@"prefs"];[prefs setInteger:0 forKey:@"cacheLimitMiB"];[_module restoreSession];XCTAssertEqualObjects([self state][@"state"],@"EMPTY");XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:[_folder URLByAppendingPathComponent:@"sessions"].path]);
 NSString* error=nil;
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module perform:a reject:b work:^id{throw std::bad_alloc();}];} error:&error];XCTAssertEqualObjects(error,@"LOW_MEMORY");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module perform:a reject:b work:^id{throw std::runtime_error("test");}];} error:&error];XCTAssertEqualObjects(error,@"INFERENCE_FAILED");
 NSURL* missing=[_folder URLByAppendingPathComponent:@"missing/child" isDirectory:YES];[_module setValue:missing forKey:@"root"];XCTAssertThrows([_module persist]);XCTAssertNoThrow([_module expireBackgroundTask]);XCTAssertEqualObjects([_module snapshot][@"state"],@"CANCELLING");[_module restoreSession];XCTAssertEqualObjects([self state][@"state"],@"EMPTY");[_module setValue:_folder forKey:@"root"];
}
- (void)testFormatsAlphaAndMetadata {
 NSURL* source=[self fixture:7 height:5];NSDictionary* bounds=pixora::inspect(source);XCTAssertEqual([bounds[@"width"] intValue],7);XCTAssertTrue([bounds[@"hasAlpha"] boolValue]);
 pixora::Image original=pixora::decode(source,1024);XCTAssertEqual(original.width,7);XCTAssertEqual(original.rgba[3],0);
 pixora::Image nearest=pixora::resize(original,28,20,true);XCTAssertEqual(nearest.rgba[3],0);XCTAssertEqual(nearest.rgba[7*4+3],128);
 for(NSString* format in @[@"png",@"jpeg",@"webp"]){NSData* data=pixora::encode(original,format);XCTAssertGreaterThan(data.length,0u);NSURL* file=[_folder URLByAppendingPathComponent:format];XCTAssertTrue([data writeToURL:file atomically:YES]);NSDictionary* actual=pixora::inspect(file);XCTAssertEqual([actual[@"width"] intValue],7);pixora::Image decoded=pixora::decode(file,1024);XCTAssertEqual(decoded.height,5);if([format isEqual:@"jpeg"])XCTAssertEqual(decoded.rgba[3],255);else XCTAssertEqual(decoded.rgba[3],0);}
 XCTAssertThrows(pixora::encode(original,@"gif"));XCTAssertThrows(pixora::inspect([_folder URLByAppendingPathComponent:@"absent"]));XCTAssertThrows(pixora::decode([_folder URLByAppendingPathComponent:@"absent"],1024));
 for(NSString* preset in @[@"standard",@"balanced",@"sharp",@"details"]){pixora::Image copy=pixora::resize(original,28,20);XCTAssertTrue(pixora::finish(copy,original,preset,[]{return false;}));XCTAssertEqual(copy.rgba[3],0);XCTAssertFalse(pixora::finish(copy,original,preset,[]{return true;}));}
}
- (void)testImageValidationAndOrientation {
 NSURL* source=[self fixture:7 height:5];CGImageSourceRef reader=CGImageSourceCreateWithURL((__bridge CFURLRef)source,nullptr);CGImageRef cg=CGImageSourceCreateImageAtIndex(reader,0,nullptr);CFRelease(reader);
 for(int orientation=1;orientation<=8;orientation++){NSMutableData* data=[NSMutableData data];CGImageDestinationRef writer=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data,CFSTR("public.jpeg"),1,nullptr);CGImageDestinationAddImage(writer,cg,(__bridge CFDictionaryRef)@{(id)kCGImagePropertyOrientation:@(orientation)});XCTAssertTrue(CGImageDestinationFinalize(writer));CFRelease(writer);NSURL* file=[_folder URLByAppendingPathComponent:[NSString stringWithFormat:@"orientation-%d.jpg",orientation]];[data writeToURL:file atomically:YES];NSDictionary* bounds=pixora::inspect(file);XCTAssertEqual([bounds[@"width"] intValue],orientation>=5?5:7);pixora::Image decoded=pixora::decode(file,1024);XCTAssertEqual(decoded.width,orientation>=5?5:7);}
 NSMutableData* gif=[NSMutableData data];CGImageDestinationRef writer=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)gif,CFSTR("com.compuserve.gif"),1,nullptr);CGImageDestinationAddImage(writer,cg,nullptr);XCTAssertTrue(CGImageDestinationFinalize(writer));CFRelease(writer);CGImageRelease(cg);NSURL* unsupported=[_folder URLByAppendingPathComponent:@"unsupported.gif"];[gif writeToURL:unsupported atomically:YES];XCTAssertThrowsSpecificNamed(pixora::inspect(unsupported),NSException,@"UNSUPPORTED_FORMAT");
 NSURL* large=[_folder URLByAppendingPathComponent:@"large"];[NSData.data writeToURL:large atomically:YES];NSFileHandle* handle=[NSFileHandle fileHandleForWritingToURL:large error:nil];[handle truncateFileAtOffset:50LL*1024*1024+1];[handle closeFile];XCTAssertThrowsSpecificNamed(pixora::inspect(large),NSException,@"FILE_TOO_LARGE");
 for(NSArray* dimensions in @[@[@20001,@1],@[@1,@20001]]){NSURL* dimensionsFile=[self fixture:[dimensions[0] intValue] height:[dimensions[1] intValue]];XCTAssertThrowsSpecificNamed(pixora::inspect(dimensionsFile),NSException,@"DIMENSIONS_TOO_LARGE");}
 pixora::Image empty;XCTAssertThrowsSpecificNamed(pixora::encode(empty,@"png"),NSException,@"LOW_MEMORY");XCTAssertThrowsSpecificNamed(pixora::encode(empty,@"webp"),NSException,@"EXPORT_FAILED");pixora::Image original=pixora::decode(source,1024);XCTAssertThrowsSpecificNamed(pixora::resize(original,0,0),NSException,@"LOW_MEMORY");
 std::atomic<bool> cancelled{false};std::vector<uint8_t> output(7*5*16*4);upscale::Callbacks hooks;hooks.stage=[](int){return true;};hooks.timing=[](int,double){return true;};hooks.progress=[](int,int){return true;};
 for(upscale::Model model: {upscale::Model{"absent.param","absent.bin","in","out"},upscale::Model{"realesr-general-x4v3.param","absent.bin","in","out"}}){auto load=[&](void* net,const upscale::Model&){return pixora::loadModel(net,model);};XCTAssertEqual(upscale::process({original.rgba.data(),7,5,28},{output.data(),28,20,112},false,32,1,false,cancelled,hooks,load),-4);}
}
- (void)testConsentIsIndependentAndSettingsPersist {
 NSDictionary* settings=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getSettings:a reject:b];} error:nil];XCTAssertFalse([settings[@"languageChosen"] boolValue]);
 NSDictionary* initial=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getTelemetrySettings:a reject:b];} error:nil];XCTAssertTrue([initial[@"analytics"] boolValue]);XCTAssertTrue([initial[@"crashes"] boolValue]);XCTAssertEqual([initial[@"consentVersion"] intValue],0);
 NSUserDefaults* unresolved=[_module valueForKey:@"prefs"];[unresolved setInteger:1 forKey:@"consentVersion"];[unresolved setBool:NO forKey:@"analyticsConsent"];[unresolved setBool:NO forKey:@"crashConsent"];[unresolved setBool:YES forKey:@"noticeSeen"];initial=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getTelemetrySettings:a reject:b];} error:nil];XCTAssertTrue([initial[@"analytics"]boolValue]);XCTAssertTrue([initial[@"crashes"]boolValue]);XCTAssertEqual([initial[@"consentVersion"]intValue],1);
 for(int mask=0;mask<4;mask++){NSDictionary* value=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateTelemetrySettings:(mask&1)!=0 crashes:(mask&2)!=0 noticeSeen:YES resolve:a reject:b];} error:nil];XCTAssertEqual([value[@"analytics"] boolValue],(mask&1)!=0);XCTAssertEqual([value[@"crashes"] boolValue],(mask&2)!=0);XCTAssertEqual([value[@"consentVersion"] intValue],2);}
 [_module logTelemetryEvent:@"not_allowed" parameters:@"{}"];[_module logTelemetryEvent:@"ui_action" parameters:@"{\"action\":\"test\",\"filename\":\"private.png\",\"value\":\"text with spaces\"}"];
 for(NSString* language in @[@"ru",@"ar",@"he",@"system"]){NSDictionary* value=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateSettings:language format:@"webp" theme:@"dark" resolve:a reject:b];} error:nil];XCTAssertEqualObjects(value[@"language"],language);XCTAssertTrue([value[@"languageChosen"] boolValue]);XCTAssertEqualObjects(value[@"format"],@"webp");}
 for(NSNumber* limit in @[@-1,@0,@10,@50,@200]){NSDictionary* value=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module setCacheLimit:limit.doubleValue resolve:a reject:b];} error:nil];XCTAssertEqualObjects(value[@"cacheLimitMiB"],limit);}
 NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module setCacheLimit:11 resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"INFERENCE_FAILED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateSettings:@"invalid" format:@"png" theme:@"system" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"INFERENCE_FAILED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateSettings:@"en" format:@"gif" theme:@"system" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"INFERENCE_FAILED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module markNotificationIntroSeen:a reject:b];} error:nil];
 for(int i=0;i<4;i++)settings=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module markNotificationHint:a reject:b];} error:nil];XCTAssertEqual([settings[@"notificationHintCount"] intValue],3);
 XCTAssertTrue([self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getLegalText:a reject:b];} error:nil]!=nil);
 NSDictionary* capabilities=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getCapabilities:a reject:b];} error:nil];XCTAssertTrue([capabilities[@"modelValid"] boolValue]);XCTAssertEqual([capabilities[@"modes"] count],8u);
 NSDictionary* layout=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getWindowLayout:a reject:b];} error:nil];XCTAssertGreaterThan([layout[@"width"] doubleValue],0);
}
- (void)testRealInferenceAllPresetsAndExports {
 NSDictionary* imported=[_module import:[self fixture:8 height:6]];NSString* identifier=imported[@"id"];
 NSDictionary* recommendation=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getImageRecommendation:identifier resolve:a reject:b];} error:nil];XCTAssertEqualObjects(recommendation[@"imageId"],identifier);
 for(NSString* profile in @[@"standard",@"lite",@"natural",@"details",@"balanced",@"sharp",@"art",@"pixel"]){
  [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithProfile:identifier scale:2 profile:profile speed:@"quality" preparationConfirmed:NO resolve:a reject:b];} error:nil];
  NSDictionary* state=[self waitTerminal];XCTAssertEqualObjects(state[@"state"],@"SUCCEEDED",@"%@ %@",profile,state[@"error"]);XCTAssertEqual([state[@"resultWidth"] intValue],16);XCTAssertEqual([state[@"resultHeight"] intValue],12);XCTAssertEqual([state[@"progress"] intValue],100);
  if(![state[@"state"] isEqual:@"SUCCEEDED"])return;
  for(NSString* format in @[@"png",@"jpeg",@"webp"]){NSDictionary* file=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:state[@"jobId"] format:format resolve:a reject:b];} error:nil];XCTAssertGreaterThan([file[@"size"] longLongValue],0);NSDictionary* duplicate=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:state[@"jobId"] format:format resolve:a reject:b];} error:nil];XCTAssertEqualObjects(file[@"id"],duplicate[@"id"]);[NSFileManager.defaultManager removeItemAtURL:[NSURL URLWithString:file[@"uri"]] error:nil];}
 }
}
- (void)testShareFilesExpireAfter24HoursAtLaunchAndExplicitCleanupClearsTheRest {
 NSURL* shares=[_folder URLByAppendingPathComponent:@"share" isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:shares withIntermediateDirectories:YES attributes:nil error:nil];
 NSURL* old=[shares URLByAppendingPathComponent:@"expired.png"],*recent=[shares URLByAppendingPathComponent:@"recent.png"],*future=[shares URLByAppendingPathComponent:@"future.png"],*raced=[shares URLByAppendingPathComponent:@"provider-race.png"];
 for(NSURL* file in @[old,recent,future,raced])XCTAssertTrue([[NSData dataWithBytes:"image" length:5]writeToURL:file atomically:YES]);
 XCTAssertTrue([NSFileManager.defaultManager setAttributes:@{NSFileModificationDate:[NSDate dateWithTimeIntervalSinceNow:-86401]} ofItemAtPath:old.path error:nil]);
 XCTAssertTrue([NSFileManager.defaultManager setAttributes:@{NSFileModificationDate:[NSDate dateWithTimeIntervalSinceNow:3600]} ofItemAtPath:future.path error:nil]);
 ShareRaceFolder=shares.path;ShareRaceFile=raced.path;ShareRaceTriggered=NO;ShareDirectoryListing=method_setImplementation(class_getInstanceMethod(NSFileManager.class,@selector(contentsOfDirectoryAtURL:includingPropertiesForKeys:options:error:)),(IMP)ListShares);
 @try {[_module restoreSession];}@finally {method_setImplementation(class_getInstanceMethod(NSFileManager.class,@selector(contentsOfDirectoryAtURL:includingPropertiesForKeys:options:error:)),ShareDirectoryListing);ShareRaceFolder=nil;ShareRaceFile=nil;}
 XCTAssertTrue(ShareRaceTriggered);XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:old.path]);XCTAssertTrue([NSFileManager.defaultManager fileExistsAtPath:recent.path]);XCTAssertTrue([NSFileManager.defaultManager fileExistsAtPath:future.path]);
 NSNumber* removed=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module clearTemporaryFiles:a reject:b];} error:nil];XCTAssertGreaterThanOrEqual(removed.longLongValue,10);XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:shares.path]);
}
- (void)testRealModelTileSeamsAndAlpha {
 pixora::Image input=pixora::decode([self fixture:72 height:9],1024);std::vector<uint8_t> whole((size_t)72*9*16*4),tiled(whole.size());std::atomic<bool> cancelled{false};upscale::Callbacks hooks;
 hooks.stage=[](int){return true;};hooks.timing=[](int,double){return true;};hooks.progress=[](int,int){return true;};
 auto load=[](void* opaque,const upscale::Model& model){return pixora::loadModel(opaque,model);};
 auto run=[&](std::vector<uint8_t>& output,int tile){return upscale::process({input.rgba.data(),72,9,72*4},{output.data(),288,36,288*4},false,tile,1,false,cancelled,hooks,load);};
 XCTAssertEqual(run(whole,1024),0);XCTAssertEqual(run(tiled,32),0);int difference=0;for(size_t i=0;i<whole.size();i++)difference=std::max(difference,std::abs((int)whole[i]-tiled[i]));XCTAssertLessThanOrEqual(difference,1);XCTAssertEqual(whole[3],0);XCTAssertEqual(whole[19],80);
}
- (void)testLegacyFifthModelAndJobValidation {
 NSDictionary* image=[_module import:[self fixture:8 height:6]];NSString* identifier=image[@"id"];NSString* error=nil;
 for(NSArray* values in @[@[@"unknown",@"quality",@2],@[@"lite",@"invalid",@2],@[@"pixel",@"fast",@2],@[@"lite",@"quality",@3]]){
  [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithProfile:identifier scale:[values[2] doubleValue] profile:values[0] speed:values[1] preparationConfirmed:NO resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"INFERENCE_FAILED");
 }
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithMode:identifier scale:2 preparationConfirmed:NO mode:@"illustration-fast" resolve:a reject:b];} error:nil];
 NSDictionary* result=[self waitTerminal];XCTAssertEqualObjects(result[@"state"],@"SUCCEEDED");XCTAssertEqualObjects(result[@"modelId"],@"realesr-animevideov3-x4");
 NSMutableDictionary* availability=[[_module valueForKey:@"availability"] mutableCopy];availability[@"lite"]=@NO;[_module setValue:availability forKey:@"availability"];
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithProfile:identifier scale:2 profile:@"lite" speed:@"quality" preparationConfirmed:NO resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"PROFILE_UNAVAILABLE");availability[@"lite"]=@YES;[_module setValue:availability forKey:@"availability"];
}
- (void)testPreparationFastAndCancellation {
 NSDictionary* image=[_module import:[self fixture:1030 height:2]];NSString* identifier=image[@"id"];XCTAssertTrue([image[@"needsPreparation"] boolValue]);XCTAssertEqual([image[@"workWidth"] intValue],1024);XCTAssertEqual([image[@"workHeight"] intValue],1);
 NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithProfile:identifier scale:4 profile:@"lite" speed:@"fast" preparationConfirmed:NO resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"PREPARATION_REQUIRED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module prepareSelection:identifier resolve:a reject:b];} error:nil];
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithProfile:identifier scale:4 profile:@"pixel" speed:@"quality" preparationConfirmed:YES resolve:a reject:b];} error:nil];NSDictionary* result=[self waitTerminal];XCTAssertEqualObjects(result[@"state"],@"SUCCEEDED");XCTAssertEqual([result[@"resultWidth"] intValue],4096);XCTAssertEqual([result[@"resultHeight"] intValue],4);
 image=[_module import:[self fixture:16 height:12]];identifier=image[@"id"];
 NSDictionary* start=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJob:identifier scale:4 preparationConfirmed:NO resolve:a reject:b];} error:nil];
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module cancelJob:start[@"jobId"] resolve:a reject:b];} error:nil];result=[self waitTerminal];XCTAssertEqualObjects(result[@"state"],@"CANCELLED");XCTAssertEqualObjects(result[@"resultUri"],@"");
 start=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithProfile:identifier scale:4 profile:@"lite" speed:@"fast" preparationConfirmed:NO resolve:a reject:b];} error:nil];[_module expireBackgroundTask];result=[self waitTerminal];XCTAssertEqualObjects(result[@"state"],@"INTERRUPTED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:start[@"jobId"] format:@"png" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"EXPORT_FAILED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module discardSession:a reject:b];} error:nil];XCTAssertEqualObjects([self state][@"state"],@"EMPTY");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module clearTemporaryFiles:a reject:b];} error:nil];
}
- (void)testFailedConsentWithdrawalStaysOff {
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateTelemetrySettings:YES crashes:YES noticeSeen:YES resolve:a reject:b];} error:nil];
 FailingPreferences* failing=[[FailingPreferences alloc] initWithSuiteName:NSUUID.UUID.UUIDString];[_module setValue:failing forKey:@"prefs"];
 NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateTelemetrySettings:NO crashes:NO noticeSeen:YES resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"SETTINGS_WRITE_FAILED");
 NSDictionary* value=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getTelemetrySettings:a reject:b];} error:nil];XCTAssertFalse([value[@"analytics"] boolValue]);XCTAssertFalse([value[@"crashes"] boolValue]);
}
- (void)testFeedbackValidationAndInvalidIdentifiers {
 XCTAssertTrue([PixoraFeedback validEndpoint:@"https://script.google.com/macros/s/test-id/exec"]);
 for(NSString* endpoint in @[@"",@"http://script.google.com/macros/s/test/exec",@"https://example.com/macros/s/test/exec",@"https://user@script.google.com/macros/s/test/exec",@"https://script.google.com/macros/s/test/exec?query=yes"] )XCTAssertFalse([PixoraFeedback validEndpoint:endpoint]);
 NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[PixoraFeedback send:@"" email:@"" message:@"test message" rating:0 identifier:NSUUID.UUID.UUIDString resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"FEEDBACK_UNAVAILABLE");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[PixoraFeedback send:@"https://script.google.com/macros/s/test/exec" email:@"bad email" message:@"test message" rating:0 identifier:NSUUID.UUID.UUIDString resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"FEEDBACK_INVALID");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module inspectSelection:@"missing" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module cancelJob:@"missing" resolve:a reject:b];} error:nil];
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module dismissNotificationHint:@"missing" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openExport:@"missing" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"EXPORT_FAILED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module claimReviewPrompt:@"missing" resolve:a reject:b];} error:nil];
}
@end
