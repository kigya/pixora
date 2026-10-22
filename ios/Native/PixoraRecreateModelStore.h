#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
@interface PixoraRecreateModelStore : NSObject
- (instancetype)initWithRoot:(NSURL*)root changed:(void (^)(NSDictionary* state))changed;
- (NSDictionary*)snapshot;
- (void)start;
- (void)cancel;
- (void)deleteModel;
- (BOOL)isReady;
- (BOOL)verifyInstalled;
- (NSURL*)diffusionModelURL;
- (NSURL*)loraModelURL;
- (long long)storedBytes;
@end
NS_ASSUME_NONNULL_END
