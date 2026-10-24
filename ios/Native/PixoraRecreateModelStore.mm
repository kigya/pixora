#import "PixoraRecreateModelStore.h"
#import <CommonCrypto/CommonDigest.h>

static NSArray<NSDictionary*>* PixoraRecreateAssets(void) {
 return @[
  @{ @"name":@"sd15-q4.gguf", @"url":@"https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF/resolve/dcac270609fffc0ce7c7d41a3c0e752721859f7c/stable-diffusion-v1-5-Q4_0.gguf?download=true", @"size":@1747190784LL, @"sha":@"c2f6e92f9d08d69cc673a1003528ac8199274b3c0eaec88d5fbefe5af67bd42b" },
  @{ @"name":@"lcm-lora.safetensors", @"url":@"https://huggingface.co/latent-consistency/lcm-lora-sdv1-5/resolve/cf2fced511dbe7e26c8d1d397e728fbab875db4b/pytorch_lora_weights.safetensors?download=true", @"size":@134621556LL, @"sha":@"8f90d840e075ff588a58e22c6586e2ae9a6f7922996ee6649a7f01072333afe4" }
 ];
}
static NSString* PixoraSHA256(NSURL* url) {
 NSInputStream* input=[NSInputStream inputStreamWithURL:url];[input open];CC_SHA256_CTX context;CC_SHA256_Init(&context);uint8_t buffer[64*1024];NSInteger count;
 while((count=[input read:buffer maxLength:sizeof(buffer)])>0)CC_SHA256_Update(&context,buffer,(CC_LONG)count);
 [input close];if(count<0)return @"";uint8_t digest[CC_SHA256_DIGEST_LENGTH];CC_SHA256_Final(digest,&context);NSMutableString* value=[NSMutableString stringWithCapacity:64];for(int i=0;i<CC_SHA256_DIGEST_LENGTH;i++)[value appendFormat:@"%02x",digest[i]];return value;
}

