#import <XCTest/XCTest.h>
#import <PixoraNative/PixoraUpscale.h>
#import "../Native/PixoraServices.h"
#import <objc/runtime.h>
#include <stdexcept>
@interface PixoraUpscale (WorkflowTests)
- (instancetype)initWithPreferences:(NSUserDefaults*)preferences root:(NSURL*)root remoteConfig:(id)remote services:(const pixora::Services&)services;
- (NSDictionary*)import:(NSURL*)url;
- (NSDictionary*)snapshot;
- (void)restoreSession;
- (void)persist;
- (void)requireIdle;
- (void)removeSession;
- (void)expireBackgroundTask;
- (void)runJob;
- (NSDictionary*)export:(NSString*)job format:(NSString*)format share:(BOOL)share;
- (void)change:(void(^)(NSMutableDictionary*))change persist:(BOOL)persist;
@end
@interface WorkflowRemote:NSObject
@property(nonatomic,strong)id configSettings;
@property(nonatomic,strong)NSDictionary* defaults;
@property(nonatomic,copy)void(^completion)(NSInteger,NSError*);
@property(nonatomic)BOOL enabled;
@end
@implementation WorkflowRemote
- (void)setDefaults:(NSDictionary*)defaults{_defaults=defaults;}
- (void)fetchAndActivateWithCompletionHandler:(void(^)(NSInteger,NSError*))completion{self.completion=completion;}
- (id)configValueForKey:(NSString*)key{return @(self.enabled);}
@end
static BOOL FailOwnerInit;static IMP OriginalInit;
static id OwnerInit(id self,SEL selector){if(FailOwnerInit && object_getClass(self)==PixoraUpscale.class){FailOwnerInit=NO;CFRelease((__bridge CFTypeRef)self);return nil;}return ((id(*)(id,SEL))OriginalInit)(self,selector);}
static void(^WriteHook)(NSURL*);static NSString* WriteFailure;static NSInteger ContextFailure;static BOOL WrongResultMetadata;static BOOL WrongHeight;static BOOL ResultWritten;
static bool WriteImage(NSData* data,NSURL* url){if([url.lastPathComponent isEqual:WriteFailure]){if(WriteHook)WriteHook(url);return false;}bool result=pixora::imageAPI().write(data,url);if([url.lastPathComponent isEqual:@"result.png"])ResultWritten=YES;if(WriteHook)WriteHook(url);return result;}
static CGContextRef Context(void* bytes,size_t width,size_t height,size_t bits,size_t row,CGColorSpaceRef color,uint32_t info){if(ContextFailure==1)throw std::bad_alloc();if(ContextFailure==2)throw std::runtime_error("image allocation");return CGBitmapContextCreate(bytes,width,height,bits,row,color,info);}
static CFDictionaryRef Properties(CGImageSourceRef source,size_t index,CFDictionaryRef options){CFDictionaryRef result=CGImageSourceCopyPropertiesAtIndex(source,index,options);if(WrongResultMetadata && ResultWritten){NSMutableDictionary* data=[CFBridgingRelease(result) mutableCopy];data[(id)(WrongHeight?kCGImagePropertyPixelHeight:kCGImagePropertyPixelWidth)]=@1;return (__bridge_retained CFDictionaryRef)data;}return result;}
@interface VolatileImageDictionary:NSMutableDictionary
@property(nonatomic,strong)NSMutableDictionary* content;
@property(nonatomic)NSInteger imageReads;
@end
@implementation VolatileImageDictionary
- (instancetype)init{_content=[NSMutableDictionary dictionary];return self;}
- (NSUInteger)count{return self.content.count;}
- (NSEnumerator*)keyEnumerator{return self.content.keyEnumerator;}
- (id)objectForKey:(id)key{if([key isEqual:@"image"] && ++self.imageReads==3)return nil;return self.content[key];}
- (void)setObject:(id)value forKey:(id<NSCopying>)key{self.content[key]=value;}
- (void)removeObjectForKey:(id)key{[self.content removeObjectForKey:key];}
@end
static IMP JournalParser;static NSDictionary* JournalFault;
static id ParseJournal(id self,SEL cmd,NSData* data,NSJSONReadingOptions options,NSError** error){if([[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding]isEqual:@"volatile-image-fault"]){VolatileImageDictionary* value=[VolatileImageDictionary new];value.content=[JournalFault mutableCopy];return value;}return ((id(*)(id,SEL,NSData*,NSJSONReadingOptions,NSError**))JournalParser)(self,cmd,data,options,error);}
static IMP BeginBackground,EndBackground;static void(^CapturedExpiration)(void);static XCTestExpectation* BackgroundRegistered;static NSInteger BackgroundEnds;
static constexpr UIBackgroundTaskIdentifier TestBackgroundToken=0x5049584f5241;
static UIBackgroundTaskIdentifier BeginTask(id self,SEL cmd,NSString* name,void(^expiration)(void)){if([name isEqual:@"Pixora offline upscaling"]){CapturedExpiration=expiration;[BackgroundRegistered fulfill];return TestBackgroundToken;}return ((UIBackgroundTaskIdentifier(*)(id,SEL,NSString*,void(^)(void)))BeginBackground)(self,cmd,name,expiration);}
static void EndTask(id self,SEL cmd,UIBackgroundTaskIdentifier token){if(token==TestBackgroundToken){BackgroundEnds++;return;}((void(*)(id,SEL,UIBackgroundTaskIdentifier))EndBackground)(self,cmd,token);}
@interface PixoraWorkflowFailureTests:XCTestCase
@end
@implementation PixoraWorkflowFailureTests {
 NSURL* _folder;NSURL* _source;NSUserDefaults* _prefs;WorkflowRemote* _remote;PixoraUpscale* _owner;
}
- (void)setUp{[super setUp];_folder=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString] isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:_folder withIntermediateDirectories:YES attributes:nil error:nil];_source=[_folder URLByAppendingPathComponent:@"fixture.png"];pixora::Image image;image.width=8;image.height=6;image.rgba.assign(8*6*4,255);XCTAssertTrue(pixora::write(image,_source,@"png"));_prefs=[[NSUserDefaults alloc]initWithSuiteName:NSUUID.UUID.UUIDString];_remote=[WorkflowRemote new];_remote.enabled=YES;WriteFailure=nil;WriteHook=nil;ContextFailure=0;WrongResultMetadata=NO;WrongHeight=NO;ResultWritten=NO;}
- (void)tearDown{WriteFailure=nil;WriteHook=nil;ContextFailure=0;WrongResultMetadata=NO;WrongHeight=NO;ResultWritten=NO;_owner=nil;_remote=nil;[NSFileManager.defaultManager removeItemAtURL:_folder error:nil];[super tearDown];}
- (PixoraUpscale*)owner:(const pixora::Services&)services {return [[PixoraUpscale alloc]initWithPreferences:_prefs root:[_folder URLByAppendingPathComponent:NSUUID.UUID.UUIDString] remoteConfig:_remote services:services];}
- (id)await:(void(^)(RCTPromiseResolveBlock,RCTPromiseRejectBlock))operation error:(NSString**)error{XCTestExpectation* done=[self expectationWithDescription:@"workflow promise"];__block id result;__block NSString* code;operation(^(id value){result=value;[done fulfill];},^(NSString* key,NSString* message,NSError* native){code=key;[done fulfill];});[self waitForExpectations:@[done] timeout:30];if(error)*error=code;else XCTAssertNil(code);return result;}
- (NSDictionary*)terminal {NSDate* end=[NSDate dateWithTimeIntervalSinceNow:30];do{NSDictionary* state=[_owner snapshot];if([@[@"FAILED",@"SUCCEEDED",@"CANCELLED",@"INTERRUPTED"]containsObject:state[@"state"]]){@synchronized(_owner){if(![[_owner valueForKey:@"working"]boolValue])return state;}}[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.01]];}while(end.timeIntervalSinceNow>0);XCTFail(@"workflow did not finish");return [_owner snapshot];}
- (NSDictionary*)launch:(NSString*)profile speed:(NSString*)speed {
 NSDictionary* image=[_owner snapshot][@"image"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner startJobWithProfile:image[@"id"] scale:2 profile:profile speed:speed preparationConfirmed:YES resolve:a reject:b];} error:nil];return [self terminal];
}
- (void)testIndependentInitializationAndRemoteOwnerLifetime {
 pixora::Services services=pixora::services();OriginalInit=method_setImplementation(class_getInstanceMethod(NSObject.class,@selector(init)),(IMP)OwnerInit);FailOwnerInit=YES;@try{XCTAssertNil([self owner:services]);}@finally{method_setImplementation(class_getInstanceMethod(NSObject.class,@selector(init)),OriginalInit);}
 NSMutableDictionary* cached=[NSMutableDictionary dictionary];for(NSString* key in @[@"standard",@"lite",@"natural",@"details",@"balanced",@"sharp",@"art",@"pixel"])cached[key]=@NO;cached[@"source"]=@"cached";cached[@"updatedAt"]=@123;[_prefs setObject:cached forKey:@"profileAvailability"];
 _owner=[self owner:services];XCTAssertEqualObjects([_owner valueForKey:@"availability"],cached);_remote.completion(0,[NSError errorWithDomain:NSCocoaErrorDomain code:1 userInfo:nil]);XCTAssertEqualObjects([_owner valueForKey:@"availability"],cached);
 XCTestExpectation* event=[self expectationWithDescription:@"remote availability subscription"];EventEmitterCallbackWrapper* callback=[EventEmitterCallbackWrapper new];callback->_eventEmitterCallback=[event](const std::string& name,id value){if(name=="onProfileAvailabilityChanged")[event fulfill];};[_owner setEventEmitterCallback:callback];_remote.completion(0,nil);[self waitForExpectations:@[event] timeout:5];XCTAssertEqualObjects([_owner valueForKey:@"availability"][@"source"],@"remote");[_owner setEventEmitterCallback:[EventEmitterCallbackWrapper new]];_remote.completion(0,nil);
 XCTestExpectation* drained=[self expectationWithDescription:@"main events drained"];dispatch_async(dispatch_get_main_queue(),^{[drained fulfill];});[self waitForExpectations:@[drained] timeout:5];_owner=nil;__weak PixoraUpscale* weak;@autoreleasepool{PixoraUpscale* transient=[[PixoraUpscale alloc]initWithPreferences:_prefs root:[_folder URLByAppendingPathComponent:@"lifetime"] remoteConfig:_remote services:services];weak=transient;transient=nil;}XCTAssertNil(weak);_remote.completion(0,nil);
 [_prefs setObject:@{@"lite":@NO} forKey:@"profileAvailability"];_owner=[self owner:services];XCTAssertEqualObjects([_owner valueForKey:@"availability"][@"source"],@"defaults");XCTAssertTrue([[_owner valueForKey:@"availability"][@"standard"]boolValue]);
}
- (void)testEngineFailureMappingAndAllocationFallback {
 for(int failure=0;failure<6;failure++){@autoreleasepool{pixora::Services services=pixora::services();int calls=0;services.process=[&](upscale::PixelsView input,upscale::PixelsView output,bool gpu,int tile,int profile,bool test,std::atomic<bool>& cancel,const upscale::Callbacks& hooks,const std::function<int(void*,const upscale::Model&)>& load){calls++;if(failure==0)return -4;if(failure==1)return -5;if(failure==2)return -6;if(failure==3)throw std::bad_alloc();if(failure==4)throw std::runtime_error("inference");if(calls==1)return -5;return upscale::process(input,output,gpu,tile,profile,test,cancel,hooks,load);};_owner=[self owner:services];[_owner import:_source];NSDictionary* state=[self launch:@"lite" speed:@"quality"];NSString* expected=failure==0?@"MODEL_INVALID":failure==1||failure==3?@"LOW_MEMORY":failure==2||failure==4?@"INFERENCE_FAILED":@"";XCTAssertEqualObjects(state[@"error"],expected);XCTAssertEqualObjects(state[@"state"],failure==5?@"SUCCEEDED":@"FAILED");XCTAssertEqual(calls,failure==1||failure==3||failure==5?2:1);_owner=nil;}}
}
- (void)testResourceGuardsAndBusyOwnership {
 BOOL lowSpace=NO,lowMemory=NO;pixora::Services services=pixora::services();services.freeBytes=[&](NSURL*){return lowSpace?0LL:4LL*1024*1024*1024;};services.memory=[&](){return lowMemory?1ULL:8ULL*1024*1024*1024;};_owner=[self owner:services];lowSpace=YES;XCTAssertThrowsSpecificNamed([_owner import:_source],NSException,@"LOW_STORAGE");lowSpace=NO;NSDictionary* image=[_owner import:_source];NSString* error=nil;
 for(int failure=0;failure<3;failure++){lowSpace=failure==0;lowMemory=failure==1;if(failure==2){[_owner setValue:@YES forKey:@"modelsChecked"];[_owner setValue:@NO forKey:@"modelsValid"];}[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner startJobWithProfile:image[@"id"] scale:2 profile:@"pixel" speed:@"quality" preparationConfirmed:NO resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,failure==0?@"LOW_STORAGE":failure==1?@"DEVICE_UNSUPPORTED":@"MODEL_INVALID");}[_owner setValue:@YES forKey:@"modelsValid"];lowSpace=NO;lowMemory=NO;
 NSMutableDictionary* state=[_owner valueForKey:@"session"];state[@"state"]=@"RUNNING";XCTAssertThrowsSpecificNamed([_owner requireIdle],NSException,@"BUSY");state[@"state"]=@"READY";[_owner setValue:@YES forKey:@"working"];XCTAssertThrowsSpecificNamed([_owner requireIdle],NSException,@"BUSY");[_owner setValue:@NO forKey:@"working"];
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner inspectSelection:@"wrong-id" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner startJobWithMode:image[@"id"] scale:2 preparationConfirmed:NO mode:@"pixel" resolve:a reject:b];} error:nil];XCTAssertEqualObjects([self terminal][@"state"],@"SUCCEEDED");[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner cancelJob:[self->_owner snapshot][@"jobId"] resolve:a reject:b];} error:nil];
}
- (void)testImportPreparationAndExportCodecFailures {
 for(int failure=0;failure<7;failure++){@autoreleasepool{pixora::Services services=pixora::services();services.images.context=Context;services.images.write=WriteImage;_owner=[self owner:services];NSDictionary* before=[_owner import:_source];NSString* error=nil;
 if(failure<3){if(failure==0)WriteFailure=@"before.png";else ContextFailure=failure==1?1:2;XCTAssertThrowsSpecificNamed([_owner import:_source],NSException,failure==0?@"LOW_STORAGE":failure==1?@"LOW_MEMORY":@"SOURCE_UNAVAILABLE");XCTAssertEqualObjects([_owner snapshot][@"image"][@"id"],before[@"id"]);}
 else if(failure==3){WriteFailure=@"work.png";[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner prepareSelection:before[@"id"] resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"LOW_STORAGE");}
 else{NSDictionary* done=[self launch:@"pixel" speed:@"quality"];if(failure==4)ContextFailure=1;else if(failure==5)ContextFailure=2;else WriteFailure=[NSString stringWithFormat:@"Pixora-%@.png",done[@"jobId"]];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner exportResult:done[@"jobId"] format:@"png" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,failure==4?@"LOW_MEMORY":@"EXPORT_FAILED");XCTAssertEqualObjects([_owner snapshot][@"exportState"],@"EXPORT_FAILED");}
 ContextFailure=0;WriteFailure=nil;_owner=nil;}}
}
- (void)testTimeoutsDuringInferenceFinalizationAndWriting {
 for(int point=0;point<5;point++){@autoreleasepool{pixora::Services services=pixora::services();__weak PixoraUpscale* weak;int finalChecks=0;services.uptime=[&](){NSString* phase=[weak snapshot][@"phase"];if(point==0 && [phase isEqual:@"upscaling"])return 1801.;if((point==1||point==2) && [phase isEqual:@"building_result"]){if(++finalChecks>=(point==1?1:2))return 1801.;}if(point==3 && [phase isEqual:@"writing_result"])return 1801.;return point==0?.3:0.;};_owner=[self owner:services];weak=_owner;[_owner import:_source];NSDictionary* done=[self launch:point==4?@"lite":@"pixel" speed:@"quality"];XCTAssertEqualObjects(done[@"state"],point==4?@"SUCCEEDED":@"FAILED");XCTAssertEqualObjects(done[@"error"],point==4?@"":@"TIME_LIMIT");_owner=nil;}}
}
- (void)testFastPreparationAndThrottledRealProgress {
 pixora::Image image;image.width=1030;image.height=4;image.rgba.assign(1030*4*4,255);XCTAssertTrue(pixora::write(image,_source,@"png"));pixora::Services services=pixora::services();services.uptime=[]{return 0.;};_owner=[self owner:services];[_owner import:_source];NSDictionary* done=[self launch:@"lite" speed:@"fast"];XCTAssertEqualObjects(done[@"state"],@"SUCCEEDED");XCTAssertEqual([done[@"aiInputWidth"]intValue],512);XCTAssertEqual([done[@"resultWidth"]intValue],2048);XCTAssertGreaterThan([done[@"totalTiles"]intValue],1);
}
- (void)testImportRacesAndJournalRollback {
 for(int failure=0;failure<3;failure++){@autoreleasepool{BOOL removeSource=NO;pixora::Services services=pixora::services();services.images.write=WriteImage;services.freeBytes=[&](NSURL*){if(removeSource)[NSFileManager.defaultManager removeItemAtURL:_source error:nil];return 4LL*1024*1024*1024;};_owner=[self owner:services];NSDictionary* previous=[_owner import:_source];NSURL* root=[_owner valueForKey:@"root"];
 if(failure==0){[NSFileManager.defaultManager removeItemAtURL:root error:nil];[NSData.data writeToURL:root atomically:YES];}
 if(failure==1)removeSource=YES;
 if(failure==2)WriteHook=^(NSURL* path){if([path.lastPathComponent isEqual:@"before.png"])[self->_owner setValue:[self->_folder URLByAppendingPathComponent:@"absent/root"] forKey:@"root"];};
 XCTAssertThrowsSpecificNamed([_owner import:_source],NSException,@"LOW_STORAGE");XCTAssertEqualObjects([_owner snapshot][@"image"][@"id"],previous[@"id"]);WriteHook=nil;_owner=nil;pixora::Image fixture;fixture.width=8;fixture.height=6;fixture.rgba.assign(8*6*4,255);XCTAssertTrue(pixora::write(fixture,_source,@"png"));}}
}
- (void)testColdCacheEvictionPreservesSelectionUntilNecessary {
 _owner=[self owner:pixora::services()];[_owner import:_source];NSURL* root=[_owner valueForKey:@"root"];NSURL* incoming=[root URLByAppendingPathComponent:@"incoming-stale"];[NSData.data writeToURL:incoming atomically:YES];[_owner restoreSession];XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:incoming.path]);
 [_prefs setInteger:10 forKey:@"cacheLimitMiB"];[_owner restoreSession];XCTAssertEqualObjects([_owner snapshot][@"state"],@"READY");
 for(NSString* folder in @[@"share",@"sessions/orphan"]){NSURL* directory=[root URLByAppendingPathComponent:folder];[NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];NSURL* large=[directory URLByAppendingPathComponent:@"large"];[NSData.data writeToURL:large atomically:YES];NSFileHandle* handle=[NSFileHandle fileHandleForWritingToURL:large error:nil];[handle truncateFileAtOffset:11*1048576];[handle closeFile];[_owner restoreSession];XCTAssertEqualObjects([_owner snapshot][@"state"],[folder isEqual:@"share"]?@"READY":@"EMPTY");}
 [_prefs setInteger:-1 forKey:@"cacheLimitMiB"];[_owner import:_source];NSMutableDictionary* state=[_owner valueForKey:@"session"];state[@"state"]=@"SUCCEEDED";state[@"resultPath"]=_source.path;[_owner persist];[_owner restoreSession];XCTAssertEqualObjects([_owner snapshot][@"state"],@"SUCCEEDED");state=[_owner valueForKey:@"session"];state[@"resultPath"]=@"/missing-result";[_owner persist];[_owner restoreSession];XCTAssertEqualObjects([_owner snapshot][@"state"],@"INTERRUPTED");state=[_owner valueForKey:@"session"];state[@"image"][@"sourcePath"]=@4;[_owner persist];[_owner restoreSession];XCTAssertEqualObjects([_owner snapshot][@"state"],@"EMPTY");
 [_owner setValue:[NSMutableDictionary dictionary] forKey:@"session"];XCTAssertNoThrow([_owner removeSession]);XCTAssertEqualObjects([_owner snapshot][@"sequence"],@0);[_owner change:^(NSMutableDictionary* s){s[@"state"]=@"FAILED";s[@"jobId"]=@"";} persist:NO];
}
- (void)testCancellationAndExpirationWinStorageFailure {
 for(int expired=0;expired<2;expired++){@autoreleasepool{pixora::Services services=pixora::services();services.images.write=WriteImage;_owner=[self owner:services];[_owner import:_source];NSURL* root=[_owner valueForKey:@"root"];WriteFailure=@"result.png";WriteHook=^(NSURL* path){if([path.lastPathComponent isEqual:@"result.png"]){if(expired)dispatch_sync(dispatch_get_main_queue(),^{[self->_owner setValue:[self->_folder URLByAppendingPathComponent:@"absent/root"] forKey:@"root"];[self->_owner expireBackgroundTask];});else{dispatch_semaphore_t done=dispatch_semaphore_create(0);[self->_owner cancelJob:[self->_owner snapshot][@"jobId"] resolve:^(id value){dispatch_semaphore_signal(done);} reject:^(NSString* code,NSString* message,NSError* error){dispatch_semaphore_signal(done);}];XCTAssertEqual(dispatch_semaphore_wait(done,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC)),0);}}};NSDictionary* state=[self launch:@"pixel" speed:@"quality"];XCTAssertEqualObjects(state[@"state"],expired?@"INTERRUPTED":@"CANCELLED");XCTAssertEqualObjects(state[@"error"],expired?@"INTERRUPTED":@"");[_owner setValue:root forKey:@"root"];WriteHook=nil;WriteFailure=nil;_owner=nil;}}
}
- (void)testExportJournalFailureNeverLeavesExporting {
 pixora::Services services=pixora::services();services.images.write=WriteImage;_owner=[self owner:services];[_owner import:_source];NSDictionary* done=[self launch:@"pixel" speed:@"quality"];NSURL* root=[_owner valueForKey:@"root"];NSURL* share=[root URLByAppendingPathComponent:@"share"];[NSData.data writeToURL:share atomically:YES];XCTAssertThrowsSpecificNamed([_owner export:done[@"jobId"] format:@"png" share:YES],NSException,@"EXPORT_FAILED");[NSFileManager.defaultManager removeItemAtURL:share error:nil];
 WriteHook=^(NSURL* path){if([path.lastPathComponent hasPrefix:@"Pixora-"])[self->_owner setValue:[self->_folder URLByAppendingPathComponent:@"absent/root"] forKey:@"root"];};NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner exportResult:done[@"jobId"] format:@"png" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"LOW_STORAGE");XCTAssertEqualObjects([_owner snapshot][@"exportState"],@"EXPORT_FAILED");[_owner setValue:root forKey:@"root"];WriteHook=nil;
 WriteFailure=[NSString stringWithFormat:@"Pixora-%@.png",done[@"jobId"]];XCTAssertThrowsSpecificNamed([_owner export:done[@"jobId"] format:@"png" share:YES],NSException,@"EXPORT_FAILED");WriteFailure=nil;
}
- (void)testLateCancellationAndHeightValidation {
 pixora::Services services=pixora::services();services.process=[](upscale::PixelsView input,upscale::PixelsView output,bool gpu,int tile,int profile,bool test,std::atomic<bool>& cancel,const upscale::Callbacks& hooks,const std::function<int(void*,const upscale::Model&)>& load){cancel.store(true);return -5;};_owner=[self owner:services];[_owner import:_source];XCTAssertEqualObjects([self launch:@"lite" speed:@"quality"][@"state"],@"CANCELLED");_owner=nil;
 services=pixora::services();services.images.properties=Properties;services.images.write=WriteImage;_owner=[self owner:services];[_owner import:_source];WrongResultMetadata=YES;WrongHeight=YES;XCTAssertEqualObjects([self launch:@"pixel" speed:@"quality"][@"error"],@"INFERENCE_FAILED");WrongResultMetadata=NO;WrongHeight=NO;ResultWritten=NO;_owner=nil;
 services=pixora::services();_owner=[self owner:services];[_owner import:_source];XCTAssertEqualObjects([self launch:@"lite" speed:@"fast"][@"state"],@"SUCCEEDED");NSMutableDictionary* state=[_owner valueForKey:@"session"];state[@"profileId"]=@"pixel";state[@"speed"]=@"fast";state[@"state"]=@"PREPARING";[_owner setValue:@YES forKey:@"working"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{[self->_owner runJob];a(@YES);});} error:nil];XCTAssertEqualObjects([_owner snapshot][@"state"],@"SUCCEEDED");
}
- (void)testTransientMissingJournalImageAndReplacementCleanup {
 _owner=[self owner:pixora::services()];[_owner import:_source];NSMutableDictionary* state=[_owner valueForKey:@"session"];[state removeObjectForKey:@"image"];XCTAssertNoThrow([_owner import:_source]);XCTAssertEqualObjects([_owner snapshot][@"state"],@"READY");JournalFault=[_owner snapshot];NSMutableDictionary* saved=[[_owner valueForKey:@"session"]mutableCopy];JournalFault=saved;NSURL* root=[_owner valueForKey:@"root"];[@"volatile-image-fault" writeToURL:[root URLByAppendingPathComponent:@"session.json"] atomically:YES encoding:NSUTF8StringEncoding error:nil];JournalParser=method_setImplementation(class_getClassMethod(NSJSONSerialization.class,@selector(JSONObjectWithData:options:error:)),(IMP)ParseJournal);@try{XCTAssertNoThrow([_owner restoreSession]);XCTAssertEqualObjects([_owner snapshot][@"state"],@"READY");}@finally{method_setImplementation(class_getClassMethod(NSJSONSerialization.class,@selector(JSONObjectWithData:options:error:)),JournalParser);JournalFault=nil;}
}
- (void)testQueuedCancellationAvoidsDecodeAndInference {
 _owner=[self owner:pixora::services()];[_owner import:_source];NSMutableDictionary* state=[_owner valueForKey:@"session"];state[@"state"]=@"PREPARING";state[@"jobId"]=@"queued-cancellation";[_owner setValue:@YES forKey:@"working"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner cancelJob:@"queued-cancellation" resolve:a reject:b];} error:nil];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{[self->_owner runJob];a(@YES);});} error:nil];XCTAssertEqualObjects([_owner snapshot][@"state"],@"CANCELLED");XCTAssertEqualObjects([_owner snapshot][@"resultUri"],@"");
}
- (void)testOSBackgroundExpirationCallbackClosesItsToken {
 dispatch_semaphore_t releaseWorker=dispatch_semaphore_create(0);std::atomic<bool> first{true};pixora::Services services=pixora::services();services.uptime=[&](){if(first.exchange(false))dispatch_semaphore_wait(releaseWorker,dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC));return NSProcessInfo.processInfo.systemUptime;};_owner=[self owner:services];NSDictionary* image=[_owner import:_source];CapturedExpiration=nil;BackgroundEnds=0;BackgroundRegistered=[self expectationWithDescription:@"OS expiration callback registered"];
 BeginBackground=method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(beginBackgroundTaskWithName:expirationHandler:)),(IMP)BeginTask);EndBackground=method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(endBackgroundTask:)),(IMP)EndTask);
 @try{[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner startJobWithProfile:image[@"id"] scale:2 profile:@"pixel" speed:@"quality" preparationConfirmed:NO resolve:a reject:b];} error:nil];[self waitForExpectations:@[BackgroundRegistered] timeout:5];XCTAssertNotNil(CapturedExpiration);if(CapturedExpiration)CapturedExpiration();else [_owner expireBackgroundTask];dispatch_semaphore_signal(releaseWorker);XCTAssertEqualObjects([self terminal][@"state"],@"INTERRUPTED");XCTAssertEqual(BackgroundEnds,1);}
 @finally{dispatch_semaphore_signal(releaseWorker);CapturedExpiration=nil;BackgroundRegistered=nil;method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(beginBackgroundTaskWithName:expirationHandler:)),BeginBackground);method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(endBackgroundTask:)),EndBackground);}
}
- (void)testCodecAndResultStorageFailures {
 for(int failure=0;failure<7;failure++){@autoreleasepool{pixora::Services services=pixora::services();services.images.write=WriteImage;services.images.context=Context;services.images.properties=Properties;_owner=[self owner:services];[_owner import:_source];if(failure==0)ContextFailure=1;if(failure==1)ContextFailure=2;if(failure==2)WriteFailure=@"result.png";if(failure==3)WriteFailure=@"after.png";if(failure==4)WrongResultMetadata=YES;NSDictionary* state;if(failure<5)state=[self launch:@"pixel" speed:@"quality"];else{ContextFailure=failure==5?1:2;NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_owner prepareSelection:[self->_owner snapshot][@"image"][@"id"] resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,failure==5?@"LOW_MEMORY":@"INFERENCE_FAILED");}if(failure<5){XCTAssertEqualObjects(state[@"state"],@"FAILED");XCTAssertEqualObjects(state[@"error"],failure==0?@"LOW_MEMORY":failure==1||failure==4?@"INFERENCE_FAILED":@"LOW_STORAGE");XCTAssertEqualObjects(state[@"resultUri"],@"");}ContextFailure=0;WriteFailure=nil;WrongResultMetadata=NO;WrongHeight=NO;ResultWritten=NO;_owner=nil;}}
}
@end
