#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTBundleURLProvider.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React_RCTAppDelegate/RCTReactNativeFactory.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <FirebaseCore/FirebaseCore.h>
#import <FirebaseAnalytics/FirebaseAnalytics.h>
#import <FirebaseCrashlytics/FirebaseCrashlytics.h>
@interface PixoraWindow : UIWindow
@end
@implementation PixoraWindow {
  CGRect _lastBounds;
}
- (void)layoutSubviews {
  [super layoutSubviews];
  if(!CGRectEqualToRect(_lastBounds,self.bounds)) {
    _lastBounds=self.bounds;
    [NSNotificationCenter.defaultCenter postNotificationName:@"PixoraWindowLayoutChanged" object:self];
  }
}
@end
@interface PixoraAppDelegate : RCTDefaultReactNativeFactoryDelegate <UIApplicationDelegate>
@property(nonatomic,strong) UIWindow* window;
@property(nonatomic,strong) RCTReactNativeFactory* factory;
@property(nonatomic,strong) UIView* startupOverlay;
@property(nonatomic,strong) UIImageView* startupLogo;
@property(nonatomic,assign) NSTimeInterval startupStartedAt;
@property(nonatomic,assign) BOOL startupHideScheduled;
@end
@implementation PixoraAppDelegate
- (BOOL)application:(UIApplication*)application didFinishLaunchingWithOptions:(NSDictionary*)options {
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(startupFinished:) name:@"PixoraStartupFinished" object:nil];
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(startupMotionChanged:) name:UIAccessibilityReduceMotionStatusDidChangeNotification object:nil];
  // Start guarded, then apply effective defaults and saved opt-outs immediately.
  [FIRApp configure];
  NSUserDefaults* preferences=NSUserDefaults.standardUserDefaults;
  BOOL explicitChoice=[preferences integerForKey:@"consentVersion"]==2;
  BOOL analytics=!explicitChoice || [preferences boolForKey:@"analyticsConsent"];
  BOOL crashes=!explicitChoice || [preferences boolForKey:@"crashConsent"];
  [FIRAnalytics setAnalyticsCollectionEnabled:analytics];
  [FIRAnalytics setConsent:@{FIRConsentTypeAnalyticsStorage:analytics?FIRConsentStatusGranted:FIRConsentStatusDenied,FIRConsentTypeAdStorage:FIRConsentStatusDenied,FIRConsentTypeAdUserData:FIRConsentStatusDenied,FIRConsentTypeAdPersonalization:FIRConsentStatusDenied}];
  [[FIRCrashlytics crashlytics] setCrashlyticsCollectionEnabled:crashes];
  if(!crashes)[[FIRCrashlytics crashlytics] deleteUnsentReports];
  self.dependencyProvider=[RCTAppDependencyProvider new];
  self.factory=[[RCTReactNativeFactory alloc] initWithDelegate:self];
  self.window=[[PixoraWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  NSString* theme=[NSUserDefaults.standardUserDefaults stringForKey:@"theme"];
  self.window.overrideUserInterfaceStyle=[theme isEqual:@"dark"]?UIUserInterfaceStyleDark:[theme isEqual:@"light"]?UIUserInterfaceStyleLight:UIUserInterfaceStyleUnspecified;
  [self.factory startReactNativeWithModuleName:@"UpscaleImage" inWindow:self.window launchOptions:options];
  [self showStartupOverlay];
  return YES;
}
- (void)showStartupOverlay {
  // Measure the brand's minimum display time from its presentation, not native setup.
  self.startupStartedAt=NSProcessInfo.processInfo.systemUptime;
  UIView* overlay=[[UIView alloc] initWithFrame:self.window.bounds];
  overlay.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;
  overlay.backgroundColor=[UIColor colorNamed:@"LaunchBackground"];
  overlay.layer.zPosition=1000;
  overlay.accessibilityViewIsModal=YES;
  UIImageView* logo=[[UIImageView alloc] initWithImage:[UIImage imageNamed:@"Splash"]];
  logo.contentMode=UIViewContentModeScaleAspectFit;
  UILabel* title=[UILabel new];
  title.text=@"Pixora";
  title.textColor=UIColor.labelColor;
  title.font=[UIFont systemFontOfSize:28 weight:UIFontWeightSemibold];
  title.textAlignment=NSTextAlignmentCenter;
  UIStackView* brand=[[UIStackView alloc] initWithArrangedSubviews:@[logo,title]];
  brand.axis=UILayoutConstraintAxisVertical;
  brand.alignment=UIStackViewAlignmentCenter;
  brand.spacing=18;
  brand.translatesAutoresizingMaskIntoConstraints=NO;
  [overlay addSubview:brand];
  [NSLayoutConstraint activateConstraints:@[
    [brand.centerXAnchor constraintEqualToAnchor:overlay.centerXAnchor],
    [brand.centerYAnchor constraintEqualToAnchor:overlay.centerYAnchor],
    [logo.widthAnchor constraintEqualToConstant:96],
    [logo.heightAnchor constraintEqualToConstant:96]
  ]];
  self.startupOverlay=overlay;
  self.startupLogo=logo;
  [self.window addSubview:overlay];
  NSTimeInterval remaining=MAX(0.0,1.5-(NSProcessInfo.processInfo.systemUptime-self.startupStartedAt));
  if(!UIAccessibilityIsReduceMotionEnabled() && remaining>0) {
    logo.transform=CGAffineTransformMakeScale(0.86,0.86);
    logo.alpha=0.7;
    [UIView animateKeyframesWithDuration:remaining delay:0 options:UIViewKeyframeAnimationOptionCalculationModeCubic animations:^{
      [UIView addKeyframeWithRelativeStartTime:0 relativeDuration:0.6 animations:^{logo.transform=CGAffineTransformMakeScale(1.06,1.06);logo.alpha=1;}];
      [UIView addKeyframeWithRelativeStartTime:0.6 relativeDuration:0.4 animations:^{logo.transform=CGAffineTransformIdentity;}];
    } completion:nil];
  }
}
- (void)startupMotionChanged:(NSNotification*)notification {
  if(UIAccessibilityIsReduceMotionEnabled()) {
    [self.startupLogo.layer removeAllAnimations];
    self.startupLogo.transform=CGAffineTransformIdentity;
    self.startupLogo.alpha=1;
  }
}
- (void)startupFinished:(NSNotification*)notification {
  if(self.startupHideScheduled)return;
  self.startupHideScheduled=YES;
  NSTimeInterval remaining=MAX(0.0,1.5-(NSProcessInfo.processInfo.systemUptime-self.startupStartedAt));
  __weak PixoraAppDelegate* weak=self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(remaining*NSEC_PER_SEC)),dispatch_get_main_queue(),^{
    PixoraAppDelegate* owner=weak;
    if(!owner)return;
    [owner.startupOverlay removeFromSuperview];
    owner.startupOverlay=nil;
    owner.startupLogo=nil;
    [NSNotificationCenter.defaultCenter removeObserver:owner name:@"PixoraStartupFinished" object:nil];
    [NSNotificationCenter.defaultCenter removeObserver:owner name:UIAccessibilityReduceMotionStatusDidChangeNotification object:nil];
  });
}
- (NSURL*)sourceURLForBridge:(RCTBridge*)bridge {return [self bundleURL];}
- (NSURL*)bundleURL {
#if DEBUG
  NSURL* packaged=[NSBundle.mainBundle URLForResource:@"main" withExtension:@"jsbundle"];
  return packaged?:[RCTBundleURLProvider.sharedSettings jsBundleURLForBundleRoot:@"index"];
#else
  return [NSBundle.mainBundle URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
@end
int main(int argc,char* argv[]) {
  @autoreleasepool {return UIApplicationMain(argc,argv,nil,NSStringFromClass(PixoraAppDelegate.class));}
}