@interface PixoraRecreateModelStore () <NSURLSessionDataDelegate>
@end
@implementation PixoraRecreateModelStore {
 NSURL* _directory; NSUserDefaults* _prefs; void (^_changed)(NSDictionary*);
 NSURLSession* _session; NSURLSessionDataTask* _task; NSFileHandle* _output;
 dispatch_queue_t _queue; NSUInteger _assetIndex; long long _offset; long long _currentBytes;
 NSString* _state; NSString* _error; BOOL _cancelled; BOOL _discardPartial;
}
- (instancetype)initWithRoot:(NSURL*)root changed:(void (^)(NSDictionary*))changed {
 if((self=[super init])){_directory=[root URLByAppendingPathComponent:@"recreate-model" isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:_directory withIntermediateDirectories:YES attributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} error:nil];[_directory setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];_prefs=NSUserDefaults.standardUserDefaults;_changed=[changed copy];_queue=dispatch_queue_create("dev.kigya.pixora.recreate-download",DISPATCH_QUEUE_SERIAL);_state=@"absent";_error=@"";NSURLSessionConfiguration* config=NSURLSessionConfiguration.ephemeralSessionConfiguration;config.HTTPCookieStorage=nil;config.URLCache=nil;config.requestCachePolicy=NSURLRequestReloadIgnoringLocalCacheData;_session=[NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];}
 return self;
}
- (NSURL*)urlForIndex:(NSUInteger)index {return [_directory URLByAppendingPathComponent:PixoraRecreateAssets()[index][@"name"]];}
- (NSURL*)partForIndex:(NSUInteger)index {return [[self urlForIndex:index] URLByAppendingPathExtension:@"part"];}
- (BOOL)isReady {NSDictionary* checked=[_prefs dictionaryForKey:@"pixoraRecreateVerified"]?:@{};for(NSDictionary* asset in PixoraRecreateAssets()){NSURL* url=[_directory URLByAppendingPathComponent:asset[@"name"]];NSNumber* size=nil;[url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(size.longLongValue!=[asset[@"size"] longLongValue] || ![checked[asset[@"name"]] isEqual:asset[@"sha"]])return NO;}return YES;}
- (BOOL)verifyInstalled {NSMutableDictionary* checked=[[_prefs dictionaryForKey:@"pixoraRecreateVerified"] mutableCopy]?:[NSMutableDictionary dictionary];BOOL valid=YES;for(NSDictionary* asset in PixoraRecreateAssets()){NSURL* url=[_directory URLByAppendingPathComponent:asset[@"name"]];NSNumber* size=nil;[url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(size.longLongValue!=[asset[@"size"] longLongValue] || ![checked[asset[@"name"]] isEqual:asset[@"sha"]] || ![PixoraSHA256(url) isEqual:asset[@"sha"]]){[checked removeObjectForKey:asset[@"name"]];valid=NO;}}if(!valid){[_prefs setObject:checked forKey:@"pixoraRecreateVerified"];_state=@"failed";_error=@"MODEL_INTEGRITY_FAILED";}return valid;}
- (long long)storedBytes {long long total=0;for(NSUInteger i=0;i<PixoraRecreateAssets().count;i++){NSNumber* size=nil;[[self urlForIndex:i] getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(size)total+=size.longLongValue;size=nil;[[self partForIndex:i] getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(size)total+=size.longLongValue;}return total;}
- (NSURL*)diffusionModelURL{return [self urlForIndex:0];}
- (NSURL*)loraModelURL{return [self urlForIndex:1];}
- (NSDictionary*)snapshot {@synchronized(self){long long installed=0,downloaded=0;for(NSUInteger i=0;i<PixoraRecreateAssets().count;i++){NSDictionary* asset=PixoraRecreateAssets()[i];NSNumber* size=nil;[[self urlForIndex:i] getResourceValue:&size forKey:NSURLFileSizeKey error:nil];long long final=size.longLongValue;if(final==[asset[@"size"] longLongValue])installed+=final;downloaded+=final;size=nil;[[self partForIndex:i] getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(final==0)downloaded+=size.longLongValue;}if([self isReady])_state=@"ready";else if(([_state isEqual:@"absent"] || [_state isEqual:@"ready"]) && downloaded>0)_state=@"paused";return @{ @"state":_state?:@"absent", @"downloadedBytes":@(downloaded), @"totalBytes":@1881812340LL, @"installedBytes":@(installed), @"error":_error?:@"" };}}
- (void)emit {NSDictionary* value=[self snapshot];if(_changed)_changed(value);}
- (void)start {@synchronized(self){if(_task || [_state isEqual:@"downloading"] || [_state isEqual:@"verifying"] || [self isReady])return;_cancelled=NO;_error=@"";_state=@"downloading";_assetIndex=0;}dispatch_async(_queue,^{[self beginNext];});[self emit];}
- (void)beginNext {
 if(_cancelled){_state=@"paused";[self emit];return;}
 while(_assetIndex<PixoraRecreateAssets().count){NSDictionary* asset=PixoraRecreateAssets()[_assetIndex];NSURL* target=[self urlForIndex:_assetIndex];NSNumber* size=nil;[target getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(size.longLongValue==[asset[@"size"] longLongValue] && [PixoraSHA256(target) isEqual:asset[@"sha"]]){NSMutableDictionary* checked=[[_prefs dictionaryForKey:@"pixoraRecreateVerified"] mutableCopy]?:[NSMutableDictionary dictionary];checked[asset[@"name"]]=asset[@"sha"];[_prefs setObject:checked forKey:@"pixoraRecreateVerified"];_assetIndex++;continue;}if(size){[NSFileManager.defaultManager removeItemAtURL:target error:nil];}
  NSURL* part=[self partForIndex:_assetIndex];size=nil;[part getResourceValue:&size forKey:NSURLFileSizeKey error:nil];if(size.longLongValue>[asset[@"size"] longLongValue]){[NSFileManager.defaultManager removeItemAtURL:part error:nil];size=@0;}if(size.longLongValue==[asset[@"size"] longLongValue]){if([PixoraSHA256(part) isEqual:asset[@"sha"]]){[NSFileManager.defaultManager removeItemAtURL:target error:nil];if(![NSFileManager.defaultManager moveItemAtURL:part toURL:target error:nil]){_state=@"failed";_error=@"LOW_STORAGE";[self emit];return;}NSMutableDictionary* checked=[[_prefs dictionaryForKey:@"pixoraRecreateVerified"] mutableCopy]?:[NSMutableDictionary dictionary];checked[asset[@"name"]]=asset[@"sha"];[_prefs setObject:checked forKey:@"pixoraRecreateVerified"];_assetIndex++;continue;}[NSFileManager.defaultManager removeItemAtURL:part error:nil];size=@0;}_offset=size.longLongValue;_currentBytes=_offset;_discardPartial=NO;
  NSNumber* free=nil;[[NSURL fileURLWithPath:_directory.path] getResourceValue:&free forKey:NSURLVolumeAvailableCapacityForImportantUsageKey error:nil];long long remain=[asset[@"size"] longLongValue]-_offset;if(free.longLongValue<remain+64LL*1024*1024){_state=@"failed";_error=@"LOW_STORAGE";[self emit];return;}
  _state=@"downloading";_error=@"";[self emit];NSMutableURLRequest* request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:asset[@"url"]] cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:120];request.HTTPShouldHandleCookies=NO;if(_offset>0)[request setValue:[NSString stringWithFormat:@"bytes=%lld-",_offset] forHTTPHeaderField:@"Range"];
  _output=[NSFileHandle fileHandleForWritingAtPath:part.path];if(!_output){[NSFileManager.defaultManager createFileAtPath:part.path contents:nil attributes:nil];_output=[NSFileHandle fileHandleForWritingAtPath:part.path];}if(!_output){_state=@"failed";_error=@"LOW_STORAGE";[self emit];return;}[_output seekToEndOfFile];_task=[_session dataTaskWithRequest:request];[_task resume];return;
 }
 _state=@"verifying";[self emit];_state=[self isReady]?@"ready":@"failed";if([_state isEqual:@"failed"] && _error.length==0)_error=@"MODEL_INTEGRITY_FAILED";[self emit];
}
- (void)cancel {@synchronized(self){_cancelled=YES;[_task cancel];}dispatch_async(_queue,^{if(!self->_task){self->_state=@"paused";[self emit];}});}
- (void)deleteModel {@synchronized(self){if(_task || [_state isEqual:@"downloading"] || [_state isEqual:@"verifying"])@throw [NSException exceptionWithName:@"BUSY" reason:@"Model is in use" userInfo:nil];}for(NSDictionary* asset in PixoraRecreateAssets()){NSURL* target=[_directory URLByAppendingPathComponent:asset[@"name"]];NSURL* part=[target URLByAppendingPathExtension:@"part"];for(NSURL* file in @[target,part])if([NSFileManager.defaultManager fileExistsAtPath:file.path]){NSError* error=nil;if(![NSFileManager.defaultManager removeItemAtURL:file error:&error] || [NSFileManager.defaultManager fileExistsAtPath:file.path]){_state=@"failed";_error=@"MODEL_DELETE_FAILED";[self emit];@throw [NSException exceptionWithName:@"MODEL_DELETE_FAILED" reason:@"Unable to delete model files" userInfo:nil];}}}[_prefs removeObjectForKey:@"pixoraRecreateVerified"];_state=@"absent";_error=@"";[self emit];}
- (void)URLSession:(NSURLSession*)session dataTask:(NSURLSessionDataTask*)task didReceiveResponse:(NSURLResponse*)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
 NSHTTPURLResponse* http=(NSHTTPURLResponse*)response;NSDictionary* asset=PixoraRecreateAssets()[_assetIndex];BOOL valid=_offset>0?(http.statusCode==200 || http.statusCode==206):http.statusCode==200;
 if(_offset>0 && http.statusCode==206){NSString* range=http.allHeaderFields[@"Content-Range"]?:http.allHeaderFields[@"content-range"];NSString* expected=[NSString stringWithFormat:@"bytes %lld-",_offset];valid=valid && [range hasPrefix:expected] && [[range componentsSeparatedByString:@"/"].lastObject longLongValue]==[asset[@"size"] longLongValue];if(!valid)_discardPartial=YES;}
 if(!valid){_error=@"MODEL_DOWNLOAD_FAILED";_cancelled=YES;completionHandler(NSURLSessionResponseCancel);return;}
 if(_offset>0 && http.statusCode==200){[_output closeFile];NSURL* part=[self partForIndex:_assetIndex];[NSFileManager.defaultManager removeItemAtURL:part error:nil];[NSFileManager.defaultManager createFileAtPath:part.path contents:nil attributes:nil];_output=[NSFileHandle fileHandleForWritingAtPath:part.path];_offset=0;_currentBytes=0;}
 completionHandler(NSURLSessionResponseAllow);
}
- (void)URLSession:(NSURLSession*)session dataTask:(NSURLSessionDataTask*)task didReceiveData:(NSData*)data {
 long long expected=[PixoraRecreateAssets()[_assetIndex][@"size"] longLongValue];if(_currentBytes+(long long)data.length>expected){_error=@"MODEL_INTEGRITY_FAILED";_cancelled=YES;[task cancel];return;}
 @try{[_output writeData:data];_currentBytes+=data.length;[self emit];} @catch(NSException* error){_error=@"LOW_STORAGE";_cancelled=YES;[task cancel];}
}
- (void)URLSession:(NSURLSession*)session task:(NSURLSessionTask*)task didCompleteWithError:(NSError*)error {
 @try{[_output synchronizeFile];} @catch(NSException* syncError){if(!_error.length)_error=@"LOW_STORAGE";}[_output closeFile];_output=nil;_task=nil;
 if(_cancelled || error){if(_discardPartial)[NSFileManager.defaultManager removeItemAtURL:[self partForIndex:_assetIndex] error:nil];_state=_error.length?@"failed":@"paused";if(!_error.length && error && ![error.domain isEqual:NSURLErrorDomain])_error=@"MODEL_DOWNLOAD_FAILED";[self emit];return;}
 NSDictionary* asset=PixoraRecreateAssets()[_assetIndex];_state=@"verifying";[self emit];NSURL* part=[self partForIndex:_assetIndex];NSNumber* size=nil;[part getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
 if(size.longLongValue!=[asset[@"size"] longLongValue] || ![PixoraSHA256(part) isEqual:asset[@"sha"]]){_error=@"MODEL_INTEGRITY_FAILED";_state=@"failed";[NSFileManager.defaultManager removeItemAtURL:part error:nil];[self emit];return;}
 NSURL* target=[self urlForIndex:_assetIndex];[NSFileManager.defaultManager removeItemAtURL:target error:nil];if(![NSFileManager.defaultManager moveItemAtURL:part toURL:target error:nil]){_error=@"LOW_STORAGE";_state=@"failed";[self emit];return;}
 NSMutableDictionary* checked=[[_prefs dictionaryForKey:@"pixoraRecreateVerified"] mutableCopy]?:[NSMutableDictionary dictionary];checked[asset[@"name"]]=asset[@"sha"];[_prefs setObject:checked forKey:@"pixoraRecreateVerified"];_assetIndex++;dispatch_async(_queue,^{[self beginNext];});[self emit];
}
@end
