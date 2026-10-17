#import <XCTest/XCTest.h>
#import <PixoraNative/PixoraUpscale.h>
#import "../Native/PixoraImages.h"
#import <PhotosUI/PhotosUI.h>
#import <UserNotifications/UserNotifications.h>
#import <StoreKit/StoreKit.h>
#import <objc/runtime.h>
#import "Support/NotificationAvailability.h"
#import <FirebaseAnalytics/FirebaseAnalytics.h>
#include <cmath>
@interface PixoraUpscale (PlatformTests)
- (NSMutableDictionary*)empty;
- (NSDictionary*)import:(NSURL*)url;
- (NSDictionary*)snapshot;
- (void)layoutChanged:(NSNotification*)notification;
- (void)picker:(PHPickerViewController*)picker didFinishPicking:(NSArray*)results;
- (UIViewController*)documentInteractionControllerViewControllerForPreview:(id)controller;
- (void)configureTelemetry;
- (void)notifyFinished;
- (BOOL)validateModels;
- (void)runJob;
@end
@interface NSObject (PixoraDelegateTests)
- (NSURL*)sourceURLForBridge:(id)bridge;
@end
static NSArray* TestWindows;static NSSet* TestScenes;static NSArray* SceneWindows;
@interface EmptyGlobalPreferences:NSUserDefaults
@property(nonatomic,strong)NSArray* globalLanguages;
@end
@implementation EmptyGlobalPreferences
- (NSDictionary*)persistentDomainForName:(NSString*)name {return [name isEqual:NSGlobalDomain]?(self.globalLanguages?@{@"AppleLanguages":self.globalLanguages}:@{}):[super persistentDomainForName:name];}
@end
static IMP OriginalJSON,OriginalLog,OriginalInfo;static NSDictionary* Logged;static BOOL HideVersion;
static id JSONValue(id self,SEL cmd,NSData* data,NSJSONReadingOptions options,NSError** error){if([[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding]isEqual:@"nonfinite-fault"])return @{@"duration_ms":@(NAN),@"action":@"valid",@"filename":@"private.png"};return ((id(*)(id,SEL,NSData*,NSJSONReadingOptions,NSError**))OriginalJSON)(self,cmd,data,options,error);}
static void LogValue(id self,SEL cmd,NSString* name,NSDictionary* values){Logged=values;}
static id InfoValue(id self,SEL cmd,NSString* key){if(HideVersion && [key isEqual:@"CFBundleShortVersionString"])return nil;return ((id(*)(id,SEL,NSString*))OriginalInfo)(self,cmd,key);}
static IMP OriginalWindows,OriginalScenes,OriginalDocument,OriginalCenter,OriginalOpenURL,OriginalReview,OriginalSceneReview,OriginalBundleURL,OriginalApplicationState;
static NSMutableDictionary* BundleURLOverrides;static UIApplicationState ApplicationState=UIApplicationStateActive;static void(^BackgroundEntry)(void);
static NSURL* BundleURL(id self,SEL cmd,NSString* name,NSString* extension){NSString* key=extension?[name stringByAppendingPathExtension:extension]:name;id override=key?BundleURLOverrides[key]:nil;if(override)return override==NSNull.null?nil:override;return ((NSURL*(*)(id,SEL,NSString*,NSString*))OriginalBundleURL)(self,cmd,name,extension);}
static UIApplicationState State(id self,SEL cmd){if(BackgroundEntry){void(^entry)(void)=BackgroundEntry;BackgroundEntry=nil;entry();}return ApplicationState;}
static BOOL PreviewOpens,MenuOpens;
@interface LocalDocument:NSObject
@property(nonatomic,weak)id delegate;
@end
@implementation LocalDocument
- (BOOL)presentPreviewAnimated:(BOOL)animated{return PreviewOpens;}
- (BOOL)presentOptionsMenuFromRect:(CGRect)rect inView:(UIView*)view animated:(BOOL)animated{return MenuOpens;}
@end
static id Document(id self,SEL cmd,NSURL* url){return [LocalDocument new];}
static NSArray* Windows(id self,SEL cmd){return TestWindows;}
static NSSet* Scenes(id self,SEL cmd){return TestScenes;}
static NSInteger Authorization=UNAuthorizationStatusDenied,ReviewCalls;static BOOL PermissionGranted,PermissionError,OpenSucceeds;static NSURL* OpenedURL;
@interface LocalNotificationSettings:NSObject
@end
@implementation LocalNotificationSettings
- (UNAuthorizationStatus)authorizationStatus{return (UNAuthorizationStatus)Authorization;}
@end
@interface LocalNotifications:NSObject
@property(nonatomic,strong)UNNotificationRequest* request;
@end
@implementation LocalNotifications
- (void)requestAuthorizationWithOptions:(UNAuthorizationOptions)options completionHandler:(void(^)(BOOL,NSError*))handler{handler(PermissionGranted,PermissionError?[NSError errorWithDomain:NSCocoaErrorDomain code:1 userInfo:nil]:nil);}
- (void)getNotificationSettingsWithCompletionHandler:(void(^)(UNNotificationSettings*))handler{handler((UNNotificationSettings*)[LocalNotificationSettings new]);}
- (void)addNotificationRequest:(UNNotificationRequest*)request withCompletionHandler:(void(^)(NSError*))handler{self.request=request;if(handler)handler(nil);}
@end
static LocalNotifications* Notifications;
static id Center(id self,SEL cmd){return Notifications;}
static void OpenURL(id self,SEL cmd,NSURL* url,NSDictionary* options,void(^handler)(BOOL)){OpenedURL=url;handler(OpenSucceeds);}
static void Review(id self,SEL cmd){ReviewCalls++;}
static void SceneReview(id self,SEL cmd,UIWindowScene* scene){ReviewCalls++;}
@interface LocalScene:NSObject
@property(nonatomic)UISceneActivationState activationState;
@property(nonatomic)BOOL windowScene;
@end
@implementation LocalScene
- (BOOL)isKindOfClass:(Class)kind{if(kind==UIWindowScene.class)return self.windowScene;return [super isKindOfClass:kind];}
- (NSArray*)windows{return SceneWindows?:TestWindows;}
@end
@interface PlatformPresenter:UIViewController
@property(nonatomic,strong)UIViewController* captured;
@property(nonatomic,strong)UIViewController* child;
@end
@implementation PlatformPresenter
- (UIViewController*)presentedViewController{return self.child;}
- (void)presentViewController:(UIViewController*)controller animated:(BOOL)animated completion:(void(^)(void))completion{self.captured=controller;if(completion)completion();}
@end
@interface PlatformWindow:UIWindow
@property(nonatomic)BOOL selected;
@end
@implementation PlatformWindow
- (BOOL)isKeyWindow{return self.selected;}
@end
@interface PickerResult:NSObject
@property(nonatomic,strong)NSItemProvider* itemProvider;
@end
@implementation PickerResult
@end
@interface LocalProvider:NSItemProvider
@property(nonatomic,strong)NSArray* types;
@property(nonatomic,strong)NSURL* file;
@property(nonatomic,strong)NSError* error;
@end
@implementation LocalProvider
- (NSArray*)registeredTypeIdentifiers{return self.types;}
- (NSProgress*)loadFileRepresentationForTypeIdentifier:(NSString*)type completionHandler:(void(^)(NSURL*,NSError*))handler{handler(self.file,self.error);return [NSProgress progressWithTotalUnitCount:1];}
@end
@interface PixoraPlatformTests:XCTestCase
@end
@implementation PixoraPlatformTests {
 PixoraUpscale* _module;NSURL* _folder;PlatformPresenter* _presenter;
}
- (void)setUp {
 [super setUp];_module=[PixoraUpscale new];_folder=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString] isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:_folder withIntermediateDirectories:YES attributes:nil error:nil];[_module setValue:_folder forKey:@"root"];[_module setValue:[_module empty] forKey:@"session"];[_module setValue:[[NSUserDefaults alloc]initWithSuiteName:NSUUID.UUID.UUIDString] forKey:@"prefs"];[_module setValue:nil forKey:@"telemetryOverride"];[_module configureTelemetry];
 _presenter=[PlatformPresenter new];PlatformWindow* window=[[PlatformWindow alloc]initWithFrame:CGRectMake(0,0,420,800)];window.selected=YES;window.rootViewController=_presenter;TestWindows=@[window];TestScenes=[NSSet set];OriginalWindows=method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(windows)),(IMP)Windows);OriginalScenes=method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(connectedScenes)),(IMP)Scenes);OriginalDocument=method_setImplementation(class_getClassMethod(UIDocumentInteractionController.class,@selector(interactionControllerWithURL:)),(IMP)Document);Notifications=[LocalNotifications new];OriginalCenter=method_setImplementation(class_getClassMethod(UNUserNotificationCenter.class,@selector(currentNotificationCenter)),(IMP)Center);OriginalOpenURL=method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(openURL:options:completionHandler:)),(IMP)OpenURL);OriginalReview=method_setImplementation(class_getClassMethod(SKStoreReviewController.class,@selector(requestReview)),(IMP)Review);OriginalSceneReview=method_setImplementation(class_getClassMethod(SKStoreReviewController.class,@selector(requestReviewInScene:)),(IMP)SceneReview);ReviewCalls=0;BundleURLOverrides=[NSMutableDictionary dictionary];OriginalBundleURL=method_setImplementation(class_getInstanceMethod(NSBundle.class,@selector(URLForResource:withExtension:)),(IMP)BundleURL);OriginalApplicationState=method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(applicationState)),(IMP)State);ApplicationState=UIApplicationStateActive;BackgroundEntry=nil;
}
- (void)tearDown{method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(windows)),OriginalWindows);method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(connectedScenes)),OriginalScenes);method_setImplementation(class_getClassMethod(UIDocumentInteractionController.class,@selector(interactionControllerWithURL:)),OriginalDocument);method_setImplementation(class_getClassMethod(UNUserNotificationCenter.class,@selector(currentNotificationCenter)),OriginalCenter);method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(openURL:options:completionHandler:)),OriginalOpenURL);method_setImplementation(class_getClassMethod(SKStoreReviewController.class,@selector(requestReview)),OriginalReview);method_setImplementation(class_getClassMethod(SKStoreReviewController.class,@selector(requestReviewInScene:)),OriginalSceneReview);method_setImplementation(class_getInstanceMethod(NSBundle.class,@selector(URLForResource:withExtension:)),OriginalBundleURL);method_setImplementation(class_getInstanceMethod(UIApplication.class,@selector(applicationState)),OriginalApplicationState);BundleURLOverrides=nil;BackgroundEntry=nil;Notifications=nil;OpenedURL=nil;TestWindows=nil;TestScenes=nil;SceneWindows=nil;[_module setEventEmitterCallback:[EventEmitterCallbackWrapper new]];[NSFileManager.defaultManager removeItemAtURL:_folder error:nil];[super tearDown];}
- (id)await:(void(^)(RCTPromiseResolveBlock,RCTPromiseRejectBlock))operation error:(NSString**)error{XCTestExpectation* done=[self expectationWithDescription:@"platform promise"];__block id result;__block NSString* code;operation(^(id value){result=value;[done fulfill];},^(NSString* key,NSString* message,NSError* native){code=key;[done fulfill];});[self waitForExpectations:@[done] timeout:10];if(error)*error=code;else XCTAssertNil(code);return result;}
- (void)pickWithProvider:(LocalProvider*)provider error:(NSString**)error {
 PickerResult* result=[PickerResult new];result.itemProvider=provider;
 [self await:^(RCTPromiseResolveBlock resolve,RCTPromiseRejectBlock reject){[self->_module setValue:resolve forKey:@"pickerResolve"];[self->_module setValue:reject forKey:@"pickerReject"];[self->_module picker:nil didFinishPicking:@[(PHPickerResult*)result]];} error:error];
}
- (void)testPickerCancellationAndProviderFailures {
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module pickImage:a reject:b];dispatch_async(dispatch_get_main_queue(),^{XCTAssertTrue([self->_presenter.captured isKindOfClass:PHPickerViewController.class]);[self->_module picker:nil didFinishPicking:@[]];});} error:nil];
 [_module picker:nil didFinishPicking:@[]];
 NSString* error=nil;LocalProvider* provider=[LocalProvider new];provider.types=@[@"public.heic"];[self pickWithProvider:provider error:&error];XCTAssertEqualObjects(error,@"UNSUPPORTED_FORMAT");provider.types=@[@"public.png"];[self pickWithProvider:provider error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");provider.error=[NSError errorWithDomain:NSCocoaErrorDomain code:1 userInfo:nil];[self pickWithProvider:provider error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");
 provider.error=nil;provider.file=[_folder URLByAppendingPathComponent:@"missing"];[self pickWithProvider:provider error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");
 pixora::Image image;image.width=3;image.height=2;image.rgba.assign(24,255);provider.file=[_folder URLByAppendingPathComponent:@"source.png"];XCTAssertTrue(pixora::write(image,provider.file,@"png"));[self pickWithProvider:provider error:nil];XCTAssertEqualObjects([_module snapshot][@"state"],@"READY");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module inspectSelection:[self->_module snapshot][@"image"][@"id"] resolve:a reject:b];} error:nil];
 NSString* identifier=[_module snapshot][@"sessionId"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module dismissNotificationHint:identifier resolve:a reject:b];} error:nil];
 [_module setValue:^(id value){} forKey:@"pickerResolve"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module pickImage:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"BUSY");[_module setValue:nil forKey:@"pickerResolve"];
 TestWindows=@[];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module pickImage:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");XCTAssertNil([_module documentInteractionControllerViewControllerForPreview:nil]);
}
- (void)testShareAndOpenUseLocalFilesAndPresenter {
 pixora::Image image;image.width=3;image.height=2;image.rgba.assign(24,255);NSURL* file=[_folder URLByAppendingPathComponent:@"result.png"];XCTAssertTrue(pixora::write(image,file,@"png"));NSMutableDictionary* state=[_module valueForKey:@"session"];state[@"state"]=@"SUCCEEDED";state[@"jobId"]=@"export-test";state[@"resultPath"]=file.path;state[@"resultWidth"]=@3;state[@"resultHeight"]=@2;
 XCTAssertTrue([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module shareResult:@"export-test" format:@"png" resolve:a reject:b];} error:nil] boolValue]);XCTAssertTrue([_presenter.captured isKindOfClass:UIActivityViewController.class]);
 NSDictionary* exported=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:@"export-test" format:@"png" resolve:a reject:b];} error:nil];
 for(int mask=0;mask<4;mask++){PreviewOpens=(mask&1)!=0;MenuOpens=(mask&2)!=0;NSNumber* opened=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openExport:exported[@"id"] resolve:a reject:b];} error:nil];XCTAssertEqual(opened.boolValue,PreviewOpens||MenuOpens);}
 XCTAssertEqual([_module documentInteractionControllerViewControllerForPreview:nil],_presenter);
 NSString* wrongError=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openExport:@"wrong-id" resolve:a reject:b];} error:&wrongError];XCTAssertEqualObjects(wrongError,@"EXPORT_FAILED");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:@"wrong-job" format:@"png" resolve:a reject:b];} error:&wrongError];XCTAssertEqualObjects(wrongError,@"EXPORT_FAILED");
 NSDictionary* jpeg=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:@"export-test" format:@"jpeg" resolve:a reject:b];} error:nil];
 [NSFileManager.defaultManager removeItemAtURL:[NSURL URLWithString:exported[@"uri"]] error:nil];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openExport:exported[@"id"] resolve:a reject:b];} error:&wrongError];XCTAssertEqualObjects(wrongError,@"EXPORT_FAILED");
 exported=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:@"export-test" format:@"png" resolve:a reject:b];} error:nil];XCTAssertEqual([[_module snapshot][@"exports"]count],2u);
 [NSFileManager.defaultManager removeItemAtURL:[NSURL URLWithString:jpeg[@"uri"]] error:nil];NSDictionary* retained=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getCurrentSession:a reject:b];} error:nil];XCTAssertEqual([retained[@"exports"]count],1u);XCTAssertEqualObjects(retained[@"exportState"],@"EXPORTED");
 TestWindows=@[];XCTAssertFalse([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openExport:exported[@"id"] resolve:a reject:b];} error:nil] boolValue]);NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module shareResult:@"export-test" format:@"png" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"SHARE_FAILED");
 [NSFileManager.defaultManager removeItemAtURL:[NSURL URLWithString:exported[@"uri"]] error:nil];NSDictionary* cleaned=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getCurrentSession:a reject:b];} error:nil];XCTAssertEqual([cleaned[@"exports"] count],0u);XCTAssertEqualObjects(cleaned[@"exportState"],@"EXPORT_IDLE");
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:@"export-test" format:@"invalid" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"EXPORT_FAILED");
 [NSFileManager.defaultManager removeItemAtURL:file error:nil];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module exportResult:@"export-test" format:@"png" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"DECODE_FAILED");XCTAssertEqualObjects([_module snapshot][@"exportState"],@"EXPORT_FAILED");
}
- (void)testAppBundleAndModelFailureGuards {
 BundleURLOverrides[@"main.jsbundle"]=NSNull.null;XCTAssertNoThrow([(NSObject*)UIApplication.sharedApplication.delegate sourceURLForBridge:nil]);[BundleURLOverrides removeAllObjects];
 NSURL* manifestURL=[PixoraAssets() URLForResource:@"model-manifest" withExtension:@"json"];NSDictionary* manifest=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:manifestURL] options:0 error:nil];NSURL* fixture=[_folder URLByAppendingPathComponent:@"manifest.json"];
 BundleURLOverrides[@"model-manifest.json"]=NSNull.null;[_module setValue:@NO forKey:@"modelsChecked"];XCTAssertFalse([_module validateModels]);
 for(id invalid in @[@[],@{},@"invalid JSON"]){NSData* data=[invalid isKindOfClass:NSString.class]?[invalid dataUsingEncoding:NSUTF8StringEncoding]:[NSJSONSerialization dataWithJSONObject:invalid options:0 error:nil];[data writeToURL:fixture atomically:YES];BundleURLOverrides[@"model-manifest.json"]=fixture;[_module setValue:@NO forKey:@"modelsChecked"];XCTAssertFalse([_module validateModels]);}
 NSMutableDictionary* wrong=[manifest mutableCopy];for(NSString* name in manifest)wrong[name]=@"wrong digest";[[NSJSONSerialization dataWithJSONObject:wrong options:0 error:nil]writeToURL:fixture atomically:YES];[_module setValue:@NO forKey:@"modelsChecked"];XCTAssertFalse([_module validateModels]);[BundleURLOverrides removeAllObjects];
 NSString* first=manifest.allKeys.firstObject;for(NSURL* invalid in @[[NSURL URLWithString:@"pixora-test://missing"],_folder]){BundleURLOverrides[first]=invalid;[_module setValue:@NO forKey:@"modelsChecked"];XCTAssertFalse([_module validateModels]);}[BundleURLOverrides removeAllObjects];[_module setValue:@NO forKey:@"modelsChecked"];XCTAssertTrue([_module validateModels]);
}
- (void)testInactiveLaunchAndStorageFailure {
 pixora::Image image;image.width=3;image.height=2;image.rgba.assign(24,255);NSURL* source=[_folder URLByAppendingPathComponent:@"source.png"];XCTAssertTrue(pixora::write(image,source,@"png"));NSDictionary* imported=[_module import:source];ApplicationState=UIApplicationStateBackground;
 for(int diskFails=0;diskFails<2;diskFails++){if(diskFails)BackgroundEntry=^{[self->_module setValue:[self->_folder URLByAppendingPathComponent:@"missing/child"] forKey:@"root"];};[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module startJobWithProfile:imported[@"id"] scale:2 profile:@"pixel" speed:@"quality" preparationConfirmed:NO resolve:a reject:b];} error:nil];NSDate* deadline=[NSDate dateWithTimeIntervalSinceNow:5];while([deadline timeIntervalSinceNow]>0 && ![[_module snapshot][@"state"]isEqual:@"INTERRUPTED"])[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.01]];XCTAssertEqualObjects([_module snapshot][@"state"],@"INTERRUPTED");[_module setValue:_folder forKey:@"root"];}
 NSMutableDictionary* state=[_module valueForKey:@"session"];state[@"state"]=@"PREPARING";[_module setValue:@YES forKey:@"working"];[_module setValue:[_folder URLByAppendingPathComponent:@"missing/child"] forKey:@"root"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{[self->_module runJob];a(@YES);});} error:nil];XCTAssertEqualObjects([_module snapshot][@"state"],@"FAILED");XCTAssertEqualObjects([_module snapshot][@"error"],@"LOW_STORAGE");[_module setValue:_folder forKey:@"root"];
 NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module sendFeedback:@"invalid email" message:@"valid message" rating:0 requestId:NSUUID.UUID.UUIDString.lowercaseString resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"FEEDBACK_INVALID");
}
- (void)testNotificationsScenesAndNativeReview {
 XCTAssertNotNil([(NSObject*)UIApplication.sharedApplication.delegate sourceURLForBridge:nil]);
 Class windowClass=NSClassFromString(@"PixoraWindow");UIWindow* layoutWindow=[[windowClass alloc]initWithFrame:CGRectMake(0,0,200,300)];[layoutWindow layoutSubviews];[layoutWindow layoutSubviews];layoutWindow.bounds=CGRectMake(0,0,300,200);[layoutWindow layoutSubviews];
 for(int mask=0;mask<4;mask++){PermissionGranted=(mask&1)!=0;PermissionError=(mask&2)!=0;NSNumber* granted=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module requestNotifications:a reject:b];} error:nil];XCTAssertEqual(granted.boolValue,PermissionGranted&&!PermissionError);}
 for(NSNumber* status in @[@(UNAuthorizationStatusNotDetermined),@(UNAuthorizationStatusDenied),@(UNAuthorizationStatusAuthorized),@(UNAuthorizationStatusProvisional),@(UNAuthorizationStatusEphemeral)]){Authorization=status.integerValue;NSNumber* allowed=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getNotificationStatus:a reject:b];} error:nil];XCTAssertEqual(allowed.boolValue,Authorization>=UNAuthorizationStatusAuthorized);}
 for(int value=0;value<2;value++){OpenSucceeds=value;NSNumber* opened=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openNotificationSettings:a reject:b];} error:nil];XCTAssertEqual(opened.boolValue,OpenSucceeds);XCTAssertEqualObjects(OpenedURL.scheme,@"app-settings");}
 NSMutableDictionary* state=[_module valueForKey:@"session"];state[@"jobId"]=@"notification-job";NSUserDefaults* prefs=[_module valueForKey:@"prefs"];for(NSString* language in @[@"zh-TW",@"pt-PT",@"en",@"unknown",@"system"]){[prefs setObject:language forKey:@"language"];[_module notifyFinished];XCTAssertGreaterThan(Notifications.request.content.body.length,0u);XCTAssertEqualObjects(Notifications.request.identifier,@"notification-job");}
 XCTAssertTrue([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module requestReview:a reject:b];} error:nil] boolValue]);XCTAssertEqual(ReviewCalls,1);
 LocalScene* scene=[LocalScene new];scene.windowScene=YES;scene.activationState=UISceneActivationStateForegroundActive;TestScenes=[NSSet setWithObject:scene];XCTAssertTrue([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module requestReview:a reject:b];} error:nil] boolValue]);XCTAssertEqual(ReviewCalls,2);
 for(NSString* theme in @[@"light",@"system",@"dark"]){[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateSettings:@"en" format:@"png" theme:theme resolve:a reject:b];} error:nil];}
 scene.activationState=UISceneActivationStateBackground;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getWindowLayout:a reject:b];} error:nil];scene.windowScene=NO;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getWindowLayout:a reject:b];} error:nil];
}
- (void)testSimulatedIOS15NotificationSettingsBoundary {
 XCTAssertTrue(PixoraBeginSimulatedIOS15NotificationSettings());@try{OpenSucceeds=YES;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openNotificationSettings:a reject:b];} error:nil];XCTAssertEqualObjects(OpenedURL.absoluteString,UIApplicationOpenSettingsURLString);XCTAssertGreaterThan(PixoraNotificationAvailabilityIntercepts(),0);}@finally{PixoraEndSimulatedIOS15NotificationSettings();}
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module openNotificationSettings:a reject:b];} error:nil];XCTAssertEqualObjects(OpenedURL.absoluteString,UIApplicationOpenNotificationSettingsURLString);
}
- (void)testScenePresenterAlternativesAndSettingsValidation {
 PlatformWindow* secondary=[[PlatformWindow alloc]initWithFrame:CGRectMake(0,0,100,100)];secondary.rootViewController=[UIViewController new];secondary.selected=NO;TestWindows=[@[secondary]arrayByAddingObjectsFromArray:TestWindows];_presenter.child=[UIViewController new];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getWindowLayout:a reject:b];} error:nil];
 LocalScene* scene=[LocalScene new];scene.windowScene=YES;scene.activationState=UISceneActivationStateForegroundActive;TestScenes=[NSSet setWithObject:scene];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getWindowLayout:a reject:b];} error:nil];_presenter.child=nil;secondary.selected=YES;SceneWindows=@[[[PlatformWindow alloc]initWithFrame:CGRectMake(0,0,120,180)]];for(NSNumber* isWindow in @[@YES,@NO]){scene.windowScene=isWindow.boolValue;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateSettings:@"en" format:@"png" theme:@"system" resolve:a reject:b];} error:nil];}
 scene.activationState=UISceneActivationStateBackground;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module requestReview:a reject:b];} error:nil];scene.activationState=UISceneActivationStateForegroundActive;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module requestReview:a reject:b];} error:nil];NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateSettings:@"en" format:@"png" theme:@"invalid" resolve:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"INFERENCE_FAILED");
}
- (void)testTelemetryFilteringAndMissingPlatformMetadata {
 EmptyGlobalPreferences* preferences=[[EmptyGlobalPreferences alloc]initWithSuiteName:NSUUID.UUID.UUIDString];[_module setValue:preferences forKey:@"prefs"];[_module setValue:nil forKey:@"telemetryOverride"];preferences.globalLanguages=@[@"ru-RU"];NSDictionary* global=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getSettings:a reject:b];} error:nil];XCTAssertEqualObjects(global[@"systemLanguage"],@"ru-RU");preferences.globalLanguages=nil;
 for(int mask=0;mask<4;mask++){[preferences setInteger:2 forKey:@"consentVersion"];[preferences setBool:(mask&1)!=0 forKey:@"analyticsConsent"];[preferences setBool:(mask&2)!=0 forKey:@"crashConsent"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getTelemetrySettings:a reject:b];} error:nil];}
 [preferences setBool:NO forKey:@"analyticsConsent"];Logged=nil;OriginalLog=method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(logEventWithName:parameters:)),(IMP)LogValue);
 @try{[_module logTelemetryEvent:@"ui_action" parameters:@"{}"];XCTAssertNil(Logged);}@finally{method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(logEventWithName:parameters:)),OriginalLog);}
 [preferences setBool:NO forKey:@"analyticsConsent"];[preferences setBool:NO forKey:@"crashConsent"];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateTelemetrySettings:YES crashes:YES noticeSeen:YES resolve:a reject:b];} error:nil];
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module updateTelemetrySettings:YES crashes:YES noticeSeen:YES resolve:a reject:b];} error:nil];
 OriginalJSON=method_setImplementation(class_getClassMethod(NSJSONSerialization.class,@selector(JSONObjectWithData:options:error:)),(IMP)JSONValue);OriginalLog=method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(logEventWithName:parameters:)),(IMP)LogValue);OriginalInfo=method_setImplementation(class_getInstanceMethod(NSBundle.class,@selector(objectForInfoDictionaryKey:)),(IMP)InfoValue);
 @try{[_module logTelemetryEvent:@"ui_action" parameters:@"nonfinite-fault"];XCTAssertEqualObjects(Logged,@{@"action":@"valid"});NSString* longValue=[@"x" stringByPaddingToLength:101 withString:@"x" startingAtIndex:0];NSData* json=[NSJSONSerialization dataWithJSONObject:@{@"value":longValue} options:0 error:nil];[_module logTelemetryEvent:@"ui_action" parameters:[[NSString alloc]initWithData:json encoding:NSUTF8StringEncoding]];XCTAssertEqual(Logged.count,0u);HideVersion=YES;NSDictionary* value=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getCapabilities:a reject:b];} error:nil];XCTAssertEqualObjects(value[@"version"],@"0.8.5");value=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getSettings:a reject:b];} error:nil];XCTAssertEqualObjects(value[@"systemLanguage"],@"en");}
 @finally{HideVersion=NO;Logged=nil;method_setImplementation(class_getClassMethod(NSJSONSerialization.class,@selector(JSONObjectWithData:options:error:)),OriginalJSON);method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(logEventWithName:parameters:)),OriginalLog);method_setImplementation(class_getInstanceMethod(NSBundle.class,@selector(objectForInfoDictionaryKey:)),OriginalInfo);}
 for(NSString* key in @[@"LEGAL.txt",@"LEGAL-ios.txt"]){BundleURLOverrides[key]=NSNull.null;NSString* error=nil;[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getLegalText:a reject:b];} error:&error];XCTAssertEqualObjects(error,@"SOURCE_UNAVAILABLE");[BundleURLOverrides removeAllObjects];}
}
- (void)testSubscriptionsReviewEligibilityAndTelemetry {
 NSInteger layouts=0,sessions=0;XCTestExpectation* sessionEvent=[self expectationWithDescription:@"session subscription"];EventEmitterCallbackWrapper* callback=[EventEmitterCallbackWrapper new];callback->_eventEmitterCallback=[&](const std::string& name,id payload){if(name=="onWindowLayoutChanged")layouts++;if(name=="onSessionChanged"){sessions++;if(sessions==1)[sessionEvent fulfill];}};[_module setEventEmitterCallback:callback];[_module layoutChanged:nil];XCTAssertEqual(layouts,1);
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module discardSession:a reject:b];} error:nil];[self waitForExpectations:@[sessionEvent] timeout:5];XCTAssertGreaterThan(sessions,0);
 NSUserDefaults* prefs=[_module valueForKey:@"prefs"];[prefs setInteger:3 forKey:@"savedJobs"];NSMutableDictionary* state=[_module valueForKey:@"session"];state[@"state"]=@"SUCCEEDED";state[@"jobId"]=@"review-job";[prefs setInteger:0 forKey:@"savedJobs"];XCTAssertFalse([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module claimReviewPrompt:@"review-job" resolve:a reject:b];} error:nil]boolValue]);[prefs setInteger:3 forKey:@"savedJobs"];
 for(int attempt=0;attempt<3;attempt++){[prefs setDouble:0 forKey:@"reviewShownAt"];NSNumber* allowed=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module claimReviewPrompt:@"review-job" resolve:a reject:b];} error:nil];XCTAssertEqual(allowed.boolValue,attempt<2);}
 [prefs setInteger:0 forKey:@"reviewPrompts"];[prefs setDouble:NSDate.date.timeIntervalSince1970*1000 forKey:@"reviewShownAt"];XCTAssertFalse([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module claimReviewPrompt:@"review-job" resolve:a reject:b];} error:nil] boolValue]);state[@"state"]=@"READY";XCTAssertFalse([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module claimReviewPrompt:@"review-job" resolve:a reject:b];} error:nil] boolValue]);
 TestWindows=@[];XCTAssertFalse([[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module requestReview:a reject:b];} error:nil] boolValue]);
 [prefs setBool:YES forKey:@"analyticsConsent"];[prefs setBool:YES forKey:@"crashConsent"];[prefs setInteger:1 forKey:@"consentVersion"];[_module configureTelemetry];NSDictionary* legacy=[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getTelemetrySettings:a reject:b];} error:nil];XCTAssertTrue([legacy[@"analytics"] boolValue]);
 [prefs setInteger:2 forKey:@"consentVersion"];[_module configureTelemetry];[_module logTelemetryEvent:@"unknown" parameters:@"{}"];[_module logTelemetryEvent:@"ui_action" parameters:@"[]"];[_module logTelemetryEvent:@"ui_action" parameters:@"invalid"];[_module logTelemetryEvent:@"ui_action" parameters:@"{\"action\":\"test\",\"duration_ms\":12,\"filename\":\"private.png\",\"value\":[],\"source\":\"not allowed\"}"];
 [self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module clearTemporaryFiles:a reject:b];} error:nil];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getProfileAvailability:a reject:b];} error:nil];[self await:^(RCTPromiseResolveBlock a,RCTPromiseRejectBlock b){[self->_module getFeedbackStatus:a reject:b];} error:nil];
}
@end
