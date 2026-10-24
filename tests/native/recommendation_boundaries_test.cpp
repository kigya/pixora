// Exercise the real private feature/voting policy without publishing test hooks.
// Public-API cases link to this exact production translation unit.
#include <cassert>
#include <cstdlib>
#include <limits>
#include <new>
#include <stdexcept>

namespace { bool fail_next_allocation = false; }
void* operator new(std::size_t size) {
  if (fail_next_allocation) { fail_next_allocation = false; throw std::bad_alloc(); }
  if (void* result = std::malloc(size ? size : 1)) return result;
  throw std::bad_alloc();
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }
void* operator new[](std::size_t size) { return ::operator new(size); }
void operator delete[](void* p) noexcept { ::operator delete(p); }
void operator delete[](void* p, std::size_t) noexcept { ::operator delete(p); }

#include "../../native/recommendation/recommendation.cpp"
using namespace pixora::recommendation;

namespace {
Features photo() {
  Features f; f.visible=256; f.colors=100; f.tones=24;
  f.flat=.75; f.edges=.01; f.texture=.1; f.noise=.01; return f;
}
Features drawing() {
  Features f; f.visible=256; f.colors=6; f.tones=6;
  f.flat=.9; f.edges=.1; f.texture=.05; f.noise=.01; return f;
}
void predicatesRespectEveryBoundary() {
  const auto p=photo(); assert(photoLike(p));
  auto f=p; f.visible=63; assert(!photoLike(f));
  f=p; f.colors=89; f.tones=19; assert(!photoLike(f));
  f=p; f.colors=89; assert(photoLike(f));
  f=p; f.flat=.88; f.tones=19; assert(!photoLike(f));
  f=p; f.flat=.88; f.texture=.20; assert(!photoLike(f));
  f=p; f.flat=.88; assert(photoLike(f));
  f=p; f.edges=.36; assert(!photoLike(f));
  f=p; f.noise=.55; assert(!photoLike(f));

  const auto d=drawing(); assert(drawingLike(d));
  f=d; f.visible=63; assert(!drawingLike(f));
  f=d; f.colors=4; assert(!drawingLike(f));
  f=d; f.colors=181; assert(!drawingLike(f));
  f=d; f.flat=.699; assert(!drawingLike(f));
  f=d; f.edges=.0059; assert(!drawingLike(f));
  f=d; f.edges=.221; assert(!drawingLike(f));
  f=d; f.texture=.24; assert(!drawingLike(f));
  f=d; f.noise=.08; assert(!drawingLike(f));
  f=d; f.flat=.70; f.edges=.006; assert(drawingLike(f));
  f.edges=.22; assert(drawingLike(f));

  f=d; f.edges=.003; assert(!interfaceLike(f));
  f=d; f.colors=4; assert(interfaceLike(f));
  f=d; f.extreme_tones=.88; f.axis_edges=.71; assert(!interfaceLike(f));
  f.extreme_tones=.89; f.axis_edges=.70; assert(!interfaceLike(f));
  f.axis_edges=.71; assert(interfaceLike(f));
}
void votesRequireVisibleEvidenceAndAvoidDoubleCounting() {
  Votes v;
  auto f=photo(); f.visible=63; v.add(f); assert(v.patches==0);
  f=photo(); v.add(f); assert(v.photos==1 && v.smooth==1 && v.drawings==0);
  // A feature vector can satisfy photo and drawing predicates together. It
  // supplies one photographic vote, never a contradictory illustration vote.
  f=photo(); assert(drawingLike(f)); v.add(f); assert(v.drawings==0 && v.photos==2);
  f=drawing(); v.add(f); assert(v.drawings==1);
  f=photo(); f.edges=.02; v.add(f); assert(v.smooth==2);
  f=photo(); f.texture=.20; v.add(f); assert(v.smooth==2);
  f=photo(); f.noise=.03; v.add(f); assert(v.smooth==2);
  assert(v.patches==6);
}
void decisionsUseAgreementAndConservativeFallbacks() {
  auto p=photo(),d=drawing(); Votes v;
  assert(choose(p,p,v).kind==ContentKind::Generic);
  v.patches=5; v.photos=3;
  assert(choose(p,p,v).kind==ContentKind::Photo);
  v.smooth=3; assert(choose(p,p,v).kind==ContentKind::Smooth);
  auto f=p; f.edges=.02; assert(choose(f,p,v).kind==ContentKind::Photo);
  f=p; f.noise=.03; assert(choose(f,p,v).kind==ContentKind::Photo);
  v.smooth=2; assert(choose(p,p,v).kind==ContentKind::Photo);
  v.photos=2; assert(choose(p,p,v).kind==ContentKind::Mixed);
  v.photos=3; v.drawings=1; assert(choose(p,p,v).kind==ContentKind::Mixed);
  v.drawings=0; v.interfaces=1; assert(choose(p,p,v).kind==ContentKind::Mixed);
  v.interfaces=0; f=p; f.colors=4; assert(choose(p,f,v).kind==ContentKind::Mixed);
  v.photos=0; v.drawings=3;
  assert(choose(d,d,v).kind==ContentKind::LineArt);
  v.drawings=2; assert(choose(d,d,v).kind==ContentKind::Mixed);
  v.drawings=0; v.photos=1; assert(choose(d,d,v).kind==ContentKind::Mixed);
  v.photos=0; v.drawings=3; f=p; f.edges=.3; assert(choose(d,f,v).kind==ContentKind::Mixed);
}
void axisInputValidationAndPhaseBoundaries() {
  AxisEvidence a; a.cross=12; a.length=48;
  for(int period : {-1,0,1,17,std::numeric_limits<int>::max()})assert(!gridAxis(a,period));
  a.cross=0; assert(!gridAxis(a,4)); a.cross=12;
  a.length=1025; assert(!gridAxis(a,4)); a.length=23; assert(!gridAxis(a,4));
  a.length=48;
  assert(!gridAxis(a,4));
  for(int i=1;i<a.length;i++)if(i%4==1){a.energy[i]=20*a.cross;a.transitions[i]=a.cross/3+1;}
  assert(gridAxis(a,4));
  for(int i=1;i<a.length;i++)if(i%4==1)a.energy[i]=19.99*a.cross;
  assert(!gridAxis(a,4));
  for(int i=1;i<a.length;i++)if(i%4==1)a.energy[i]=20*a.cross;
  for(int i=1;i<a.length;i++)if(i%4!=1)a.energy[i]=.5001*a.cross;
  assert(!gridAxis(a,4));
  for(int i=1;i<a.length;i++)if(i%4!=1)a.energy[i]=.5*a.cross;
  assert(gridAxis(a,4));
  for(int i=1;i<a.length;i++)a.transitions[i]=a.cross/3;
  assert(!gridAxis(a,4));
}
void pixelGridEligibilityAndPartialAlphaEvidence() {
  std::vector<uint8_t> bytes(32*32*4,128);
  Features f; f.visible=1024; f.colors=6; f.flat=1;
  assert(pixelGrid(bytes.data(),23,32,128,f)==GridKind::None);
  assert(pixelGrid(bytes.data(),32,23,128,f)==GridKind::None);
  f.visible=101; assert(pixelGrid(bytes.data(),32,32,128,f)==GridKind::None);
  f.visible=1024; f.colors=4; assert(pixelGrid(bytes.data(),32,32,128,f)==GridKind::None);
  f.colors=129; assert(pixelGrid(bytes.data(),32,32,128,f)==GridKind::None);
  f.colors=6; f.flat=.449; assert(pixelGrid(bytes.data(),32,32,128,f)==GridKind::None);
  f.flat=1; f.noise=.0201; assert(pixelGrid(bytes.data(),32,32,128,f)==GridKind::None);
  f.noise=.02; assert(pixelGrid(bytes.data(),32,32,128,f)==GridKind::None);
  // Rare isolated bins are deliberately ignored by the palette statistic,
  // but their real sharp edges must still prevent the constant-image exit.
  std::vector<uint8_t> rare(128*128*4,0);
  for(size_t i=3;i<rare.size();i+=4)rare[i]=255;
  for(int i=0;i<120;i++) {
    const int offset=((1+i/30*4)*128+1+i%30*4)*4;
    rare[offset]=64+(i%8)*16;rare[offset+1]=64+((i/8)%8)*16;rare[offset+2]=64+(i/64)*16;
  }
  const auto measured=measure(rare.data(),128,128,512);
  assert(measured.colors==1 && measured.edges>=.003);
  assert(analyze(rare.data(),128,128,512).kind==ContentKind::Mixed);
}
void allocationFailureIsNoexceptAndMissingProfileFallsBack() {
  std::vector<uint8_t> bytes(32*32*4,255);
  for(int y=0;y<32;y++)for(int x=0;x<32;x++) {
    const int i=(y*32+x)*4; bytes[i]=x*7;bytes[i+1]=y*7;bytes[i+2]=(x+y)*3;
  }
  fail_next_allocation=true;
  const auto result=analyze(bytes.data(),32,32,128);
  assert(!fail_next_allocation && result.kind==ContentKind::Generic);
  assert(std::strcmp(result.profile_id,"balanced")==0);
  const auto missing=available({ContentKind::Generic,nullptr,"quality","unavailable"},All);
  assert(std::strcmp(missing.profile_id,"standard")==0);
  assert(available(missing,0).profile_id==nullptr);
}
}
void recommendationPublicApiTests();
void recommendationRegressionFixtures();
int main() {
  recommendationPublicApiTests();
  recommendationRegressionFixtures();
  predicatesRespectEveryBoundary(); votesRequireVisibleEvidenceAndAvoidDoubleCounting();
  decisionsUseAgreementAndConservativeFallbacks(); axisInputValidationAndPhaseBoundaries();
  pixelGridEligibilityAndPartialAlphaEvidence(); allocationFailureIsNoexceptAndMissingProfileFallsBack();
}
