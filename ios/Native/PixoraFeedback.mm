#import "PixoraFeedback.h"
#include <cmath>
@implementation PixoraFeedback {
 NSMutableData* _data;
 NSURLSession* _session;
 RCTPromiseResolveBlock _resolve;
 RCTPromiseRejectBlock _reject;
 NSString* _identifier;
 NSInteger _redirects;
 BOOL _failed;
}
+ (BOOL)matches:(NSString*)value pattern:(NSString*)pattern {return [[NSRegularExpression regularExpressionWithPattern:pattern options:0 error:nil] numberOfMatchesInString:value options:0 range:NSMakeRange(0,value.length)]==1;}
+ (BOOL)validEndpoint:(NSString*)endpoint {NSURLComponents* value=[NSURLComponents componentsWithString:endpoint];return [value.scheme isEqual:@"https"] && [value.host isEqual:@"script.google.com"] && !value.user && !value.password && !value.query && !value.fragment && !value.port && [self matches:value.path pattern:@"^/macros/s/[A-Za-z0-9_-]+/exec$"];}
 + (NSURLSessionConfiguration*)configuration {NSURLSessionConfiguration* config=NSURLSessionConfiguration.ephemeralSessionConfiguration;config.timeoutIntervalForRequest=20;config.timeoutIntervalForResource=35;config.URLCache=nil;config.HTTPCookieStorage=nil;return config;}
+ (void)send:(NSString*)endpoint email:(NSString*)email message:(NSString*)message rating:(double)rating identifier:(NSString*)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
 if(![self validEndpoint:endpoint]){reject(@"FEEDBACK_UNAVAILABLE",@"Feedback unavailable",nil);return;}
 NSString* trimmedEmail=[email stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];NSString* trimmedMessage=[message stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
 if(email.length>254 || (trimmedEmail.length && ![self matches:trimmedEmail pattern:@"^[^\\s@<>\\r\\n]+@[^\\s@<>\\r\\n]+\\.[^\\s@<>\\r\\n]+$"]) || trimmedMessage.length<5 || trimmedMessage.length>4000 || !std::isfinite(rating) || rating!=std::floor(rating) || rating<0 || rating>5 || ![self matches:identifier pattern:@"^[a-f0-9-]{36}$"]){reject(@"FEEDBACK_INVALID",@"Feedback invalid",nil);return;}
 PixoraFeedback* worker=[self new];worker->_data=[NSMutableData data];worker->_resolve=resolve;worker->_reject=reject;worker->_identifier=identifier;
 NSURLSessionConfiguration* config=[self configuration];
 worker->_session=[NSURLSession sessionWithConfiguration:config delegate:worker delegateQueue:nil];NSMutableURLRequest* request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:endpoint]];request.HTTPMethod=@"POST";[request setValue:@"application/json; charset=utf-8" forHTTPHeaderField:@"Content-Type"];request.HTTPBody=[NSJSONSerialization dataWithJSONObject:@{@"email":trimmedEmail,@"message":trimmedMessage,@"rating":@(rating),@"id":identifier,@"platform":@"ios",@"version":[NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"]?:@"0.8.0"} options:0 error:nil];[[worker->_session dataTaskWithRequest:request] resume];
}
- (void)URLSession:(NSURLSession*)session task:(NSURLSessionTask*)task willPerformHTTPRedirection:(NSHTTPURLResponse*)response newRequest:(NSURLRequest*)request completionHandler:(void (^)(NSURLRequest*))completion {
 NSURLComponents* url=[NSURLComponents componentsWithURL:request.URL resolvingAgainstBaseURL:NO];BOOL allowed=_redirects++==0 && (response.statusCode==302 || response.statusCode==303) && [url.scheme isEqual:@"https"] && [url.host isEqual:@"script.googleusercontent.com"] && !url.user && !url.password && !url.port;
 if(!allowed){_failed=YES;completion(nil);}else{NSMutableURLRequest* follow=[request mutableCopy];follow.HTTPMethod=@"GET";follow.HTTPBody=nil;completion(follow);}
}
- (void)URLSession:(NSURLSession*)session dataTask:(NSURLSessionDataTask*)task didReceiveResponse:(NSURLResponse*)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completion {BOOL valid=[response isKindOfClass:NSHTTPURLResponse.class] && ((NSHTTPURLResponse*)response).statusCode==200 && response.expectedContentLength<=8192;_failed|=!valid;completion(valid?NSURLSessionResponseAllow:NSURLSessionResponseCancel);}
- (void)URLSession:(NSURLSession*)session dataTask:(NSURLSessionDataTask*)task didReceiveData:(NSData*)data {if(_data.length+data.length>8192){_failed=YES;[task cancel];}else [_data appendData:data];}
- (void)URLSession:(NSURLSession*)session task:(NSURLSessionTask*)task didCompleteWithError:(NSError*)error {NSDictionary* result=[NSJSONSerialization JSONObjectWithData:_data options:0 error:nil];if(error || _failed || ![result isKindOfClass:NSDictionary.class] || ![result[@"ok"] boolValue] || ![result[@"id"] isEqual:_identifier])_reject(@"FEEDBACK_FAILED",@"Feedback failed",nil);else _resolve(@YES);_resolve=nil;_reject=nil;[_session finishTasksAndInvalidate];_session=nil;}
@end
