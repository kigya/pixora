#import <XCTest/XCTest.h>
#import <QuartzCore/QuartzCore.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <PixoraNative/PixoraUpscale.h>
#import <FirebaseAnalytics/FirebaseAnalytics.h>
#import <FirebaseCrashlytics/FirebaseCrashlytics.h>
#import <objc/runtime.h>

// The real app delegate is linked into the test host. Only time and the system
// accessibility query are controlled; the overlay and dismissal run unchanged.
@interface PixoraAppDelegate : RCTDefaultReactNativeFactoryDelegate
@property(nonatomic,strong) UIWindow* window;
@property(nonatomic,strong) UIView* startupOverlay;
@property(nonatomic,strong) UIImageView* startupLogo;
@property(nonatomic,assign) NSTimeInterval startupStartedAt;
@property(nonatomic,assign) BOOL startupHideScheduled;
- (void)showStartupOverlay;
- (void)startupFinished:(NSNotification*)notification;
- (void)startupMotionChanged:(NSNotification*)notification;
- (NSTimeInterval)startupUptime;
- (BOOL)startupMotionLimited;
- (void)configureStartupTelemetry:(NSUserDefaults*)preferences;
@end
@interface ControlledStartupDelegate : PixoraAppDelegate
@property(nonatomic,strong) NSMutableArray<NSNumber*>* times;
@property(nonatomic,assign) BOOL limitedMotion;
@property(nonatomic,copy) void(^uptimeObserved)(void);
@end
@implementation ControlledStartupDelegate
- (NSTimeInterval)startupUptime {if(self.uptimeObserved)self.uptimeObserved();if(self.times.count){NSNumber* value=self.times.firstObject;[self.times removeObjectAtIndex:0];return value.doubleValue;}return [super startupUptime];}
- (BOOL)startupMotionLimited {return self.limitedMotion;}
@end
static BOOL AnalyticsEnabled,CrashesEnabled;static NSInteger DeletedReports;static NSDictionary* Consent;
static IMP AnalyticsSetter,ConsentSetter,CrashSetter,DeleteReports;
static void SetAnalytics(id self,SEL cmd,BOOL enabled){AnalyticsEnabled=enabled;}
static void SetConsent(id self,SEL cmd,NSDictionary* value){Consent=value;}
static void SetCrashes(id self,SEL cmd,BOOL enabled){CrashesEnabled=enabled;}
static void DeleteCrashes(id self,SEL cmd){DeletedReports++;}

