// Test-only call-site-scoped compatibility fault. Never linked into Pixora.app.
#import "NotificationAvailability.h"
#import "fishhook/fishhook.h"
#include <mach-o/dyld.h>
#include <mach-o/nlist.h>
#include <unwind.h>
#include <cstring>
#include <cstdint>
#include <atomic>
#include <dlfcn.h>
#include <cstdio>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>
struct Version {uint32_t platform,version;};
using Check=bool(*)(uint32_t,Version*);
static std::atomic<Check> Original{nullptr};
static uintptr_t Begin,End;
static const mach_header* AppHeader;static intptr_t AppSlide;
static std::atomic<int> Intercepts{0};
static std::atomic<bool> Simulating{false};
static std::atomic<int> Calls{0};
static _Unwind_Reason_Code NotificationFrame(_Unwind_Context* context,void* found){uintptr_t pc=_Unwind_GetIP(context);if(pc>=Begin && pc<End){*(bool*)found=true;return _URC_NORMAL_STOP;}return _URC_NO_REASON;}
static bool Availability(uint32_t count,Version* versions) {
 int call=++Calls;if(Simulating && call<5)fprintf(stderr,"availability boundary call: count=%u platform=%u version=%x\n",count,count?versions[0].platform:0,count?versions[0].version:0);
 if(Simulating && count==1 && versions[0].version==(16u<<16)){bool found=false;_Unwind_Backtrace(NotificationFrame,&found);if(found){Intercepts++;return false;}}
 return Original.load()(count,versions);
}
static bool NotificationBlockRange() {
 Dl_info image;if(!dladdr((void*)class_getMethodImplementation(NSClassFromString(@"PixoraUpscale"),@selector(openNotificationSettings:reject:)),&image))return false;AppHeader=(const mach_header*)image.dli_fbase;AppSlide=0;for(uint32_t i=0;i<_dyld_image_count();i++)if(_dyld_get_image_header(i)==AppHeader)AppSlide=_dyld_get_image_vmaddr_slide(i);
 NSData* file=[NSData dataWithContentsOfFile:[NSString stringWithUTF8String:image.dli_fname] options:NSDataReadingMappedIfSafe error:nil];if(file.length<sizeof(mach_header_64))return false;const auto* header=(const mach_header_64*)file.bytes;if(header->magic!=MH_MAGIC_64)return false;const symtab_command* symbols=nullptr;const auto* command=(const load_command*)(header+1);
 for(uint32_t i=0;i<header->ncmds;i++){if(command->cmd==LC_SYMTAB)symbols=(const symtab_command*)command;command=(const load_command*)((uintptr_t)command+command->cmdsize);}
 if(!symbols || symbols->stroff+symbols->strsize>file.length)return false;const auto* table=(const nlist_64*)((const uint8_t*)file.bytes+symbols->symoff);const char* names=(const char*)file.bytes+symbols->stroff;const char* suffix="openNotificationSettings:reject:]_block_invoke";Begin=0;End=UINTPTR_MAX;
 for(uint32_t i=0;i<symbols->nsyms;i++){const char* name=names+table[i].n_un.n_strx;const char* found=strstr(name,suffix);if(found && !strcmp(found,suffix))Begin=AppSlide+table[i].n_value;}
 if(!Begin){fprintf(stderr,"availability boundary: block absent in own file symbols=%u\n",symbols->nsyms);return false;}for(uint32_t i=0;i<symbols->nsyms;i++){uintptr_t value=AppSlide+table[i].n_value;if(value>Begin && value<End)End=value;}return End!=UINTPTR_MAX;
}
bool PixoraBeginSimulatedIOS15NotificationSettings(){NSLog(@"Availability test boundary entered (own image only)");if(!NotificationBlockRange()){fprintf(stderr,"availability boundary: missing app block range\n");return false;}Check runtime=(Check)dlsym(RTLD_DEFAULT,"_availability_version_check");if(!runtime){fprintf(stderr,"availability boundary: missing runtime export\n");return false;}Original.store(runtime);Check previous=nullptr;struct rebinding binding={"_availability_version_check",(void*)Availability,(void**)&previous};int result=rebind_symbols_image((void*)AppHeader,AppSlide,&binding,1);if(previous)Original.store(previous);fprintf(stderr,"availability boundary: range=%llx-%llx rebind=%d previous=%d\n",(unsigned long long)Begin,(unsigned long long)End,result,previous!=nullptr);Simulating=result==0 && previous;Intercepts=0;Calls=0;return Simulating;}
void PixoraEndSimulatedIOS15NotificationSettings(){Simulating=false;if(Original.load()){struct rebinding binding={"_availability_version_check",(void*)Original.load(),nullptr};rebind_symbols_image((void*)AppHeader,AppSlide,&binding,1);}}
int PixoraNotificationAvailabilityIntercepts(){return Intercepts;}
