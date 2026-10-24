#import "PixoraUpscale.h"
#import "PixoraImages.h"
#import "PixoraFeedback.h"
#import "PixoraServices.h"
#import "PixoraRecreateModelStore.h"
#import <PhotosUI/PhotosUI.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <UserNotifications/UserNotifications.h>
#import <FirebaseCore/FirebaseCore.h>
#import <FirebaseAnalytics/FirebaseAnalytics.h>
#import <FirebaseCrashlytics/FirebaseCrashlytics.h>
#import <FirebaseRemoteConfig/FirebaseRemoteConfig.h>
#import <CommonCrypto/CommonDigest.h>
#import <os/proc.h>
#include "engine.h"
#include "raster.h"
#include "recreate.h"
#include <net.h>
#include <atomic>
#include <chrono>
#include <string>
#include <exception>
#include <memory>
#include <climits>
#if __has_include("recommendation.h")
#include "recommendation.h"
#endif
#if __has_include("feedback_endpoint.h")
#include "feedback_endpoint.h"
#endif
namespace pixora {
Services services(){Services value;value.images=imageAPI();value.process=upscale::process;value.uptime=[]{return NSProcessInfo.processInfo.systemUptime;};value.memory=[]{return NSProcessInfo.processInfo.physicalMemory;};value.freeBytes=[](NSURL* root){NSNumber* bytes=nil;[root getResourceValue:&bytes forKey:NSURLVolumeAvailableCapacityForImportantUsageKey error:nil];return bytes.longLongValue;};return value;}
}
static NSArray* Presets(){return @[@"standard",@"lite",@"natural",@"details",@"balanced",@"sharp",@"art",@"pixel"];}
static double Now(){return NSDate.date.timeIntervalSince1970*1000;}
static long long StorageAdd(long long left,long long right){return right>0 && left>LLONG_MAX-right?LLONG_MAX:left+right;}
static NSMutableDictionary* Clone(NSDictionary* source){return [NSJSONSerialization JSONObjectWithData:[NSJSONSerialization dataWithJSONObject:source options:0 error:nil] options:NSJSONReadingMutableContainers error:nil];}
static NSArray<UIWindow*>* Windows(){NSMutableArray* windows=[NSMutableArray arrayWithArray:UIApplication.sharedApplication.windows];for(UIScene* scene in UIApplication.sharedApplication.connectedScenes)if([scene isKindOfClass:UIWindowScene.class])for(UIWindow* window in ((UIWindowScene*)scene).windows)if(![windows containsObject:window])[windows addObject:window];return windows;}
static UIViewController* Presenter(){for(UIScene* scene in UIApplication.sharedApplication.connectedScenes)if([scene isKindOfClass:UIWindowScene.class] && scene.activationState==UISceneActivationStateForegroundActive)for(UIWindow* window in ((UIWindowScene*)scene).windows)if(window.isKeyWindow){UIViewController* vc=window.rootViewController;while(vc.presentedViewController)vc=vc.presentedViewController;return vc;}for(UIWindow* window in UIApplication.sharedApplication.windows)if(window.isKeyWindow){UIViewController* vc=window.rootViewController;while(vc.presentedViewController)vc=vc.presentedViewController;return vc;}return nil;}
static NSString* Endpoint(){
#if __has_include("feedback_endpoint.h")
 std::string value;for(auto b:endpointData)value.push_back((char)(b^endpointMask));return [NSString stringWithUTF8String:value.c_str()];
#else
 return @"";
#endif
}
static BOOL ReviewPromptCanShow(NSDictionary* session,NSString* job,NSSet<NSString*>* shown,double lastShown,double now) {
 if(job.length==0 || ![session[@"jobId"] isEqual:job] || ![session[@"state"] isEqual:@"SUCCEEDED"] || [shown containsObject:job])return NO;
 return lastShown<=0 || (now>=lastShown && now-lastShown>=300000.);
}
@interface PixoraUpscale () <PHPickerViewControllerDelegate,UIDocumentInteractionControllerDelegate,NSURLSessionTaskDelegate>
@end
struct PixoraRecreateProgressContext { __unsafe_unretained PixoraUpscale* owner; double start; };
struct PixoraRecreateResultGuard { pixora::recreate::Result value{}; ~PixoraRecreateResultGuard(){pixora::recreate::free_result(&value);} };
static PixoraUpscale* SharedUpscale;
@implementation PixoraUpscale {
 NSMutableDictionary* _session;
 NSMutableDictionary* _availability;
 NSUserDefaults* _prefs;
 NSDictionary* _telemetryOverride;
 NSURL* _root;
 dispatch_queue_t _io;
 dispatch_queue_t _worker;
 std::atomic<bool> _cancel;
 std::atomic<bool> _expired;
 BOOL _working;
 BOOL _modelsChecked;
 BOOL _modelsValid;
 UIBackgroundTaskIdentifier _backgroundTask;
 RCTPromiseResolveBlock _pickerResolve;
 RCTPromiseRejectBlock _pickerReject;
 UIDocumentInteractionController* _document;
 FIRRemoteConfig* _remote;
 pixora::Services _services;
 PixoraRecreateModelStore* _recreateModels;
}
+ (NSString*)moduleName{return @"NativeUpscale";}
+ (BOOL)requiresMainQueueSetup{return YES;}
- (void)finishStartup {dispatch_async(dispatch_get_main_queue(),^{[NSNotificationCenter.defaultCenter postNotificationName:@"PixoraStartupFinished" object:nil];});}
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams&)params{return std::make_shared<facebook::react::NativeUpscaleSpecJSI>(params);}
- (instancetype)init {
 @synchronized(PixoraUpscale.class){if(SharedUpscale)return SharedUpscale;NSURL* root=[[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"Pixora" isDirectory:YES];SharedUpscale=[self initWithPreferences:NSUserDefaults.standardUserDefaults root:root remoteConfig:FIRRemoteConfig.remoteConfig services:pixora::services()];return SharedUpscale;}
}
- (instancetype)initWithPreferences:(NSUserDefaults*)preferences root:(NSURL*)root remoteConfig:(FIRRemoteConfig*)remote services:(const pixora::Services&)services {
 if((self=[super init])) {
  _io=dispatch_queue_create("dev.kigya.pixora.files",DISPATCH_QUEUE_SERIAL);_worker=dispatch_queue_create("dev.kigya.pixora.inference",DISPATCH_QUEUE_SERIAL);
  _prefs=preferences;_services=services;_cancel.store(false);_expired.store(false);_backgroundTask=UIBackgroundTaskInvalid;
  if(![_prefs objectForKey:@"productIntroVersion"]) {
   BOOL existing=[NSFileManager.defaultManager fileExistsAtPath:[[root URLByAppendingPathComponent:@"session.json"] path]];
   for(NSString* key in @[@"language",@"theme",@"format",@"consentVersion",@"noticeSeen",@"profileAvailability",@"notificationIntroSeen",@"savedJobs"])existing=existing || [_prefs objectForKey:key]!=nil;
   [_prefs setInteger:existing?1:0 forKey:@"productIntroVersion"];
  }
  _root=root;[NSFileManager.defaultManager createDirectoryAtURL:_root withIntermediateDirectories:YES attributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} error:nil];
  __weak PixoraUpscale* modelOwner=self;_recreateModels=[[PixoraRecreateModelStore alloc] initWithRoot:_root changed:^(NSDictionary* state){dispatch_async(dispatch_get_main_queue(),^{PixoraUpscale* owner=modelOwner;if(owner && owner->_eventEmitterCallback)[owner emitOnRecreateModelChanged:state];});}];
  [_root setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
  [self restoreSession];
  [self configureTelemetry];
  NSDictionary* cached=[_prefs dictionaryForKey:@"profileAvailability"];
  _availability=cached?[cached mutableCopy]:[NSMutableDictionary dictionary];for(NSString* key in Presets())if(!_availability[key])_availability[key]=@YES;
  if(!_availability[@"source"])_availability[@"source"]=@"defaults";if(!_availability[@"updatedAt"])_availability[@"updatedAt"]=@0;
  _remote=remote;FIRRemoteConfigSettings* config=[FIRRemoteConfigSettings new];config.fetchTimeout=10;config.minimumFetchInterval=3600;_remote.configSettings=config;
  NSMutableDictionary* defaults=[NSMutableDictionary dictionary];for(NSString* key in Presets())defaults[[NSString stringWithFormat:@"pixora_profile_%@_enabled",key]]=@YES;[_remote setDefaults:defaults];
  __weak PixoraUpscale* weak=self;
  [_remote fetchAndActivateWithCompletionHandler:^(FIRRemoteConfigFetchAndActivateStatus status,NSError* error){PixoraUpscale* owner=weak;if(!owner || error)return;NSMutableDictionary* next=[NSMutableDictionary dictionary];for(NSString* key in Presets())next[key]=@([owner->_remote configValueForKey:[NSString stringWithFormat:@"pixora_profile_%@_enabled",key]].boolValue);next[@"source"]=@"remote";next[@"updatedAt"]=@(Now());@synchronized(owner){owner->_availability=next;[owner->_prefs setObject:next forKey:@"profileAvailability"];}dispatch_async(dispatch_get_main_queue(),^{if(owner->_eventEmitterCallback)[owner emitOnProfileAvailabilityChanged:next];});}];
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(layoutChanged:) name:UIWindowDidBecomeKeyNotification object:nil];
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(layoutChanged:) name:UIDeviceOrientationDidChangeNotification object:nil];
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(layoutChanged:) name:@"PixoraWindowLayoutChanged" object:nil];
 }
 return self;
}
- (void)restoreSession {
  [self pruneExpiredShares];
  for(NSURL* temporary in [NSFileManager.defaultManager contentsOfDirectoryAtURL:_root includingPropertiesForKeys:nil options:0 error:nil])if([temporary.lastPathComponent hasPrefix:@"incoming-"])[NSFileManager.defaultManager removeItemAtURL:temporary error:nil];
  NSData* journal=[NSData dataWithContentsOfURL:[_root URLByAppendingPathComponent:@"session.json"]];
  _session=journal?[NSJSONSerialization JSONObjectWithData:journal options:NSJSONReadingMutableContainers error:nil]:nil;
  if(![_session isKindOfClass:NSDictionary.class] || ![@[@2,@3] containsObject:_session[@"schemaVersion"]] || ![_session[@"state"] isKindOfClass:NSString.class] || ![_session[@"exports"] isKindOfClass:NSArray.class] || (_session[@"image"]!=NSNull.null && ![_session[@"image"] isKindOfClass:NSDictionary.class]))_session=[self empty];
  if(!_session[@"recommendedProfile"])_session[@"recommendedProfile"]=@"";
  if(!_session[@"recommendationApplied"])_session[@"recommendationApplied"]=@NO;
  if(!_session[@"recommendationContextSet"])_session[@"recommendationContextSet"]=@NO;
  if(!_session[@"resultRating"])_session[@"resultRating"]=@0;
  if(!_session[@"processingKind"]){_session[@"processingKind"]=@"enhance";_session[@"recreateSeed"]=@0;_session[@"recreateModelRevision"]=@"";_session[@"recreatePrompt"]=@"";_session[@"recreateSteps"]=@0;_session[@"schemaVersion"]=@3;}
  if([self busy]){_session[@"state"]=@"INTERRUPTED";_session[@"error"]=@"INTERRUPTED";_session[@"progress"]=@-1;}
  NSDictionary* image=_session[@"image"];if((id)image!=NSNull.null && image && (![image[@"sourcePath"] isKindOfClass:NSString.class] || ![NSFileManager.defaultManager fileExistsAtPath:image[@"sourcePath"]]))_session=[self empty];
  if([_session[@"state"] isEqual:@"SUCCEEDED"] && (![_session[@"resultPath"] isKindOfClass:NSString.class] || ![NSFileManager.defaultManager fileExistsAtPath:_session[@"resultPath"]])){_session[@"state"]=@"INTERRUPTED";_session[@"error"]=@"INTERRUPTED";}
  if((id)image!=NSNull.null && [image[@"sourcePath"] isKindOfClass:NSString.class]) {
   NSURL* folder=[NSURL fileURLWithPath:image[@"sourcePath"]].URLByDeletingLastPathComponent;
   for(NSString* name in @[@"result.png.rgba.partial",@"result.png.partial"])[NSFileManager.defaultManager removeItemAtURL:[folder URLByAppendingPathComponent:name] error:nil];
  }
  NSInteger limit=[_prefs objectForKey:@"cacheLimitMiB"]?[_prefs integerForKey:@"cacheLimitMiB"]:-1;
  if(limit>=0 && (limit==0 || [self workBytes]>limit*1048576LL)){[self clearShares];if(limit==0 || [self workBytes]>limit*1048576LL){[self removeSession];[NSFileManager.defaultManager removeItemAtURL:[_root URLByAppendingPathComponent:@"sessions"] error:nil];}}
  @try{[self persist];}@catch(NSException* disk){/* A full disk must not crash native module creation. */}
}
- (NSMutableDictionary*)empty {return [@{@"mode":@"quality",@"modelId":@"realesrgan-x4plus",@"timings":[NSMutableDictionary dictionary],@"schemaVersion":@3,@"processingKind":@"enhance",@"recreateSeed":@0,@"recreateModelRevision":@"",@"recreatePrompt":@"",@"recreateSteps":@0,@"recommendedProfile":@"",@"recommendationApplied":@NO,@"recommendationContextSet":@NO,@"resultRating":@0,@"sequence":@0,@"sessionId":@"",@"jobId":@"",@"phase":@"",@"completedTiles":@0,@"totalTiles":@0,@"state":@"EMPTY",@"scale":@2,@"backend":@"",@"progress":@-1,@"startedAt":@0,@"elapsedMs":@0,@"image":NSNull.null,@"resultUri":@"",@"resultWidth":@0,@"resultHeight":@0,@"error":@"",@"exportState":@"EXPORT_IDLE",@"exports":[NSMutableArray array]} mutableCopy];}
- (BOOL)busy{@synchronized(self){return [@[@"PREPARING",@"RUNNING",@"FINALIZING",@"CANCELLING"] containsObject:_session[@"state"]];}}
- (void)requireIdle{@synchronized(self){if([self busy] || _working)PixoraFail(@"BUSY");}}
- (void)persist{NSData* data=[NSJSONSerialization dataWithJSONObject:_session options:0 error:nil];if(![data writeToURL:[_root URLByAppendingPathComponent:@"session.json"] options:NSDataWritingAtomic error:nil])PixoraFail(@"LOW_STORAGE");}
- (NSDictionary*)snapshot {@synchronized(self){NSMutableDictionary* value=Clone(_session);[value removeObjectForKey:@"resultPath"];if(value[@"image"]!=NSNull.null){[value[@"image"] removeObjectForKey:@"sourcePath"];[value[@"image"] removeObjectForKey:@"workPath"];}return value;}}
- (void)change:(void (^)(NSMutableDictionary*))block persist:(BOOL)persist {
 @synchronized(self){NSMutableDictionary* candidate=Clone(_session);block(candidate);candidate[@"sequence"]=@([_session[@"sequence"] longLongValue]+1);if(persist){NSData* data=[NSJSONSerialization dataWithJSONObject:candidate options:0 error:nil];if(![data writeToURL:[_root URLByAppendingPathComponent:@"session.json"] options:NSDataWritingAtomic error:nil])PixoraFail(@"LOW_STORAGE");}_session=candidate;NSDictionary* value=[self snapshot];dispatch_async(dispatch_get_main_queue(),^{if(self->_eventEmitterCallback)[self emitOnSessionChanged:value];});
 if([@[@"SUCCEEDED",@"FAILED",@"CANCELLED",@"INTERRUPTED"] containsObject:candidate[@"state"]] && [candidate[@"jobId"] length] && ![[_prefs stringForKey:@"terminalJob"] isEqual:candidate[@"jobId"]]){[_prefs setObject:candidate[@"jobId"] forKey:@"terminalJob"];NSString* status=[candidate[@"state"] isEqual:@"SUCCEEDED"]?@"success":[candidate[@"state"] isEqual:@"CANCELLED"]?@"cancelled":[candidate[@"state"] isEqual:@"INTERRUPTED"]?@"interrupted":@"error";[self event:@"job_finished" values:@{@"profile_id":candidate[@"profileId"]?:@"standard",@"speed":candidate[@"speed"]?:@"quality",@"scale":candidate[@"scale"],@"backend":candidate[@"backend"],@"model_version":candidate[@"modelId"],@"phase":candidate[@"phase"],@"attempt_token":candidate[@"jobId"],@"status":status,@"error_code":candidate[@"error"],@"duration_ms":candidate[@"elapsedMs"]}];}}

}
- (void)perform:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject work:(id (^)(void))work {
 dispatch_async(_io,^{@autoreleasepool{@try{try{id result=work();resolve(result);}catch(const std::bad_alloc&){reject(@"LOW_MEMORY",@"Operation failed",nil);}catch(const std::exception&){reject(@"INFERENCE_FAILED",@"Operation failed",nil);}}@catch(NSException* error){reject(error.name,@"Operation failed",nil);}}});
}
- (NSMutableDictionary*)requireImage:(NSString*)identifier {@synchronized(self){NSMutableDictionary* image=_session[@"image"];if((id)image==NSNull.null || ![image[@"id"] isEqual:identifier])PixoraFail(@"SOURCE_UNAVAILABLE");return Clone(image);}}
- (NSDictionary*)requireResult:(NSString*)job {@synchronized(self){if(![_session[@"jobId"] isEqual:job] || ![_session[@"state"] isEqual:@"SUCCEEDED"])PixoraFail(@"EXPORT_FAILED");return Clone(_session);}}
- (long long)workBytes {long long bytes=0;for(NSURL* file in [NSFileManager.defaultManager enumeratorAtURL:_root includingPropertiesForKeys:@[NSURLFileSizeKey] options:0 errorHandler:nil]){NSNumber* size=nil;[file getResourceValue:&size forKey:NSURLFileSizeKey error:nil];bytes+=size.longLongValue;}return bytes;}
- (long long)freeBytes {return _services.freeBytes(_root);}
- (void)clearShares {[NSFileManager.defaultManager removeItemAtURL:[_root URLByAppendingPathComponent:@"share"] error:nil];}
- (void)pruneExpiredShares {NSURL* folder=[_root URLByAppendingPathComponent:@"share"];NSDate* cutoff=[NSDate dateWithTimeIntervalSinceNow:-24*60*60];for(NSURL* file in [NSFileManager.defaultManager contentsOfDirectoryAtURL:folder includingPropertiesForKeys:@[NSURLContentModificationDateKey] options:0 error:nil]){NSDate* modified=nil;[file getResourceValue:&modified forKey:NSURLContentModificationDateKey error:nil];if(modified && [modified compare:cutoff]!=NSOrderedDescending)[NSFileManager.defaultManager removeItemAtURL:file error:nil];}}
- (void)removeSession {id image=_session[@"image"];NSNumber* sequence=_session[@"sequence"];if(image!=NSNull.null && image)[NSFileManager.defaultManager removeItemAtURL:[[NSURL fileURLWithPath:image[@"sourcePath"]] URLByDeletingLastPathComponent] error:nil];_session=[self empty];_session[@"sequence"]=sequence?:@0;}
- (BOOL)validateModels {
 if(_modelsChecked)return _modelsValid;_modelsChecked=YES;_modelsValid=YES;
 NSURL* manifestURL=[PixoraAssets() URLForResource:@"model-manifest" withExtension:@"json"];NSData* manifestData=manifestURL?[NSData dataWithContentsOfURL:manifestURL]:nil;if(!manifestData)return _modelsValid=NO;
 NSDictionary* manifest=[NSJSONSerialization JSONObjectWithData:manifestData options:0 error:nil];
 if(![manifest isKindOfClass:NSDictionary.class] || manifest.count!=10)return _modelsValid=NO;
 for(NSString* name in manifest){NSURL* file=[PixoraAssets() URLForResource:name withExtension:nil];NSInputStream* stream=[NSInputStream inputStreamWithURL:file];if(!stream)return _modelsValid=NO;[stream open];CC_SHA256_CTX context;CC_SHA256_Init(&context);uint8_t buffer[65536];NSInteger count=0;while((count=[stream read:buffer maxLength:sizeof(buffer)])>0)CC_SHA256_Update(&context,buffer,(CC_LONG)count);[stream close];if(count<0)return _modelsValid=NO;uint8_t hash[32];CC_SHA256_Final(hash,&context);NSMutableString* hex=[NSMutableString string];for(uint8_t byte:hash)[hex appendFormat:@"%02x",byte];if(![hex isEqual:manifest[name]])return _modelsValid=NO;}
 return _modelsValid;
}
- (NSDictionary*)settings {return @{@"onboardingVersion":@([_prefs integerForKey:@"productIntroVersion"]),@"cacheLimitMiB":[_prefs objectForKey:@"cacheLimitMiB"]?:@-1,@"notificationHintCount":@([_prefs integerForKey:@"notificationHintCount"]),@"theme":[_prefs stringForKey:@"theme"]?:@"system",@"language":[_prefs stringForKey:@"language"]?:@"system",@"languageChosen":@([_prefs objectForKey:@"language"]!=nil),@"format":[_prefs stringForKey:@"format"]?:@"png",@"notificationAsked":@([_prefs boolForKey:@"notificationAsked"]),@"notificationIntroSeen":@([_prefs boolForKey:@"notificationIntroSeen"]),@"aiDetailNoticeSeen":@([_prefs boolForKey:@"aiDetailNoticeSeen"]),@"notificationDismissedSession":[_prefs stringForKey:@"notificationDismissedSession"]?:@"",@"systemLanguage":[[_prefs persistentDomainForName:NSGlobalDomain][@"AppleLanguages"] firstObject]?:@"en"};}
- (NSDictionary*)telemetry {@synchronized(self){if(_telemetryOverride)return _telemetryOverride;BOOL explicitChoice=[_prefs integerForKey:@"consentVersion"]==2;return @{@"analytics":@(!explicitChoice || [_prefs boolForKey:@"analyticsConsent"]),@"crashes":@(!explicitChoice || [_prefs boolForKey:@"crashConsent"]),@"noticeSeen":@([_prefs boolForKey:@"noticeSeen"]),@"consentVersion":@([_prefs integerForKey:@"consentVersion"])};}}
- (void)configureTelemetry {NSDictionary* value=[self telemetry];[FIRAnalytics setAnalyticsCollectionEnabled:[value[@"analytics"] boolValue]];[FIRAnalytics setConsent:@{FIRConsentTypeAnalyticsStorage:[value[@"analytics"] boolValue]?FIRConsentStatusGranted:FIRConsentStatusDenied,FIRConsentTypeAdStorage:FIRConsentStatusDenied,FIRConsentTypeAdUserData:FIRConsentStatusDenied,FIRConsentTypeAdPersonalization:FIRConsentStatusDenied}];[[FIRCrashlytics crashlytics] setCrashlyticsCollectionEnabled:[value[@"crashes"] boolValue]];if(![value[@"crashes"] boolValue])[[FIRCrashlytics crashlytics] deleteUnsentReports];}
- (void)getTelemetrySettings:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{return [self telemetry];}];}
- (void)updateTelemetrySettings:(BOOL)analytics crashes:(BOOL)crashes noticeSeen:(BOOL)noticeSeen resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
 [self perform:resolve reject:reject work:^id{
 @synchronized(self){
  NSDictionary* previous=[self telemetry];
  // Withdrawal takes effect before storage; failed persistence cannot keep a
  // requested-off SDK enabled in this process, or grant a requested opt-in.
  self->_telemetryOverride=@{@"analytics":@(analytics && [previous[@"analytics"] boolValue]),@"crashes":@(crashes && [previous[@"crashes"] boolValue]),@"noticeSeen":previous[@"noticeSeen"],@"consentVersion":previous[@"consentVersion"]};
  [self configureTelemetry];
  [self->_prefs setBool:analytics forKey:@"analyticsConsent"];[self->_prefs setBool:crashes forKey:@"crashConsent"];[self->_prefs setBool:noticeSeen forKey:@"noticeSeen"];[self->_prefs setInteger:2 forKey:@"consentVersion"];
  if(![self->_prefs synchronize])PixoraFail(@"SETTINGS_WRITE_FAILED");
  self->_telemetryOverride=@{@"analytics":@(analytics),@"crashes":@(crashes),@"noticeSeen":@(noticeSeen),@"consentVersion":@2};[self configureTelemetry];return [self telemetry];
 }
 }];
}
- (void)event:(NSString*)name values:(NSDictionary*)values {NSData* data=[NSJSONSerialization dataWithJSONObject:values options:0 error:nil];[self logTelemetryEvent:name parameters:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]];}
- (void)logTelemetryEvent:(NSString*)name parameters:(NSString*)parameters {
 if(![[self telemetry][@"analytics"] boolValue])return;
 NSSet* names=[NSSet setWithArray:@[@"screen_view",@"screen_engagement",@"ui_action",@"image_import_started",@"image_import_finished",@"profile_picker_opened",@"profile_preview_interacted",@"profile_selected",@"processing_options_changed",@"preparation_decision",@"job_started",@"job_finished",@"result_viewed",@"comparison_used",@"export_finished",@"share_opened",@"review_prompt_requested",@"review_prompt_shown",@"review_rating_selected",@"review_submitted",@"result_rating_submitted",@"review_dismissed",@"play_redirect_finished",@"feedback_opened",@"feedback_send_finished",@"settings_changed",@"remote_config_updated"]];
 if(![names containsObject:name])return;NSDictionary* input=[NSJSONSerialization JSONObjectWithData:[parameters dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];if(![input isKindOfClass:NSDictionary.class])return;
 NSSet* fields=[NSSet setWithArray:@[@"screen_name",@"screen_class",@"action",@"source",@"status",@"profile_id",@"previous_profile",@"speed",@"scale",@"backend",@"size_bucket",@"model_version",@"phase",@"error_code",@"attempt_token",@"format",@"rating",@"route",@"setting",@"value",@"duration_ms",@"engagement_ms",@"enabled_count",@"image_width",@"image_height",@"recommended_profile",@"recommendation_applied",@"processing_kind",@"source_width",@"source_height",@"input_width",@"input_height",@"output_width",@"output_height",@"source_format",@"has_alpha",@"steps",@"strength",@"cfg",@"recreate_revision",@"prompt_present"]];
 NSMutableDictionary* safe=[NSMutableDictionary dictionary];NSRegularExpression* pattern=[NSRegularExpression regularExpressionWithPattern:@"^[a-zA-Z0-9_.:-]+$" options:0 error:nil];
 for(NSString* key in input)if([fields containsObject:key]){id value=input[key];if([value isKindOfClass:NSNumber.class] && std::isfinite([value doubleValue]))safe[key]=value;else if([value isKindOfClass:NSString.class] && [value length]<=100 && [pattern numberOfMatchesInString:value options:0 range:NSMakeRange(0,[value length])]==1)safe[key]=value;}
 [FIRAnalytics logEventWithName:name parameters:safe];
}
- (void)getProfileAvailability:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {@synchronized(self){resolve([_availability copy]);}}
- (NSDictionary*)layout {CGRect rect=Presenter().view.bounds;return @{@"x":@0,@"y":@0,@"width":@(rect.size.width),@"height":@(rect.size.height),@"separating":@NO};}
- (void)getWindowLayout:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {dispatch_async(dispatch_get_main_queue(),^{resolve([self layout]);});}
- (void)layoutChanged:(NSNotification*)notification {if(_eventEmitterCallback)[self emitOnWindowLayoutChanged:[self layout]];}
- (void)getCapabilities:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{uint64_t memory=self->_services.memory();return @{@"modes":Presets(),@"sdk":@([UIDevice.currentDevice.systemVersion intValue]),@"supported":@(memory>=3.5*1024*1024*1024),@"modelValid":@([self validateModels]),@"ramBytes":@(memory),@"storageBytes":@([self freeBytes]),@"workBytes":@([self workBytes]),@"version":[NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"]?:@"0.9.0"};}];}
- (void)pickImage:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {dispatch_async(dispatch_get_main_queue(),^{@try{[self requireIdle];if(self->_pickerResolve)PixoraFail(@"BUSY");UIViewController* presenter=Presenter();if(!presenter)PixoraFail(@"SOURCE_UNAVAILABLE");PHPickerConfiguration* config=[[PHPickerConfiguration alloc] init];config.filter=PHPickerFilter.imagesFilter;config.selectionLimit=1;config.preferredAssetRepresentationMode=PHPickerConfigurationAssetRepresentationModeCurrent;PHPickerViewController* picker=[[PHPickerViewController alloc] initWithConfiguration:config];picker.delegate=self;self->_pickerResolve=resolve;self->_pickerReject=reject;[self event:@"image_import_started" values:@{@"source":@"picker"}];[presenter presentViewController:picker animated:YES completion:nil];}@catch(NSException* e){reject(e.name,@"Selection unavailable",nil);}});}
- (void)picker:(PHPickerViewController*)picker didFinishPicking:(NSArray<PHPickerResult*>*)results {
 [picker dismissViewControllerAnimated:YES completion:nil];RCTPromiseResolveBlock resolve=_pickerResolve;RCTPromiseRejectBlock reject=_pickerReject;_pickerResolve=nil;_pickerReject=nil;if(!resolve)return;if(!results.count){[self event:@"image_import_finished" values:@{@"source":@"picker",@"status":@"cancelled"}];resolve(NSNull.null);return;}
 NSItemProvider* provider=results.firstObject.itemProvider;
 NSString* type=nil;for(NSString* candidate in provider.registeredTypeIdentifiers)if([@[@"public.png",@"public.jpeg",@"org.webmproject.webp",@"public.webp"] containsObject:candidate]){type=candidate;break;}
 if(!type){reject(@"UNSUPPORTED_FORMAT",@"Selection unavailable",nil);return;}
 [provider loadFileRepresentationForTypeIdentifier:type completionHandler:^(NSURL* url,NSError* error){if(error || !url){reject(@"SOURCE_UNAVAILABLE",@"Selection unavailable",nil);return;}@try{
  NSURL* incoming=[self->_root URLByAppendingPathComponent:[NSString stringWithFormat:@"incoming-%@",NSUUID.UUID.UUIDString]];
  pixora::copyImport(url,incoming);
  [self perform:resolve reject:reject work:^id{@try{return [self import:incoming];}@finally{[NSFileManager.defaultManager removeItemAtURL:incoming error:nil];}}];
 }@catch(NSException* e){reject(e.name,@"Selection unavailable",nil);}}];
}
- (NSDictionary*)import:(NSURL*)incoming {
 [self requireIdle];NSMutableDictionary* image=[pixora::inspect(incoming,_services.images) mutableCopy];
 if([self freeBytes]<256LL*1024*1024)PixoraFail(@"LOW_STORAGE");NSString* identifier=NSUUID.UUID.UUIDString;NSURL* folder=[[_root URLByAppendingPathComponent:@"sessions"] URLByAppendingPathComponent:identifier];
 if(![NSFileManager.defaultManager createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil])PixoraFail(@"LOW_STORAGE");
 NSDictionary* imported=nil;
 @try{try{NSURL* source=[folder URLByAppendingPathComponent:@"source"];if(![NSFileManager.defaultManager copyItemAtURL:incoming toURL:source error:nil])PixoraFail(@"LOW_STORAGE");[NSFileManager.defaultManager setAttributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} ofItemAtPath:source.path error:nil];pixora::Image preview=pixora::decode(source,1536,_services.images);NSURL* before=[folder URLByAppendingPathComponent:@"before.png"];if(!pixora::write(preview,before,@"png",_services.images))PixoraFail(@"LOW_STORAGE");image[@"id"]=identifier;image[@"previewUri"]=before.absoluteString;image[@"sourcePath"]=source.path;NSMutableDictionary* previous=_session;id previousImage=previous[@"image"];_session=[self empty];_session[@"sequence"]=previous[@"sequence"];_session[@"sessionId"]=identifier;_session[@"state"]=@"READY";_session[@"image"]=image;@try{[self change:^(NSMutableDictionary* s){} persist:YES];}@catch(NSException* disk){_session=previous;@throw disk;}if(previousImage!=NSNull.null && previousImage)[NSFileManager.defaultManager removeItemAtURL:[NSURL fileURLWithPath:previousImage[@"sourcePath"]].URLByDeletingLastPathComponent error:nil];NSMutableDictionary* publicImage=[image mutableCopy];[publicImage removeObjectForKey:@"sourcePath"];[self event:@"image_import_finished" values:@{@"source":@"picker",@"status":@"success"}];imported=publicImage;}catch(const std::bad_alloc&){PixoraFail(@"LOW_MEMORY");}catch(const std::exception&){PixoraFail(@"SOURCE_UNAVAILABLE");}}@catch(NSException* e){[NSFileManager.defaultManager removeItemAtURL:folder error:nil];@throw e;}
 return imported;
}
- (void)inspectSelection:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{NSMutableDictionary* image=[self requireImage:identifier];[image removeObjectForKey:@"sourcePath"];[image removeObjectForKey:@"workPath"];return image;}];}
- (void)prepareSelection:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self requireIdle];NSMutableDictionary* image=[self requireImage:identifier];pixora::Image input=pixora::decode([NSURL fileURLWithPath:image[@"sourcePath"]],1024,self->_services.images);NSURL* file=[[NSURL fileURLWithPath:image[@"sourcePath"]].URLByDeletingLastPathComponent URLByAppendingPathComponent:@"work.png"];if(!pixora::write(input,file,@"png",self->_services.images))PixoraFail(@"LOW_STORAGE");[self change:^(NSMutableDictionary* value){value[@"image"][@"workPath"]=file.path;} persist:YES];[image removeObjectForKey:@"sourcePath"];return image;}];}
- (void)getImageRecommendation:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
 [self perform:resolve reject:reject work:^id{
  NSDictionary* image=[self requireImage:identifier];
#if __has_include("recommendation.h")
  auto result=pixora::recommendation::analyze(nullptr,0,0,0);
  @try { try {
   // Match prepareSelection's 1024 px decode, without resampling the 1536 px display preview twice.
   pixora::Image preview=pixora::decode([NSURL fileURLWithPath:image[@"sourcePath"]],1024,self->_services.images);
   // CoreGraphics supplies premultiplied RGBA; the shared classifier expects straight RGBA.
   for(size_t i=0;i<preview.rgba.size();i+=4)for(int c=0;c<3;c++)
    preview.rgba[i+c]=preview.rgba[i+3]?std::min(255,(int)preview.rgba[i+c]*255/preview.rgba[i+3]):0;
   result=pixora::recommendation::analyze(preview.rgba.data(),preview.width,preview.height,preview.width*4);
  } catch(const std::exception&) { /* Keep the generic suggestion on decode/allocation failure. */ }
  } @catch(NSException* error) { /* A missing preview still permits manual processing. */ }
  [self requireImage:identifier];
  @synchronized(self) {
   uint32_t mask=0;NSUInteger bit=0;
   for(NSString* profile in @[@"standard",@"balanced",@"natural",@"lite",@"art",@"pixel"]) {
    if([self->_availability[profile] boolValue])mask|=1u<<bit;
    ++bit;
   }
   result=pixora::recommendation::available(result,mask);
  }
  if(!result.profile_id)return nil;
  return @{@"imageId":identifier,@"profileId":[NSString stringWithUTF8String:result.profile_id],@"speed":[NSString stringWithUTF8String:result.speed],@"reasonId":[NSString stringWithUTF8String:result.reason_id]};
#else
  PixoraFail(@"INFERENCE_FAILED");return nil;
#endif
 }];
}
- (void)startJob:(NSString*)identifier scale:(double)scale preparationConfirmed:(BOOL)confirmed resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self launch:identifier scale:scale profile:@"standard" speed:@"quality" mode:@"quality" confirmed:confirmed resolution:@"prepared" resolve:resolve reject:reject];}
- (void)startJobWithMode:(NSString*)identifier scale:(double)scale preparationConfirmed:(BOOL)confirmed mode:(NSString*)mode resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {NSDictionary* aliases=@{@"quality":@"standard",@"fast":@"lite",@"illustration":@"art",@"illustration-fast":@"art"};NSString* preset=aliases[mode]?:mode;[self launch:identifier scale:scale profile:preset speed:@"quality" mode:mode confirmed:confirmed resolution:@"prepared" resolve:resolve reject:reject];}
- (void)startJobWithProfile:(NSString*)identifier scale:(double)scale profile:(NSString*)profile speed:(NSString*)speed preparationConfirmed:(BOOL)confirmed resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self launch:identifier scale:scale profile:profile speed:speed mode:profile confirmed:confirmed resolution:@"prepared" resolve:resolve reject:reject];}
- (void)startJobWithResolution:(NSString*)identifier scale:(double)scale profile:(NSString*)profile speed:(NSString*)speed resolution:(NSString*)resolution preparationConfirmed:(BOOL)confirmed resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self launch:identifier scale:scale profile:profile speed:speed mode:profile confirmed:confirmed resolution:resolution resolve:resolve reject:reject];}
- (void)getRecreateModelState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{return [self->_recreateModels snapshot];}];}
- (void)downloadRecreateModel:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{@synchronized(self){[self requireIdle];}[self->_recreateModels start];return [self->_recreateModels snapshot];}];}
- (void)cancelRecreateDownload:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self->_recreateModels cancel];return [self->_recreateModels snapshot];}];}
- (void)deleteRecreateModel:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{@synchronized(self){[self requireIdle];[self->_recreateModels deleteModel];return [self->_recreateModels snapshot];}}];}
- (void)markAiDetailNoticeSeen:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self->_prefs setBool:YES forKey:@"aiDetailNoticeSeen"];if(![self->_prefs synchronize])PixoraFail(@"SETTINGS_WRITE_FAILED");return [self settings];}];}
- (void)getStorageUsage:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{
 NSFileManager* fm=NSFileManager.defaultManager;NSURL* cache=[fm URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;NSURL* library=[fm URLsForDirectory:NSLibraryDirectory inDomains:NSUserDomainMask].firstObject;NSURL* documents=[fm URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;NSURL* temporary=[NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES];NSURL* sessions=[self->_root URLByAppendingPathComponent:@"sessions" isDirectory:YES];NSURL* journal=[self->_root URLByAppendingPathComponent:@"session.json"];NSURL* model=[self->_root URLByAppendingPathComponent:@"recreate-model" isDirectory:YES];
 NSMutableSet<NSString*>* visited=[NSMutableSet set];long long cacheBytes=0,sessionBytes=0,tempBytes=0,modelBytes=0,otherBytes=0;
 NSArray<NSURL*>* roots=@[library,documents,temporary];for(NSURL* root in roots){NSDirectoryEnumerator* it=[fm enumeratorAtURL:root includingPropertiesForKeys:@[NSURLIsRegularFileKey,NSURLFileSizeKey] options:0 errorHandler:nil];for(NSURL* file in it){if([visited containsObject:file.path])continue;[visited addObject:file.path];NSNumber* regular=nil,*size=nil;[file getResourceValue:&regular forKey:NSURLIsRegularFileKey error:nil];[file getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(!regular.boolValue)continue;long long bytes=MAX(0,size.longLongValue);NSString* name=file.lastPathComponent;BOOL transient=[name hasSuffix:@".partial"]||[name hasSuffix:@".part"]||[name hasPrefix:@"incoming-"];if(transient || [file.path hasPrefix:[temporary.path stringByAppendingString:@"/"]]){tempBytes=StorageAdd(tempBytes,bytes);continue;}if([file.path isEqualToString:journal.path] || [file.path hasPrefix:[sessions.path stringByAppendingString:@"/"]])sessionBytes=StorageAdd(sessionBytes,bytes);else if([file.path hasPrefix:[model.path stringByAppendingString:@"/"]])modelBytes=StorageAdd(modelBytes,bytes);else if([file.path hasPrefix:[cache.path stringByAppendingString:@"/"]])cacheBytes=StorageAdd(cacheBytes,bytes);else otherBytes=StorageAdd(otherBytes,bytes);}}
 NSNumber* free=nil;[self->_root getResourceValue:&free forKey:NSURLVolumeAvailableCapacityForImportantUsageKey error:nil];long long total=StorageAdd(StorageAdd(StorageAdd(StorageAdd(cacheBytes,sessionBytes),tempBytes),modelBytes),otherBytes);return @{@"cacheBytes":@(cacheBytes),@"sessionBytes":@(sessionBytes),@"temporaryBytes":@(tempBytes),@"recreateModelBytes":@(modelBytes),@"otherBytes":@(otherBytes),@"freeBytes":free?:@0,@"totalBytes":@(total)};}];}
- (void)clearCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{@synchronized(self){
 [self requireIdle];NSFileManager* fm=NSFileManager.defaultManager;NSURL* cache=[fm URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;NSDirectoryEnumerator* enumerator=[fm enumeratorAtURL:cache includingPropertiesForKeys:@[NSURLIsRegularFileKey,NSURLFileSizeKey] options:0 errorHandler:nil];NSMutableArray<NSURL*>* files=[NSMutableArray array];for(NSURL* file in enumerator){NSNumber* regular=nil;[file getResourceValue:&regular forKey:NSURLIsRegularFileKey error:nil];if(regular.boolValue)[files addObject:file];}long long removed=0;for(NSURL* file in files){NSNumber* size=nil;[file getResourceValue:&size forKey:NSURLFileSizeKey error:nil];NSError* error=nil;if(![fm removeItemAtURL:file error:&error])PixoraFail(@"CACHE_CLEAR_FAILED");removed+=size.longLongValue;}return @(removed);}}];}