@interface PixoraStartupTests : XCTestCase
@end
@implementation PixoraStartupTests {
 ControlledStartupDelegate* _delegate;
 BOOL _animationsEnabled;
}
- (void)setUp {[super setUp];_animationsEnabled=UIView.areAnimationsEnabled;[UIView setAnimationsEnabled:YES];}
- (void)tearDown {
 if(_delegate)[NSNotificationCenter.defaultCenter removeObserver:_delegate];
 [_delegate.startupOverlay removeFromSuperview];_delegate.window.hidden=YES;_delegate=nil;
 [UIView setAnimationsEnabled:_animationsEnabled];[super tearDown];
}
- (ControlledStartupDelegate*)owner {
 ControlledStartupDelegate* owner=[ControlledStartupDelegate new];
 owner.window=[[UIWindow alloc]initWithFrame:CGRectMake(0,0,390,844)];
 owner.window.rootViewController=[UIViewController new];owner.window.hidden=NO;
 return owner;
}
- (void)wait:(NSTimeInterval)seconds {
 XCTestExpectation* done=[self expectationWithDescription:@"startup main queue"];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(seconds*NSEC_PER_SEC)),dispatch_get_main_queue(),^{[done fulfill];});
 [self waitForExpectations:@[done] timeout:seconds+3];
}
- (void)testEarlyReadinessKeepsBrandVisibleForMinimumAndDoesNotExtendOnRepeat {
 _delegate=[self owner];[_delegate showStartupOverlay];
 [_delegate.startupOverlay layoutIfNeeded];
 UIView* overlay=_delegate.startupOverlay;XCTAssertEqual(overlay.superview,_delegate.window);
 XCTAssertTrue(overlay.accessibilityViewIsModal);XCTAssertNotNil(_delegate.startupLogo.image);
 XCTAssertEqualWithAccuracy(_delegate.startupLogo.bounds.size.width,96,1);
 NSTimeInterval presented=_delegate.startupStartedAt;
 [_delegate startupFinished:nil];[_delegate startupFinished:nil];
 [self wait:.05];XCTAssertEqual(_delegate.startupOverlay,overlay);XCTAssertTrue(_delegate.startupHideScheduled);
 [self wait:1.5];XCTAssertNil(_delegate.startupOverlay);XCTAssertNil(_delegate.startupLogo);
 XCTAssertNil(overlay.superview);XCTAssertGreaterThanOrEqual(NSProcessInfo.processInfo.systemUptime-presented,1.5);
}
- (void)testLateReadinessRemovesImmediatelyWithoutAnotherMinimum {
 _delegate=[self owner];[_delegate showStartupOverlay];
 [self wait:1.6];XCTAssertNotNil(_delegate.startupOverlay);
 XCTAssertTrue(CGAffineTransformIsIdentity(_delegate.startupLogo.transform));
 [_delegate startupFinished:nil];[self wait:.05];XCTAssertNil(_delegate.startupOverlay);
}
- (void)testReduceMotionIsStaticAndChangingThePreferenceStopsAnActiveAnimation {
 _delegate=[self owner];_delegate.limitedMotion=YES;[_delegate showStartupOverlay];
 XCTAssertTrue(CGAffineTransformIsIdentity(_delegate.startupLogo.transform));XCTAssertEqual(_delegate.startupLogo.alpha,1);
 XCTAssertEqual(_delegate.startupLogo.layer.animationKeys.count,0u);
 _delegate.limitedMotion=NO;[_delegate.startupOverlay removeFromSuperview];[_delegate showStartupOverlay];
 [_delegate startupMotionChanged:nil];
 _delegate.limitedMotion=YES;[_delegate startupMotionChanged:nil];
 XCTAssertEqual(_delegate.startupLogo.layer.animationKeys.count,0u);
 XCTAssertTrue(CGAffineTransformIsIdentity(_delegate.startupLogo.transform));XCTAssertEqual(_delegate.startupLogo.alpha,1);
}
- (void)testDeadlineCanExpireAfterAttachmentBeforeAnimationScheduling {
 _delegate=[self owner];_delegate.times=[@[@100,@102]mutableCopy];[_delegate showStartupOverlay];
 XCTAssertEqual(_delegate.startupLogo.layer.animationKeys.count,0u);
 _delegate.times=[@[@102]mutableCopy];[_delegate startupFinished:nil];[self wait:.05];XCTAssertNil(_delegate.startupOverlay);
}
- (void)testMinimumClockBeginsOnlyAfterTheOverlayIsAttached {
 _delegate=[self owner];_delegate.times=[@[@100,@100]mutableCopy];__weak ControlledStartupDelegate* weak=_delegate;
 _delegate.uptimeObserved=^{XCTAssertNotNil(weak.startupOverlay);XCTAssertEqual(weak.startupOverlay.superview,weak.window);};
 [_delegate showStartupOverlay];XCTAssertEqual(_delegate.startupStartedAt,100);
 _delegate.times=[@[@102]mutableCopy];[_delegate startupFinished:nil];[self wait:.05];XCTAssertNil(_delegate.startupOverlay);
}
- (void)testReleasedOwnerDoesNotKeepAWindowAliveUntilTheTimer {
 __weak ControlledStartupDelegate* weak;
 @autoreleasepool {ControlledStartupDelegate* owner=[self owner];owner.limitedMotion=YES;[owner showStartupOverlay];owner.times=[@[@(owner.startupStartedAt+2)]mutableCopy];[owner startupFinished:nil];owner.window.hidden=YES;weak=owner;owner=nil;}
 XCTAssertNil(weak);[self wait:.05];XCTAssertNil(weak);
}
- (void)testTurboModuleReadinessIsDeliveredOnMainAndDismissesTheOverlay {
 _delegate=[self owner];_delegate.limitedMotion=YES;[_delegate showStartupOverlay];
 _delegate.times=[@[@(_delegate.startupStartedAt+2)]mutableCopy];
 [NSNotificationCenter.defaultCenter addObserver:_delegate selector:@selector(startupFinished:) name:@"PixoraStartupFinished" object:nil];
 XCTestExpectation* ready=[self expectationWithDescription:@"native startup readiness"];
 id observer=[NSNotificationCenter.defaultCenter addObserverForName:@"PixoraStartupFinished" object:nil queue:nil usingBlock:^(NSNotification* notification){XCTAssertTrue(NSThread.isMainThread);[ready fulfill];}];
 @try {dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT,0),^{[[PixoraUpscale new] finishStartup];});[self waitForExpectations:@[ready] timeout:5];[self wait:.05];XCTAssertNil(self->_delegate.startupOverlay);}
 @finally {[NSNotificationCenter.defaultCenter removeObserver:observer];}
}
- (void)testStartupTelemetryDefaultsAndSavedIndependentOptOuts {
 _delegate=[self owner];NSUserDefaults* preferences=[[NSUserDefaults alloc]initWithSuiteName:NSUUID.UUID.UUIDString];
 AnalyticsSetter=method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(setAnalyticsCollectionEnabled:)),(IMP)SetAnalytics);
 ConsentSetter=method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(setConsent:)),(IMP)SetConsent);
 CrashSetter=method_setImplementation(class_getInstanceMethod(FIRCrashlytics.class,@selector(setCrashlyticsCollectionEnabled:)),(IMP)SetCrashes);
 DeleteReports=method_setImplementation(class_getInstanceMethod(FIRCrashlytics.class,@selector(deleteUnsentReports)),(IMP)DeleteCrashes);
 @try {
  for(NSNumber* version in @[@0,@1,@2])for(int mask=0;mask<4;mask++){
   [preferences setInteger:version.integerValue forKey:@"consentVersion"];[preferences setBool:(mask&1)!=0 forKey:@"analyticsConsent"];[preferences setBool:(mask&2)!=0 forKey:@"crashConsent"];DeletedReports=0;
   [_delegate configureStartupTelemetry:preferences];BOOL analytics=version.intValue!=2 || (mask&1)!=0,crashes=version.intValue!=2 || (mask&2)!=0;
   XCTAssertEqual(AnalyticsEnabled,analytics);XCTAssertEqual(CrashesEnabled,crashes);XCTAssertEqual(DeletedReports,crashes?0:1);
   XCTAssertEqualObjects(Consent[FIRConsentTypeAnalyticsStorage],analytics?FIRConsentStatusGranted:FIRConsentStatusDenied);
   XCTAssertEqualObjects(Consent[FIRConsentTypeAdStorage],FIRConsentStatusDenied);XCTAssertEqualObjects(Consent[FIRConsentTypeAdUserData],FIRConsentStatusDenied);XCTAssertEqualObjects(Consent[FIRConsentTypeAdPersonalization],FIRConsentStatusDenied);
   XCTAssertEqual([preferences integerForKey:@"consentVersion"],version.integerValue);
  }
 }@finally {
  method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(setAnalyticsCollectionEnabled:)),AnalyticsSetter);method_setImplementation(class_getClassMethod(FIRAnalytics.class,@selector(setConsent:)),ConsentSetter);method_setImplementation(class_getInstanceMethod(FIRCrashlytics.class,@selector(setCrashlyticsCollectionEnabled:)),CrashSetter);method_setImplementation(class_getInstanceMethod(FIRCrashlytics.class,@selector(deleteUnsentReports)),DeleteReports);Consent=nil;
 }
}
@end
