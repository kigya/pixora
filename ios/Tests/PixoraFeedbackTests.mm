#import <XCTest/XCTest.h>
#import "../Native/PixoraFeedback.h"
#include <cmath>
#import <objc/runtime.h>
@interface PixoraFeedback (Testing)
+ (NSURLSessionConfiguration*)configuration;
@end
static NSData* Reply;
static NSData* Sent;
static NSInteger Status=200;
static BOOL TransportError=NO;
@interface FeedbackProtocol : NSURLProtocol
@end
@implementation FeedbackProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest*)request{return YES;}
+ (NSURLRequest*)canonicalRequestForRequest:(NSURLRequest*)request{return request;}
- (void)startLoading {
 Sent=self.request.HTTPBody;
 if(!Sent && self.request.HTTPBodyStream){NSInputStream* stream=self.request.HTTPBodyStream;[stream open];NSMutableData* data=[NSMutableData data];uint8_t bytes[1024];NSInteger count;while((count=[stream read:bytes maxLength:sizeof(bytes)])>0)[data appendBytes:bytes length:count];[stream close];Sent=data;}
 if(TransportError){[self.client URLProtocol:self didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorTimedOut userInfo:nil]];return;}
 NSHTTPURLResponse* response=[[NSHTTPURLResponse alloc] initWithURL:self.request.URL statusCode:Status HTTPVersion:@"HTTP/1.1" headerFields:@{@"Content-Length":[NSString stringWithFormat:@"%lu",(unsigned long)Reply.length]}];
 [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];[self.client URLProtocol:self didLoadData:Reply];[self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading{}
@end
@interface LocalFeedback : PixoraFeedback
@end
@implementation LocalFeedback
+ (NSURLSessionConfiguration*)configuration {NSURLSessionConfiguration* config=[super configuration];config.protocolClasses=@[FeedbackProtocol.class];return config;}
@end
@interface CancelTask : NSURLSessionDataTask
@property(nonatomic) BOOL cancelled;
@end
@implementation CancelTask
- (void)cancel{self.cancelled=YES;}
@end
@interface PasswordOnlyComponents:NSObject
@property(nonatomic,copy)NSString* host;
@end
@implementation PasswordOnlyComponents
- (NSString*)scheme{return @"https";}
- (NSString*)user{return nil;}
- (NSString*)password{return @"password";}
- (NSString*)query{return nil;}
- (NSString*)fragment{return nil;}
- (NSNumber*)port{return nil;}
- (NSString*)path{return @"/macros/s/id/exec";}
@end
static IMP StringComponents,URLComponents;
static id ComponentsFromString(id self,SEL cmd,NSString* string){if([string containsString:@"password-fault"]){PasswordOnlyComponents* value=[PasswordOnlyComponents new];value.host=@"script.google.com";return value;}return ((id(*)(id,SEL,NSString*))StringComponents)(self,cmd,string);}
static id ComponentsFromURL(id self,SEL cmd,NSURL* url,BOOL resolve){if([url.path containsString:@"password-fault"]){PasswordOnlyComponents* value=[PasswordOnlyComponents new];value.host=@"script.googleusercontent.com";return value;}return ((id(*)(id,SEL,NSURL*,BOOL))URLComponents)(self,cmd,url,resolve);}
@interface PixoraFeedbackTests : XCTestCase
@end
@implementation PixoraFeedbackTests
- (void)setUp{[super setUp];TransportError=NO;Status=200;Sent=nil;}
- (NSString*)sendEmail:(NSString*)email message:(NSString*)message rating:(double)rating identifier:(NSString*)identifier {
 XCTestExpectation* finished=[self expectationWithDescription:@"local transport"];__block NSString* error=nil;
 [LocalFeedback send:@"https://script.google.com/macros/s/local-test/exec" email:email message:message rating:rating identifier:identifier resolve:^(id value){XCTAssertEqualObjects(value,@YES);[finished fulfill];} reject:^(NSString* code,NSString* msg,NSError* underlying){error=code;[finished fulfill];}];
 [self waitForExpectations:@[finished] timeout:5];return error;
}
- (void)testLocalTransportSuccessAndFailures {
 NSString* identifier=NSUUID.UUID.UUIDString.lowercaseString;Reply=[NSJSONSerialization dataWithJSONObject:@{@"ok":@YES,@"id":identifier} options:0 error:nil];
 XCTAssertNil([self sendEmail:@" user@example.com " message:@"  helpful feedback  " rating:3 identifier:identifier]);
 NSDictionary* payload=[NSJSONSerialization JSONObjectWithData:Sent options:0 error:nil];XCTAssertEqualObjects(payload[@"platform"],@"ios");XCTAssertEqualObjects(payload[@"email"],@"user@example.com");XCTAssertEqualObjects(payload[@"message"],@"helpful feedback");XCTAssertEqualObjects(payload[@"id"],identifier);
 XCTAssertNil([self sendEmail:@"" message:@"valid message" rating:0 identifier:identifier]);
 for(id invalid in @[@[],@{@"ok":@NO,@"id":identifier},@{@"ok":@YES,@"id":@"wrong"}]){Reply=[NSJSONSerialization dataWithJSONObject:invalid options:0 error:nil];XCTAssertEqualObjects([self sendEmail:@"" message:@"valid message" rating:5 identifier:identifier],@"FEEDBACK_FAILED");}
 Reply=[@"invalid JSON" dataUsingEncoding:NSUTF8StringEncoding];XCTAssertEqualObjects([self sendEmail:@"" message:@"valid message" rating:0 identifier:identifier],@"FEEDBACK_FAILED");
 Reply=[NSMutableData dataWithLength:8193];XCTAssertEqualObjects([self sendEmail:@"" message:@"valid message" rating:0 identifier:identifier],@"FEEDBACK_FAILED");
 Reply=[NSData data];Status=500;XCTAssertEqualObjects([self sendEmail:@"" message:@"valid message" rating:0 identifier:identifier],@"FEEDBACK_FAILED");
 Status=200;TransportError=YES;XCTAssertEqualObjects([self sendEmail:@"" message:@"valid message" rating:0 identifier:identifier],@"FEEDBACK_FAILED");
}
- (void)testPasswordOnlyParserBoundary {
 StringComponents=method_setImplementation(class_getClassMethod(NSURLComponents.class,@selector(componentsWithString:)),(IMP)ComponentsFromString);URLComponents=method_setImplementation(class_getClassMethod(NSURLComponents.class,@selector(componentsWithURL:resolvingAgainstBaseURL:)),(IMP)ComponentsFromURL);
 @try{XCTAssertFalse([PixoraFeedback validEndpoint:@"https://script.google.com/password-fault"]);PixoraFeedback* worker=[PixoraFeedback new];NSHTTPURLResponse* response=[[NSHTTPURLResponse alloc]initWithURL:[NSURL URLWithString:@"https://script.google.com/macros/s/id/exec"] statusCode:302 HTTPVersion:nil headerFields:nil];[worker URLSession:nil task:nil willPerformHTTPRedirection:response newRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"https://script.googleusercontent.com/password-fault"]] completionHandler:^(NSURLRequest* request){XCTAssertNil(request);}];}
 @finally{method_setImplementation(class_getClassMethod(NSURLComponents.class,@selector(componentsWithString:)),StringComponents);method_setImplementation(class_getClassMethod(NSURLComponents.class,@selector(componentsWithURL:resolvingAgainstBaseURL:)),URLComponents);}
}
- (void)testInputBoundaries {
 NSString* identifier=NSUUID.UUID.UUIDString.lowercaseString;
 for(NSString* endpoint in @[@"https://script.google.com/macros/s/id/invalid",@"https://script.google.com:8443/macros/s/id/exec",@"https://script.google.com/macros/s/id/exec#fragment",@"https://user:password@script.google.com/macros/s/id/exec",@"https://:password@script.google.com/macros/s/id/exec"] )XCTAssertFalse([PixoraFeedback validEndpoint:endpoint]);
 for(NSArray* values in @[@[[@"x" stringByPaddingToLength:255 withString:@"x" startingAtIndex:0],@"valid message",@0,identifier],@[@"",@"no",@0,identifier],@[@"",[@"x" stringByPaddingToLength:4001 withString:@"x" startingAtIndex:0],@0,identifier],@[@"",@"valid message",@(NAN),identifier],@[@"",@"valid message",@1.5,identifier],@[@"",@"valid message",@-1,identifier],@[@"",@"valid message",@6,identifier],@[@"",@"valid message",@0,@"invalid"]])XCTAssertEqualObjects([self sendEmail:values[0] message:values[1] rating:[values[2] doubleValue] identifier:values[3]],@"FEEDBACK_INVALID");
}
- (void)testRedirectAndResponseSecurity {
 NSURL* source=[NSURL URLWithString:@"https://script.google.com/macros/s/id/exec"];
 for(NSArray* values in @[@[@302,@"https://script.googleusercontent.com/macros/echo?token=test",@YES],@[@303,@"https://script.googleusercontent.com/macros/echo",@YES],@[@301,@"https://script.googleusercontent.com/macros/echo",@NO],@[@307,@"https://script.googleusercontent.com/macros/echo",@NO],@[@302,@"http://script.googleusercontent.com/macros/echo",@NO],@[@302,@"https://example.com/macros/echo",@NO],@[@302,@"https://user@script.googleusercontent.com/macros/echo",@NO],@[@302,@"https://:password@script.googleusercontent.com/macros/echo",@NO],@[@302,@"https://script.googleusercontent.com:8443/macros/echo",@NO]]){
  PixoraFeedback* worker=[PixoraFeedback new];NSHTTPURLResponse* response=[[NSHTTPURLResponse alloc] initWithURL:source statusCode:[values[0] integerValue] HTTPVersion:nil headerFields:nil];NSMutableURLRequest* request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:values[1]]];request.HTTPMethod=@"POST";request.HTTPBody=[@"private" dataUsingEncoding:NSUTF8StringEncoding];
  __block NSURLRequest* follow=nil;[worker URLSession:nil task:nil willPerformHTTPRedirection:response newRequest:request completionHandler:^(NSURLRequest* value){follow=value;}];XCTAssertEqual(follow!=nil,[values[2] boolValue]);if(follow){XCTAssertEqualObjects(follow.HTTPMethod,@"GET");XCTAssertNil(follow.HTTPBody);[worker URLSession:nil task:nil willPerformHTTPRedirection:response newRequest:request completionHandler:^(NSURLRequest* value){XCTAssertNil(value);}];}
 }
 PixoraFeedback* worker=[PixoraFeedback new];__block NSURLSessionResponseDisposition disposition;[worker URLSession:nil dataTask:nil didReceiveResponse:[[NSURLResponse alloc] initWithURL:source MIMEType:nil expectedContentLength:-1 textEncodingName:nil] completionHandler:^(NSURLSessionResponseDisposition value){disposition=value;}];XCTAssertEqual(disposition,NSURLSessionResponseCancel);
 [worker setValue:[NSMutableData data] forKey:@"data"];CancelTask* task=[CancelTask new];[worker URLSession:nil dataTask:task didReceiveData:[NSMutableData dataWithLength:10]];XCTAssertEqual([[worker valueForKey:@"data"] length],10u);[worker URLSession:nil dataTask:task didReceiveData:[NSMutableData dataWithLength:8192]];XCTAssertTrue(task.cancelled);
 __block BOOL rejected=NO;[worker setValue:^(NSString* code,NSString* message,NSError* error){rejected=YES;XCTAssertEqualObjects(code,@"FEEDBACK_FAILED");} forKey:@"reject"];[worker URLSession:nil task:nil didCompleteWithError:nil];XCTAssertTrue(rejected);
}
@end
