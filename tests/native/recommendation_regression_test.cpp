#include "recommendation.h"
#include <array>
#include <cassert>
#include <cstdint>
#include <vector>

namespace {
// Frozen from the pre-refactor production classifier, not from the new policy.
// Baseline commit: 6a79e1f38047b1a241d8be3b21256b850c75190e
// Source SHA-256: f7ba995f0166f49481bc1896f8f1e944d8bd3f8e9abbe28f6564a5d77dda37b7
// The independent capture is recorded in the local classifier coverage report.
constexpr std::uint64_t kBaselineChecksum = UINT64_C(9278415340487551874);
std::uint64_t mix(std::uint64_t hash, unsigned char byte) {
  return (hash ^ byte) * UINT64_C(1099511628211);
}
std::uint64_t mixString(std::uint64_t hash, const char* text) {
  if(!text)return mix(hash,255);
  while(*text)hash=mix(hash,static_cast<unsigned char>(*text++));
  return mix(hash,0);
}
std::uint64_t record(std::uint64_t hash,pixora::recommendation::Recommendation value) {
  hash=mix(hash,static_cast<unsigned char>(value.kind));
  hash=mixString(hash,value.profile_id);hash=mixString(hash,value.speed);
  return mixString(hash,value.reason_id);
}
}
void recommendationRegressionFixtures() {
  using namespace pixora::recommendation;
  std::uint64_t checksum=UINT64_C(14695981039346656037);
  constexpr std::array<std::array<int,2>,6> sizes{{
      {{24,24}},{{63,81}},{{128,128}},{{257,193}},{{512,384}},{{1024,768}}}};
  for(auto size:sizes)for(int pattern=0;pattern<10;pattern++) {
    const int w=size[0],h=size[1],stride=w*4+12;
    // Padded rows also catch accidental assumptions about tightly packed RGBA.
    std::vector<uint8_t> rgba(static_cast<size_t>(stride)*h,0);
    uint32_t state=123456789u;
    for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
      state=state*1664525u+1013904223u;
      int r=x*220/w,g=y*220/h,b=(x+y)*220/(w+h),a=255;
      switch(pattern) {
        case 0:break;
        case 1:r=state>>24;g=(state>>16)&255;b=(state>>8)&255;break;
        case 2:case 3:{
          const int block=pattern==2?4:8;
          const int cell=(((x+1)/block)*7+((y+3)/block)*11)%6;
          r=cell*42;g=(cell*67)%256;b=255-cell*31;break;
        }
        case 4:{
          const bool line=x%53<3 || y%47<2;
          r=line?24:180+(x/19+y/23)%5*14;
          g=line?29:190+(x/19+y/23)%4*12;b=line?38:220;break;
        }
        case 5:{const int cell=(x/4)%6;r=cell*42;g=cell*31;b=240-cell*17;break;}
        case 6:a=(x+y)%7==0?0:96;break;
        case 7:r=g=b=(x%29<3 || y%31<2)?10:245;break;
        case 8:r=g=b=80;if(x%17==0 && y%19==0){r=state>>24;g=(state>>16)&255;}break;
        case 9:a=(x>w/3 && x<w/2 && y>h/3 && y<h/2)?255:0;break;
      }
      const int i=y*stride+x*4;
      rgba[i]=r;rgba[i+1]=g;rgba[i+2]=b;rgba[i+3]=a;
    }
    const auto result=analyze(rgba.data(),w,h,stride);checksum=record(checksum,result);
    for(uint32_t mask=0;mask<=All;mask++)checksum=record(checksum,available(result,mask));
  }
  assert(checksum == kBaselineChecksum);
}
