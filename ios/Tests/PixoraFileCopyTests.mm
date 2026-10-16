#import <XCTest/XCTest.h>
#import "../Native/PixoraImages.h"
@interface FailedInput : NSInputStream
@end
@implementation FailedInput
- (void)open{}
- (void)close{}
- (NSInteger)read:(uint8_t*)buffer maxLength:(NSUInteger)length{return -1;}
@end
@interface PartialOutput : NSOutputStream
@property(nonatomic,strong) NSMutableData* received;
@property(nonatomic) BOOL fail;
@end
@implementation PartialOutput
- (void)open{self.received=[NSMutableData data];}
- (void)close{}
- (NSInteger)write:(const uint8_t*)buffer maxLength:(NSUInteger)length{if(self.fail)return 0;NSUInteger count=MIN(3,length);[self.received appendBytes:buffer length:count];return count;}
@end
@interface PixoraFileCopyTests : XCTestCase
@end
@implementation PixoraFileCopyTests
- (void)testBoundedStreamHandlesGrowthPartialWritesAndErrors {
 NSData* bytes=[@"test content" dataUsingEncoding:NSUTF8StringEncoding];PartialOutput* partial=[PartialOutput new];pixora::copyBounded([NSInputStream inputStreamWithData:bytes],partial);XCTAssertEqualObjects(partial.received,bytes);
 partial.fail=YES;XCTAssertThrowsSpecificNamed(pixora::copyBounded([NSInputStream inputStreamWithData:bytes],partial),NSException,@"SOURCE_UNAVAILABLE");
 XCTAssertThrowsSpecificNamed(pixora::copyBounded([FailedInput new],[NSOutputStream outputStreamToMemory]),NSException,@"SOURCE_UNAVAILABLE");
 XCTAssertThrowsSpecificNamed(pixora::copyBounded(nil,[NSOutputStream outputStreamToMemory]),NSException,@"SOURCE_UNAVAILABLE");XCTAssertThrowsSpecificNamed(pixora::copyBounded([NSInputStream inputStreamWithData:bytes],nil),NSException,@"SOURCE_UNAVAILABLE");
 // The stream can grow beyond an earlier metadata size; only the actual byte
 // limit governs copying, and the extra byte is detected before being written.
 NSData* grown=[NSMutableData dataWithLength:50LL*1024*1024+1];NSOutputStream* output=[NSOutputStream outputStreamToMemory];XCTAssertThrowsSpecificNamed(pixora::copyBounded([NSInputStream inputStreamWithData:grown],output),NSException,@"FILE_TOO_LARGE");XCTAssertEqual([[output propertyForKey:NSStreamDataWrittenToMemoryStreamKey] length],50LL*1024*1024);
}
- (void)testFileCopyChecksSizeBeforeCreatingAndRemovesPartialFiles {
 NSURL* folder=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString] isDirectory:YES];[NSFileManager.defaultManager createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil];
 @try {NSURL* source=[folder URLByAppendingPathComponent:@"source"];NSURL* target=[folder URLByAppendingPathComponent:@"target"];NSData* bytes=[@"local data" dataUsingEncoding:NSUTF8StringEncoding];[bytes writeToURL:source atomically:YES];pixora::copyImport(source,target);XCTAssertEqualObjects([NSData dataWithContentsOfURL:target],bytes);[NSFileManager.defaultManager removeItemAtURL:target error:nil];
  NSURL* missing=[folder URLByAppendingPathComponent:@"absent"];XCTAssertThrowsSpecificNamed(pixora::copyImport(missing,target),NSException,@"SOURCE_UNAVAILABLE");XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:target.path]);
  NSFileHandle* handle=[NSFileHandle fileHandleForWritingToURL:source error:nil];[handle truncateFileAtOffset:50LL*1024*1024+1];[handle closeFile];XCTAssertThrowsSpecificNamed(pixora::copyImport(source,target),NSException,@"FILE_TOO_LARGE");XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:target.path]);
  [source removeAllCachedResourceValues];XCTAssertThrowsSpecificNamed(pixora::copyImport(source,target),NSException,@"FILE_TOO_LARGE");XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:target.path]);
  [bytes writeToURL:source atomically:YES];[source removeAllCachedResourceValues];NSURL* invalid=[folder URLByAppendingPathComponent:@"absent/child"];XCTAssertThrowsSpecificNamed(pixora::copyImport(source,invalid),NSException,@"SOURCE_UNAVAILABLE");XCTAssertFalse([NSFileManager.defaultManager fileExistsAtPath:invalid.path]);
 }@finally{[NSFileManager.defaultManager removeItemAtURL:folder error:nil];}
}
@end
