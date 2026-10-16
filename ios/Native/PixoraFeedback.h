#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
@interface PixoraFeedback : NSObject <NSURLSessionDataDelegate>
+ (BOOL)validEndpoint:(NSString*)endpoint;
+ (void)send:(NSString*)endpoint email:(NSString*)email message:(NSString*)message rating:(double)rating identifier:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;
@end