- (void)startRecreateJob:(NSString*)identifier scale:(double)scale speed:(NSString*)speed prompt:(NSString*)prompt preparationConfirmed:(BOOL)confirmed resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{
 @synchronized(self){[self requireIdle];if((scale!=2 && scale!=4) || ![@[@"fast",@"quality"] containsObject:speed])PixoraFail(@"INFERENCE_FAILED");if(![self->_recreateModels isReady])PixoraFail(@"RECREATE_MODEL_MISSING");}
 if(![self->_recreateModels verifyInstalled])PixoraFail(@"MODEL_INTEGRITY_FAILED");
 @synchronized(self){[self requireIdle];NSDictionary* image=[self requireImage:identifier];if([image[@"needsPreparation"] boolValue]&&!confirmed)PixoraFail(@"PREPARATION_REQUIRED");
  if(self->_services.memory()<4LL*1024*1024*1024 || os_proc_available_memory()<1881812340ULL+1024ULL*1024*1024)PixoraFail(@"LOW_MEMORY");long long w=[image[@"workWidth"] longLongValue],h=[image[@"workHeight"] longLongValue];double factor=std::min(1.,512./std::max(w,h));w=std::max(1LL,(long long)(w*factor));h=std::max(1LL,(long long)(h*factor));if([self freeBytes]<std::max(256LL*1024*1024,w*h*(long long)(scale*scale)*16)+128LL*1024*1024)PixoraFail(@"LOW_STORAGE");
  self->_cancel.store(false);self->_expired.store(false);pixora::recreate::reset_cancel();uint64_t seed=arc4random();NSString* trimmed=[[prompt stringByReplacingOccurrencesOfString:@"\n" withString:@" "] stringByReplacingOccurrencesOfString:@"\r" withString:@" "];trimmed=[trimmed stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];NSString* safePrompt=trimmed.length>300?[trimmed substringToIndex:300]:trimmed;
  [self change:^(NSMutableDictionary* s){s[@"processingKind"]=@"recreate";s[@"recreateSeed"]=@(seed);s[@"recreateModelRevision"]=@"sd15-q4-c2f6e92f-lcm-8f90d840";s[@"recreatePrompt"]=safePrompt;s[@"recreateSteps"]=[speed isEqual:@"fast"]?@4:@8;s[@"recommendedProfile"]=@"";s[@"recommendationApplied"]=@NO;s[@"recommendationContextSet"]=@NO;s[@"resultRating"]=@0;s[@"resolution"]=@"prepared";s[@"jobId"]=NSUUID.UUID.UUIDString;s[@"profileId"]=@"standard";s[@"mode"]=@"recreate";s[@"modelId"]=@"stable-diffusion-v1-5-q4-lcm";s[@"speed"]=speed;s[@"scale"]=@(scale);s[@"state"]=@"PREPARING";s[@"phase"]=@"preparing_image";s[@"startedAt"]=@(Now());s[@"elapsedMs"]=@0;s[@"progress"]=@-1;s[@"completedTiles"]=@0;s[@"totalTiles"]=@0;s[@"error"]=@"";s[@"resultUri"]=@"";s[@"resultWidth"]=@0;s[@"resultHeight"]=@0;s[@"exports"]=[NSMutableArray array];s[@"exportState"]=@"EXPORT_IDLE";s[@"timings"]=[NSMutableDictionary dictionary];s[@"restrictAnimation"]=@(UIAccessibilityIsReduceMotionEnabled());} persist:YES];self->_working=YES;
  [self event:@"job_started" values:@{@"profile_id":@"recreate",@"speed":speed,@"scale":@(scale),@"backend":@"CPU",@"model_version":@"stable-diffusion-v1-5-q4-lcm"}];dispatch_async(dispatch_get_main_queue(),^{if(UIApplication.sharedApplication.applicationState!=UIApplicationStateActive){[self change:^(NSMutableDictionary* s){s[@"state"]=@"INTERRUPTED";s[@"error"]=@"INTERRUPTED";} persist:YES];@synchronized(self){self->_working=NO;}return;}self->_backgroundTask=[UIApplication.sharedApplication beginBackgroundTaskWithName:@"Pixora local reconstruction" expirationHandler:^{[self expireBackgroundTask];}];dispatch_async(self->_worker,^{[self runJob];});});return [self snapshot];}
}];}
- (void)launch:(NSString*)identifier scale:(double)scale profile:(NSString*)profile speed:(NSString*)speed mode:(NSString*)mode confirmed:(BOOL)confirmed resolution:(NSString*)resolution resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
 [self perform:resolve reject:reject work:^id{
  @synchronized(self){[self requireIdle];if(![@[@"prepared",@"original"] containsObject:resolution] || ([resolution isEqual:@"original"] && ![speed isEqual:@"quality"]) || ![Presets() containsObject:profile] || ![@[@"quality",@"fast"] containsObject:speed] || ([profile isEqual:@"pixel"] && ![speed isEqual:@"quality"]) || (scale!=2 && scale!=4))PixoraFail(@"INFERENCE_FAILED");
   if(![self->_availability[profile] boolValue])PixoraFail(@"PROFILE_UNAVAILABLE");NSDictionary* image=[self requireImage:identifier];
   if(![resolution isEqual:@"original"] && [image[@"needsPreparation"] boolValue] && !confirmed)PixoraFail(@"PREPARATION_REQUIRED");
   if(![self validateModels])PixoraFail(@"MODEL_INVALID");if(self->_services.memory()<3.5*1024*1024*1024)PixoraFail(@"DEVICE_UNSUPPORTED");
   long long inputWidth=[image[[resolution isEqual:@"original"]?@"width":@"workWidth"] longLongValue],inputHeight=[image[[resolution isEqual:@"original"]?@"height":@"workHeight"] longLongValue];
   if([resolution isEqual:@"original"] && !upscale::originalSizeAllowed((int)inputWidth,(int)inputHeight,(int)scale))PixoraFail(@"DIMENSIONS_TOO_LARGE");
   if([self freeBytes]<std::max(256LL*1024*1024,inputWidth*inputHeight*(long long)(scale*scale)*16))PixoraFail(@"LOW_STORAGE");
   self->_cancel.store(false);self->_expired.store(false);
   NSString* model=[mode isEqual:@"illustration-fast"]?@"realesr-animevideov3-x4":[profile isEqual:@"lite"]?@"realesr-general-x4v3":[profile isEqual:@"art"]?@"realesrgan-x4plus-anime":[profile isEqual:@"natural"]?@"realesrnet-x4plus":[profile isEqual:@"pixel"]?@"nearest-neighbor":@"realesrgan-x4plus";
   [self change:^(NSMutableDictionary* s){s[@"processingKind"]=@"enhance";s[@"recreateSeed"]=@0;s[@"recreateModelRevision"]=@"";s[@"recreatePrompt"]=@"";s[@"recreateSteps"]=@0;s[@"recommendedProfile"]=@"";s[@"recommendationApplied"]=@NO;s[@"recommendationContextSet"]=@NO;s[@"resultRating"]=@0;s[@"resolution"]=resolution;s[@"jobId"]=NSUUID.UUID.UUIDString;s[@"profileId"]=profile;s[@"mode"]=mode;s[@"modelId"]=model;s[@"speed"]=speed;s[@"scale"]=@(scale);s[@"state"]=@"PREPARING";s[@"phase"]=@"preparing_image";s[@"startedAt"]=@(Now());s[@"elapsedMs"]=@0;s[@"progress"]=@-1;s[@"completedTiles"]=@0;s[@"totalTiles"]=@0;s[@"error"]=@"";s[@"resultUri"]=@"";s[@"resultWidth"]=@0;s[@"resultHeight"]=@0;s[@"exports"]=[NSMutableArray array];s[@"exportState"]=@"EXPORT_IDLE";s[@"timings"]=[NSMutableDictionary dictionary];s[@"restrictAnimation"]=@(UIAccessibilityIsReduceMotionEnabled());} persist:YES];
   self->_working=YES;
   [self event:@"job_started" values:@{@"profile_id":profile,@"speed":speed,@"scale":@(scale),@"backend":@"CPU",@"model_version":model}];
   dispatch_async(dispatch_get_main_queue(),^{
    if(UIApplication.sharedApplication.applicationState!=UIApplicationStateActive){@try{[self change:^(NSMutableDictionary* s){s[@"state"]=@"INTERRUPTED";s[@"error"]=@"INTERRUPTED";} persist:YES];}@catch(NSException* disk){[self change:^(NSMutableDictionary* s){s[@"state"]=@"INTERRUPTED";s[@"error"]=@"INTERRUPTED";} persist:NO];}@synchronized(self){self->_working=NO;}return;}
    self->_backgroundTask=[UIApplication.sharedApplication beginBackgroundTaskWithName:@"Pixora offline upscaling" expirationHandler:^{[self expireBackgroundTask];}];
    dispatch_async(self->_worker,^{[self runJob];});
   });
   return [self snapshot];
  }
 }];
}
- (void)expireBackgroundTask {_expired.store(true);_cancel.store(true);pixora::recreate::cancel();@try{[self change:^(NSMutableDictionary* s){s[@"state"]=@"CANCELLING";} persist:YES];}@catch(NSException* disk){[self change:^(NSMutableDictionary* s){s[@"state"]=@"CANCELLING";} persist:NO];}@finally{[self endBackground];}}
- (void)endBackground {if(_backgroundTask!=UIBackgroundTaskInvalid){UIBackgroundTaskIdentifier token=_backgroundTask;_backgroundTask=UIBackgroundTaskInvalid;[UIApplication.sharedApplication endBackgroundTask:token];}}
- (void)runJob {
 @autoreleasepool {
  double start=self->_services.uptime();NSDictionary* job;@synchronized(self){job=Clone(_session);}NSDictionary* image=job[@"image"];NSURL* folder=[NSURL fileURLWithPath:image[@"sourcePath"]].URLByDeletingLastPathComponent;NSURL* output=[folder URLByAppendingPathComponent:@"result.png"];NSURL* previewURL=[folder URLByAppendingPathComponent:@"after.png"];
  auto cancelled=[&](){if(self->_services.uptime()-start>=1800)_cancel.store(true);return _cancel.load();};
  @try {try {
   if([job[@"resolution"] isEqual:@"original"]) {
    int width=[image[@"width"] intValue],height=[image[@"height"] intValue],scale=[job[@"scale"] intValue];
    [self change:^(NSMutableDictionary* s){s[@"aiInputWidth"]=@(width);s[@"aiInputHeight"]=@(height);s[@"state"]=@"RUNNING";s[@"backend"]=@"CPU";} persist:YES];
    upscale::Callbacks callbacks;
    callbacks.stage=[&](int stage){if(cancelled())return false;[self change:^(NSMutableDictionary* s){s[@"phase"]=stage?@"upscaling":@"loading_model";} persist:NO];return true;};
    callbacks.timing=[&](int,double){return !cancelled();};
    callbacks.progress=[&](int done,int total){if(cancelled())return false;[self change:^(NSMutableDictionary* s){s[@"completedTiles"]=@(done);s[@"totalTiles"]=@(total);s[@"progress"]=@(std::min(99.,done*100./total));s[@"elapsedMs"]=@((self->_services.uptime()-start)*1000);if(done==total){s[@"state"]=@"FINALIZING";s[@"phase"]=@"writing_result";s[@"progress"]=@-1;}} persist:NO];return true;};
    if(!pixora::processOriginal([NSURL fileURLWithPath:image[@"sourcePath"]],output,job[@"profileId"],width,height,scale,_cancel,callbacks,cancelled))PixoraFail(@"CANCELLED");
    pixora::Image preview=pixora::decode(output,1536,_services.images);
    if(!pixora::write(preview,previewURL,@"png",_services.images))PixoraFail(@"LOW_STORAGE");
    NSDictionary* bounds=pixora::inspectOutput(output);
    if([bounds[@"width"] intValue]!=width*scale || [bounds[@"height"] intValue]!=height*scale)PixoraFail(@"INFERENCE_FAILED");
    @synchronized(self){if(cancelled())PixoraFail(@"CANCELLED");[self change:^(NSMutableDictionary* s){s[@"state"]=@"SUCCEEDED";s[@"phase"]=@"complete";s[@"progress"]=@100;s[@"elapsedMs"]=@((self->_services.uptime()-start)*1000);s[@"resultPath"]=output.path;s[@"resultUri"]=previewURL.absoluteString;s[@"resultWidth"]=@(width*scale);s[@"resultHeight"]=@(height*scale);s[@"error"]=@"";} persist:YES];}
    [self notifyFinished];return;
   }
   if(cancelled())PixoraFail(@"CANCELLED");double prepared=self->_services.uptime();pixora::Image original=pixora::decode([NSURL fileURLWithPath:image[@"sourcePath"]],1024,self->_services.images);
   // Preparation always obeys the documented floor; ImageIO may round differently.
   if(original.width!=[image[@"workWidth"] intValue] || original.height!=[image[@"workHeight"] intValue])original=pixora::resize(original,[image[@"workWidth"] intValue],[image[@"workHeight"] intValue],false,_services.images);
   pixora::Image input=original;BOOL recreating=[job[@"processingKind"] isEqual:@"recreate"];NSString* profile=job[@"profileId"];BOOL pixel=[profile isEqual:@"pixel"];
   if(recreating){if(![self->_recreateModels verifyInstalled])PixoraFail(@"MODEL_INTEGRITY_FAILED");double factor=std::min(1.,512./std::max(input.width,input.height));if(factor<1)input=pixora::resize(input,std::max(1,(int)(input.width*factor)),std::max(1,(int)(input.height*factor)),false,_services.images);
    [self change:^(NSMutableDictionary* s){s[@"aiInputWidth"]=@(input.width);s[@"aiInputHeight"]=@(input.height);s[@"state"]=@"RUNNING";s[@"backend"]=@"CPU";s[@"progress"]=@-1;s[@"phase"]=@"loading_model";s[@"timings"][@"prepareMs"]=@((self->_services.uptime()-prepared)*1000);} persist:YES];
    std::vector<uint8_t> sourceAlpha((size_t)input.width*input.height);for(size_t i=0;i<sourceAlpha.size();i++){size_t pixel=i*4;int alpha=input.rgba[pixel+3];sourceAlpha[i]=(uint8_t)alpha;for(int c=0;c<3;c++)input.rgba[pixel+c]=alpha?std::min(255,(int)input.rgba[pixel+c]*255/alpha):0;input.rgba[pixel+3]=255;}
    pixora::recreate::Request request;request.model_path=self->_recreateModels.diffusionModelURL.path.UTF8String;request.lora_path=self->_recreateModels.loraModelURL.path.UTF8String;request.prompt=[job[@"recreatePrompt"] UTF8String];request.rgba=input.rgba.data();request.width=input.width;request.height=input.height;request.steps=[job[@"recreateSteps"] intValue];request.seed=[job[@"recreateSeed"] unsignedLongLongValue];request.strength=.6f;request.cfg=1.f;request.max_side=512;PixoraRecreateResultGuard generated;
    PixoraRecreateProgressContext progressContext{self,start};auto progress=[](int done,int total,void* context){auto* state=static_cast<PixoraRecreateProgressContext*>(context);PixoraUpscale* owner=state->owner;if(owner->_cancel.load() || owner->_expired.load()){pixora::recreate::cancel();return;}double now=owner->_services.uptime();[owner change:^(NSMutableDictionary* s){s[@"phase"]=@"recreating";s[@"completedTiles"]=@(done);s[@"totalTiles"]=@(total);s[@"progress"]=@(std::min(99.,done*100./std::max(1,total)));s[@"elapsedMs"]=@((now-state->start)*1000);} persist:NO];};
    pixora::recreate::Status status=pixora::recreate::run(request,progress,&progressContext,&generated.value);if(status!=pixora::recreate::Status::Ok){if(status==pixora::recreate::Status::Cancelled || cancelled())PixoraFail(@"CANCELLED");if(status==pixora::recreate::Status::OutOfMemory)PixoraFail(@"LOW_MEMORY");if(status==pixora::recreate::Status::ModelLoadFailed)PixoraFail(@"RECREATE_MODEL_LOAD_FAILED");if(status==pixora::recreate::Status::InvalidArgument)PixoraFail(@"RECREATE_INVALID_INPUT");PixoraFail(@"RECREATE_GENERATION_FAILED");}
    if(generated.value.width==0 || generated.value.height==0 || !generated.value.rgb)PixoraFail(@"RECREATE_GENERATION_FAILED");pixora::Image recreated;recreated.width=(int)generated.value.width;recreated.height=(int)generated.value.height;recreated.rgba.resize((size_t)recreated.width*recreated.height*4);for(int y=0;y<recreated.height;y++)for(int x=0;x<recreated.width;x++){size_t i=(size_t)y*recreated.width+x,src=i*3,dst=i*4;int ax=std::min(input.width-1,x*input.width/recreated.width),ay=std::min(input.height-1,y*input.height/recreated.height);int alpha=sourceAlpha[(size_t)ay*input.width+ax];for(int c=0;c<3;c++)recreated.rgba[dst+c]=(uint8_t)((generated.value.rgb[src+c]*alpha+127)/255);recreated.rgba[dst+3]=(uint8_t)alpha;}input=std::move(recreated);original=input;profile=@"standard";
   }
   if([job[@"speed"] isEqual:@"fast"] && !pixel){double factor=std::min(1.,512./std::max(input.width,input.height));if(factor<1)input=pixora::resize(input,std::max(1,(int)(input.width*factor)),std::max(1,(int)(input.height*factor)),false,_services.images);}
   [self change:^(NSMutableDictionary* s){s[@"aiInputWidth"]=@(input.width);s[@"aiInputHeight"]=@(input.height);s[@"timings"][@"prepareMs"]=@((self->_services.uptime()-prepared)*1000);s[@"state"]=@"RUNNING";s[@"backend"]=@"CPU";s[@"progress"]=@0;s[@"phase"]=@"loading_model";} persist:YES];
   pixora::Image full;full.width=input.width*4;full.height=input.height*4;full.rgba.resize((size_t)full.width*full.height*4);int code=0;
   double last=0;
   if(pixel){for(int y=0;y<input.height;y++){if(cancelled()){code=1;break;}for(int x=0;x<input.width;x++)for(int j=0;j<4;j++)for(int i=0;i<4;i++)std::copy_n(input.rgba.data()+((size_t)y*input.width+x)*4,4,full.rgba.data()+((size_t)(y*4+j)*full.width+x*4+i)*4);double now=self->_services.uptime();if(now-last>=.25 || y+1==input.height){last=now;[self change:^(NSMutableDictionary* s){s[@"phase"]=@"upscaling";s[@"progress"]=@(std::min(99.,(y+1.)/input.height*100));s[@"elapsedMs"]=@((now-start)*1000);} persist:NO];}}}
   else {
    int nativeProfile=[job[@"mode"] isEqual:@"illustration-fast"]?3:[profile isEqual:@"lite"]?1:[profile isEqual:@"art"]?2:[profile isEqual:@"natural"]?4:0;
    upscale::Callbacks hooks;
    hooks.stage=[&](int stage){[self change:^(NSMutableDictionary* s){s[@"phase"]=stage?@"upscaling":@"loading_model";} persist:NO];return !cancelled();};
    hooks.timing=[&](int stage,double value){NSArray* keys=@[@"modelLoadMs",@"gpuCheckMs",@"preprocessingMs",@"inferenceMs",@"assemblyMs"];[self change:^(NSMutableDictionary* s){s[@"timings"][keys[stage]]=@(value);} persist:NO];return !cancelled();};
    hooks.progress=[&](int done,int total){double now=self->_services.uptime();if(now-last>=.25 || done==total){last=now;[self change:^(NSMutableDictionary* s){s[@"phase"]=@"upscaling";s[@"completedTiles"]=@(done);s[@"totalTiles"]=@(total);s[@"progress"]=@(std::min(99.,done*100./total));s[@"elapsedMs"]=@((now-start)*1000);} persist:NO];}return !cancelled();};
    auto load=[](void* opaque,const upscale::Model& model){return pixora::loadModel(opaque,model);};
    auto infer=[&](int tile)->int {try{return _services.process({input.rgba.data(),input.width,input.height,input.width*4},{full.rgba.data(),full.width,full.height,full.width*4},false,tile,nativeProfile,false,_cancel,hooks,load);}catch(const std::bad_alloc&){return -5;}catch(const std::exception&){return -6;}};
    code=infer(64);
    if(code==-5 && !cancelled()){std::fill(full.rgba.begin(),full.rgba.end(),0);code=infer(32);}
   }
   if(code==1 || cancelled())PixoraFail(@"CANCELLED");if(code!=0)PixoraFail(code==-4?@"MODEL_INVALID":code==-5?@"LOW_MEMORY":@"INFERENCE_FAILED");
   [self change:^(NSMutableDictionary* s){s[@"state"]=@"FINALIZING";s[@"phase"]=@"building_result";s[@"progress"]=@-1;} persist:YES];
   int width=original.width*[job[@"scale"] intValue],height=original.height*[job[@"scale"] intValue];pixora::Image result=full.width==width && full.height==height?std::move(full):pixora::resize(full,width,height,pixel,_services.images);
   if(!pixora::finish(result,original,profile,cancelled,_services.images) || cancelled())PixoraFail(@"CANCELLED");
   [self change:^(NSMutableDictionary* s){s[@"phase"]=@"writing_result";} persist:NO];
   if(!pixora::write(result,output,@"png",_services.images))PixoraFail(@"LOW_STORAGE");NSDictionary* bounds=pixora::inspect(output,_services.images);if([bounds[@"width"] intValue]!=width || [bounds[@"height"] intValue]!=height)PixoraFail(@"INFERENCE_FAILED");
   double factor=std::min(1.,1536./std::max(width,height));pixora::Image preview=factor<1?pixora::resize(result,std::max(1,(int)(width*factor)),std::max(1,(int)(height*factor)),false,_services.images):std::move(result);if(!pixora::write(preview,previewURL,@"png",_services.images))PixoraFail(@"LOW_STORAGE");
   @synchronized(self){if(cancelled())PixoraFail(@"CANCELLED");[self change:^(NSMutableDictionary* s){s[@"state"]=@"SUCCEEDED";s[@"phase"]=@"complete";s[@"progress"]=@100;s[@"elapsedMs"]=@((self->_services.uptime()-start)*1000);s[@"resultPath"]=output.path;s[@"resultUri"]=previewURL.absoluteString;s[@"resultWidth"]=@(width);s[@"resultHeight"]=@(height);s[@"error"]=@"";} persist:YES];}
   [self notifyFinished];
  }catch(const std::bad_alloc&){PixoraFail(@"LOW_MEMORY");}catch(const std::exception&){PixoraFail(@"INFERENCE_FAILED");}}
  @catch(NSException* error){[NSFileManager.defaultManager removeItemAtURL:output error:nil];[NSFileManager.defaultManager removeItemAtURL:previewURL error:nil];BOOL cancel=[error.name isEqual:@"CANCELLED"] || _cancel.load();BOOL expired=_expired.load();BOOL timedOut=self->_services.uptime()-start>=1800;NSString* failure=error.name;if([job[@"processingKind"] isEqual:@"recreate"] && ![@[@"CANCELLED",@"TIME_LIMIT",@"LOW_STORAGE",@"LOW_MEMORY",@"MODEL_INVALID",@"RECREATE_MODEL_LOAD_FAILED",@"RECREATE_INVALID_INPUT",@"RECREATE_GENERATION_FAILED",@"RECREATE_INTERNAL_ERROR",@"MODEL_INTEGRITY_FAILED"] containsObject:failure])failure=@"RECREATE_INTERNAL_ERROR";@try{[self change:^(NSMutableDictionary* s){s[@"state"]=expired?@"INTERRUPTED":cancel && !timedOut?@"CANCELLED":@"FAILED";s[@"error"]=expired?@"INTERRUPTED":timedOut?@"TIME_LIMIT":cancel?@"":failure;s[@"progress"]=@-1;s[@"elapsedMs"]=@((self->_services.uptime()-start)*1000);} persist:YES];}@catch(NSException* disk){[self change:^(NSMutableDictionary* s){s[@"state"]=expired?@"INTERRUPTED":@"FAILED";s[@"error"]=expired?@"INTERRUPTED":@"LOW_STORAGE";} persist:NO];}}
  @finally{dispatch_sync(dispatch_get_main_queue(),^{[self endBackground];});@synchronized(self){_working=NO;}}
 }
}
- (void)notifyFinished {UNMutableNotificationContent* content=[UNMutableNotificationContent new];NSString* language=[_prefs stringForKey:@"language"]?:@"system";if([language isEqual:@"system"])language=[NSLocale preferredLanguages].firstObject;if([language.lowercaseString hasPrefix:@"zh"])language=@"zh-Hans";else if([language.lowercaseString hasPrefix:@"pt"])language=@"pt-BR";else language=[[language componentsSeparatedByString:@"-"] firstObject];NSURL* locale=[PixoraAssets() URLForResource:language withExtension:@"json"];NSDictionary* strings=locale?[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:locale] options:0 error:nil]:nil;content.title=strings[@"title"]?:@"Pixora";content.body=strings[@"imageReady"]?:@"Image ready";UNNotificationRequest* request=[UNNotificationRequest requestWithIdentifier:_session[@"jobId"] content:content trigger:nil];[UNUserNotificationCenter.currentNotificationCenter addNotificationRequest:request withCompletionHandler:nil];}
- (void)getCurrentSession:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{@synchronized(self){NSMutableArray* valid=[NSMutableArray array];for(NSDictionary* item in self->_session[@"exports"])if([NSFileManager.defaultManager fileExistsAtPath:[NSURL URLWithString:item[@"uri"]].path])[valid addObject:item];if(valid.count!=[self->_session[@"exports"] count])[self change:^(NSMutableDictionary* s){s[@"exports"]=valid;s[@"exportState"]=valid.count?@"EXPORTED":@"EXPORT_IDLE";} persist:YES];return [self snapshot];}}];}
- (void)cancelJob:(NSString*)job resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{@synchronized(self){if([self->_session[@"jobId"] isEqual:job] && [self busy]){self->_cancel.store(true);pixora::recreate::cancel();[self change:^(NSMutableDictionary* s){s[@"state"]=@"CANCELLING";} persist:YES];}return [self snapshot];}}];}
- (NSDictionary*)export:(NSString*)job format:(NSString*)format share:(BOOL)share {
 NSDictionary* state=[self requireResult:job];if([state[@"resolution"] isEqual:@"original"] && ![format isEqual:@"png"])PixoraFail(@"EXPORT_FAILED");if(![@[@"png",@"jpeg",@"webp"] containsObject:format])PixoraFail(@"EXPORT_FAILED");
 if(!share)for(NSDictionary* item in state[@"exports"])if([item[@"format"] isEqual:format] && [NSFileManager.defaultManager fileExistsAtPath:[NSURL URLWithString:item[@"uri"]].path]){[self event:@"export_finished" values:@{@"format":format,@"status":@"already_saved"}];return item;}
 NSURL* folder=share?[_root URLByAppendingPathComponent:@"share"]:[[NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"Pixora"];
 if(![NSFileManager.defaultManager createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil])PixoraFail(@"EXPORT_FAILED");
 NSString* ext=[format isEqual:@"jpeg"]?@"jpg":format;NSURL* file=[folder URLByAppendingPathComponent:[NSString stringWithFormat:@"Pixora-%@.%@",job,ext]];
 if(!share)[self change:^(NSMutableDictionary* s){s[@"exportState"]=@"EXPORTING";} persist:YES];
 NSDictionary* exported=nil;
 @try{try{if([state[@"resolution"] isEqual:@"original"]){[NSFileManager.defaultManager removeItemAtURL:file error:nil];if(![NSFileManager.defaultManager copyItemAtURL:[NSURL fileURLWithPath:state[@"resultPath"]] toURL:file error:nil])PixoraFail(@"EXPORT_FAILED");}else{pixora::Image result=pixora::decode([NSURL fileURLWithPath:state[@"resultPath"]],4096,_services.images);if(!pixora::write(result,file,format,_services.images))PixoraFail(@"EXPORT_FAILED");}NSNumber* size=nil;[file getResourceValue:&size forKey:NSURLFileSizeKey error:nil];NSDictionary* item=@{@"id":NSUUID.UUID.UUIDString,@"mime":[format isEqual:@"jpeg"]?@"image/jpeg":[format isEqual:@"png"]?@"image/png":@"image/webp",@"format":format,@"uri":file.absoluteString,@"width":state[@"resultWidth"],@"height":state[@"resultHeight"],@"size":size?:@0,@"createdAt":@(Now())};
 if(!share){BOOL first=[state[@"exports"] count]==0;[self change:^(NSMutableDictionary* s){NSMutableArray* retained=[NSMutableArray array];for(NSDictionary* existing in s[@"exports"])if(![existing[@"format"] isEqual:format])[retained addObject:existing];[retained addObject:item];s[@"exports"]=retained;s[@"exportState"]=@"EXPORTED";} persist:YES];if(first)[_prefs setInteger:[_prefs integerForKey:@"savedJobs"]+1 forKey:@"savedJobs"];[self event:@"export_finished" values:@{@"format":format,@"status":@"success"}];}exported=item;}catch(const std::bad_alloc&){PixoraFail(@"LOW_MEMORY");}catch(const std::exception&){PixoraFail(@"EXPORT_FAILED");}
 }@catch(NSException* error){[NSFileManager.defaultManager removeItemAtURL:file error:nil];if(!share){@try{[self change:^(NSMutableDictionary* s){s[@"exportState"]=@"EXPORT_FAILED";} persist:YES];}@catch(NSException* disk){[self change:^(NSMutableDictionary* s){s[@"exportState"]=@"EXPORT_FAILED";} persist:NO];}}[self event:@"export_finished" values:@{@"format":format,@"status":@"error",@"error_code":@"EXPORT_FAILED"}];@throw error;}
 return exported;
}
- (void)exportResult:(NSString*)job format:(NSString*)format resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{return [self export:job format:format share:NO];}];}
- (void)shareResult:(NSString*)job format:(NSString*)format resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:^(id item){dispatch_async(dispatch_get_main_queue(),^{UIViewController* vc=Presenter();if(!vc){reject(@"SHARE_FAILED",@"Sharing unavailable",nil);return;}UIActivityViewController* activity=[[UIActivityViewController alloc] initWithActivityItems:@[[NSURL URLWithString:item[@"uri"]]] applicationActivities:nil];activity.popoverPresentationController.sourceView=vc.view;activity.popoverPresentationController.sourceRect=CGRectMake(CGRectGetMidX(vc.view.bounds),CGRectGetMidY(vc.view.bounds),1,1);[vc presentViewController:activity animated:YES completion:^{[self event:@"share_opened" values:@{@"format":format,@"status":@"success"}];resolve(@YES);}];});} reject:reject work:^id{return [self export:job format:format share:YES];}];}
- (void)openExport:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:^(id item){dispatch_async(dispatch_get_main_queue(),^{UIViewController* vc=Presenter();if(!vc){resolve(@NO);return;}self->_document=[UIDocumentInteractionController interactionControllerWithURL:[NSURL URLWithString:item[@"uri"]]];self->_document.delegate=self;BOOL opened=[self->_document presentPreviewAnimated:YES];if(!opened)opened=[self->_document presentOptionsMenuFromRect:vc.view.bounds inView:vc.view animated:YES];resolve(@(opened));});} reject:reject work:^id{for(NSDictionary* item in [self snapshot][@"exports"])if([item[@"id"] isEqual:identifier] && [NSFileManager.defaultManager fileExistsAtPath:[NSURL URLWithString:item[@"uri"]].path])return item;PixoraFail(@"EXPORT_FAILED");return nil;}];}
- (UIViewController*)documentInteractionControllerViewControllerForPreview:(UIDocumentInteractionController*)controller{return Presenter();}
- (void)discardSession:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self requireIdle];[self removeSession];[self change:^(NSMutableDictionary* s){} persist:YES];return [self snapshot];}];}
- (void)clearTemporaryFiles:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self requireIdle];long long before=[self workBytes];[self clearShares];return @(before-[self workBytes]);}];}
- (void)completeOnboarding:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self->_prefs setInteger:1 forKey:@"productIntroVersion"];return [self settings];}];}
- (void)getSettings:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{return [self settings];}];}
- (void)updateSettings:(NSString*)language format:(NSString*)format theme:(NSString*)theme resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{
 NSDictionary* previous=[self settings];NSArray* locales=[NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleLocalizations"];
 if(![language isEqual:@"system"] && ![locales containsObject:language])PixoraFail(@"INFERENCE_FAILED");if(![@[@"png",@"jpeg",@"webp"] containsObject:format] || ![@[@"system",@"light",@"dark"] containsObject:theme])PixoraFail(@"INFERENCE_FAILED");
 [self->_prefs setObject:language forKey:@"language"];[self->_prefs setObject:format forKey:@"format"];[self->_prefs setObject:theme forKey:@"theme"];
 if([language isEqual:@"system"])[self->_prefs removeObjectForKey:@"AppleLanguages"];else [self->_prefs setObject:@[language] forKey:@"AppleLanguages"];
 dispatch_async(dispatch_get_main_queue(),^{for(UIWindow* window in Windows())window.overrideUserInterfaceStyle=[theme isEqual:@"dark"]?UIUserInterfaceStyleDark:[theme isEqual:@"light"]?UIUserInterfaceStyleLight:UIUserInterfaceStyleUnspecified;});
 for(NSString* key in @[@"language",@"format",@"theme"]){NSString* value=[self settings][key];if(![previous[key] isEqual:value])[self event:@"settings_changed" values:@{@"setting":key,@"value":value}];}return [self settings];}];}
