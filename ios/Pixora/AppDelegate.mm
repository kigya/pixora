#import <UIKit/UIKit.h>
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
@end
@implementation PixoraAppDelegate
- (BOOL)application:(UIApplication*)application didFinishLaunchingWithOptions:(NSDictionary*)options {
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
  return YES;
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