- (void)dismissNotificationHint:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{if(![[self snapshot][@"sessionId"] isEqual:identifier])PixoraFail(@"SOURCE_UNAVAILABLE");[self->_prefs setObject:identifier forKey:@"notificationDismissedSession"];return [self settings];}];}
- (void)markNotificationHint:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self->_prefs setInteger:std::min(3L,[self->_prefs integerForKey:@"notificationHintCount"]+1) forKey:@"notificationHintCount"];return [self settings];}];}
- (void)markNotificationIntroSeen:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{[self->_prefs setBool:YES forKey:@"notificationIntroSeen"];return [self settings];}];}
- (void)setCacheLimit:(double)limit resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{if(![@[@-1,@0,@10,@50,@200] containsObject:@(limit)])PixoraFail(@"INFERENCE_FAILED");[self->_prefs setInteger:(NSInteger)limit forKey:@"cacheLimitMiB"];[self event:@"settings_changed" values:@{@"setting":@"cache_limit",@"value":@(limit)}];return [self settings];}];}
- (void)setRecommendationContext:(NSString*)job recommendedProfile:(NSString*)profile recommendationApplied:(BOOL)applied resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{NSSet* profiles=[NSSet setWithArray:Presets()];if(job.length==0 || (profile.length>0 && ![profiles containsObject:profile]) || (applied && profile.length==0))PixoraFail(@"INFERENCE_FAILED");@synchronized(self){if(![self->_session[@"jobId"] isEqual:job])PixoraFail(@"SOURCE_UNAVAILABLE");BOOL set=[self->_session[@"recommendationContextSet"] boolValue];if(set && (![self->_session[@"recommendedProfile"] isEqual:profile] || [self->_session[@"recommendationApplied"] boolValue]!=applied))PixoraFail(@"RECOMMENDATION_CONTEXT_ALREADY_SET");if(!set)[self change:^(NSMutableDictionary* s){s[@"recommendedProfile"]=profile;s[@"recommendationApplied"]=@(applied);s[@"recommendationContextSet"]=@YES;} persist:YES];return [self snapshot];}}];}
- (void)submitResultRating:(NSString*)job rating:(double)rating resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
 [self perform:resolve reject:reject work:^id{
  if(!std::isfinite(rating) || rating!=(NSInteger)rating || rating<1 || rating>5)PixoraFail(@"FEEDBACK_INVALID");
  BOOL recorded=NO;NSDictionary* result=nil;NSDictionary* telemetryContext=nil;
  @synchronized(self){
   if(![self->_session[@"jobId"] isEqual:job] || ![self->_session[@"state"] isEqual:@"SUCCEEDED"])PixoraFail(@"SOURCE_UNAVAILABLE");
   NSInteger previous=[self->_session[@"resultRating"] integerValue];if(previous!=0 && previous!=(NSInteger)rating)PixoraFail(@"RATING_ALREADY_SUBMITTED");
   if(previous==0){recorded=YES;[self change:^(NSMutableDictionary* s){s[@"resultRating"]=@((NSInteger)rating);} persist:YES];}
   result=[self snapshot];NSDictionary* image=self->_session[@"image"]==NSNull.null?@{}:self->_session[@"image"];
   BOOL recreate=[self->_session[@"processingKind"] isEqual:@"recreate"];
   NSMutableDictionary* context=[@{@"attempt_token":self->_session[@"jobId"]?:@"",@"processing_kind":recreate?@"recreate":@"enhance",@"profile_id":self->_session[@"profileId"]?:self->_session[@"mode"]?:@"",@"model_version":self->_session[@"modelId"]?:@"",@"recommended_profile":[self->_session[@"recommendedProfile"] length]?self->_session[@"recommendedProfile"]:@"none",@"recommendation_applied":[self->_session[@"recommendationApplied"] boolValue]?@1:@0,@"speed":self->_session[@"speed"]?:@"quality",@"scale":self->_session[@"scale"]?:@0,@"backend":self->_session[@"backend"]?:@"",@"source_width":image[@"width"]?:@0,@"source_height":image[@"height"]?:@0,@"input_width":self->_session[@"aiInputWidth"]?:image[@"workWidth"]?:@0,@"input_height":self->_session[@"aiInputHeight"]?:image[@"workHeight"]?:@0,@"output_width":self->_session[@"resultWidth"]?:@0,@"output_height":self->_session[@"resultHeight"]?:@0,@"source_format":[image[@"mime"] isEqual:@"image/png"]?@"png":[image[@"mime"] isEqual:@"image/jpeg"]?@"jpeg":[image[@"mime"] isEqual:@"image/webp"]?@"webp":@"other",@"has_alpha":[image[@"hasAlpha"] boolValue]?@1:@0,@"duration_ms":self->_session[@"elapsedMs"]?:@0,@"rating":@((NSInteger)rating)} mutableCopy];
   if(recreate){context[@"steps"]=self->_session[@"recreateSteps"]?:@4;context[@"strength"]=@0.6;context[@"cfg"]=@1;context[@"recreate_revision"]=self->_session[@"recreateModelRevision"]?:@"";context[@"prompt_present"]=[self->_session[@"recreatePrompt"] length]?@1:@0;}
   telemetryContext=context;
  }
  if(recorded)[self event:@"result_rating_submitted" values:telemetryContext];return result;
 }];
}
- (void)openStoreReview:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
 dispatch_async(dispatch_get_main_queue(),^{
  NSURL* url=[NSURL URLWithString:@"https://play.google.com/store/apps/details?id=dev.kigya.pixora"];
  [UIApplication.sharedApplication openURL:url options:@{} completionHandler:^(BOOL opened){
   resolve(@(opened));
  }];
 });
}
- (void)requestNotifications:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[_prefs setBool:YES forKey:@"notificationAsked"];[UNUserNotificationCenter.currentNotificationCenter requestAuthorizationWithOptions:UNAuthorizationOptionAlert|UNAuthorizationOptionSound completionHandler:^(BOOL granted,NSError* error){resolve(@(granted && !error));}];}
- (void)getNotificationStatus:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[UNUserNotificationCenter.currentNotificationCenter getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* settings){resolve(@(settings.authorizationStatus==UNAuthorizationStatusAuthorized || settings.authorizationStatus==UNAuthorizationStatusProvisional || settings.authorizationStatus==UNAuthorizationStatusEphemeral));}];}
- (void)openNotificationSettings:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {dispatch_async(dispatch_get_main_queue(),^{NSString* value=UIApplicationOpenSettingsURLString;if(@available(iOS 16.0,*))value=UIApplicationOpenNotificationSettingsURLString;[UIApplication.sharedApplication openURL:[NSURL URLWithString:value] options:@{} completionHandler:^(BOOL ok){resolve(@(ok));}];});}
- (void)getLegalText:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{NSURL* legal=[PixoraAssets() URLForResource:@"LEGAL" withExtension:@"txt"];NSString* text=legal?[NSString stringWithContentsOfURL:legal encoding:NSUTF8StringEncoding error:nil]:nil;if(!text)PixoraFail(@"SOURCE_UNAVAILABLE");NSURL* extraURL=[PixoraAssets() URLForResource:@"LEGAL-ios" withExtension:@"txt"];NSString* extra=extraURL?[NSString stringWithContentsOfURL:extraURL encoding:NSUTF8StringEncoding error:nil]:nil;if(!extra)PixoraFail(@"SOURCE_UNAVAILABLE");return [text stringByAppendingFormat:@"\n\n%@",extra];}];}
- (void)claimReviewPrompt:(NSString*)job resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{@synchronized(self){NSDictionary* state=[self->_prefs dictionaryForKey:@"reviewPromptState"]?:@{};NSSet* shown=[NSSet setWithArray:state[@"shownJobIds"]?:@[]];return @(ReviewPromptCanShow([self snapshot],job,shown,[state[@"lastShownAt"] doubleValue],Now()));}}];}
- (void)markReviewPromptShown:(NSString*)job resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self perform:resolve reject:reject work:^id{@synchronized(self){NSDictionary* previous=[self->_prefs dictionaryForKey:@"reviewPromptState"]?:@{};NSMutableSet* shown=[NSMutableSet setWithArray:previous[@"shownJobIds"]?:@[]];NSDictionary* current=[self snapshot];double now=Now();if([current[@"jobId"] isEqual:job] && [current[@"state"] isEqual:@"SUCCEEDED"] && [shown containsObject:job])return @YES;if(!ReviewPromptCanShow(current,job,shown,[previous[@"lastShownAt"] doubleValue],now))return @NO;[shown addObject:job];NSDictionary* next=@{@"shownJobIds":shown.allObjects,@"lastShownAt":@(now)};[self->_prefs setObject:next forKey:@"reviewPromptState"];if(![self->_prefs synchronize]){if(previous.count)[self->_prefs setObject:previous forKey:@"reviewPromptState"];else [self->_prefs removeObjectForKey:@"reviewPromptState"];PixoraFail(@"SETTINGS_WRITE_FAILED");}[self event:@"review_prompt_shown" values:@{@"status":@"shown"}];return @YES;}}];}
- (void)requestReview:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[self openStoreReview:resolve reject:reject];}
- (void)getFeedbackStatus:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {resolve(@([PixoraFeedback validEndpoint:Endpoint()]));}
- (void)sendFeedback:(NSString*)email message:(NSString*)message rating:(double)rating requestId:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {[PixoraFeedback send:Endpoint() email:email message:message rating:rating identifier:identifier resolve:resolve reject:reject];}
- (void)invalidate {
 // A bridge reload releases JS subscriptions, not the native job owner.
 dispatch_async(dispatch_get_main_queue(),^{self->_eventEmitterCallback={};self->_pickerResolve=nil;self->_pickerReject=nil;});
}
@end
