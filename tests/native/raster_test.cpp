#include "raster.h"
#include <cassert>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <vector>
#include <zlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <cerrno>
#include <array>
#include <algorithm>
static int writeFault=0,readFault=0,truncateFault=0,deflateFault=0,initFault=0,closeFault=0;
static size_t checkedFwrite(const void* p,size_t s,size_t n,FILE* f){if(writeFault>0 && --writeFault==0)return 0;return ::fwrite(p,s,n,f);}
static ssize_t checkedPread(int fd,void* p,size_t n,off_t o){if(readFault){int fault=readFault;readFault=0;errno=fault==1?EINTR:EIO;return -1;}return ::pread(fd,p,n,o);}
static ssize_t checkedPwrite(int fd,const void* p,size_t n,off_t o){if(writeFault<0){int fault=writeFault;writeFault=0;errno=fault==-1?EINTR:EIO;return -1;}return ::pwrite(fd,p,n,o);}
static int checkedTruncate(int fd,off_t n){if(truncateFault){truncateFault=0;return -1;}return ::ftruncate(fd,n);}
static int checkedDeflateInit(z_streamp stream,int level){if(initFault){initFault=0;return Z_MEM_ERROR;}return deflateInit(stream,level);}
static int checkedDeflate(z_streamp stream,int flush){if(deflateFault){deflateFault=0;return Z_DATA_ERROR;}return ::deflate(stream,flush);}
static int checkedClose(FILE* file){int result=::fclose(file);if(closeFault){closeFault=0;return EOF;}return result;}
#define fwrite checkedFwrite
#define pread checkedPread
#define pwrite checkedPwrite
#define ftruncate checkedTruncate
#undef deflateInit
#define deflateInit checkedDeflateInit
#define deflate checkedDeflate
#define fclose checkedClose
#include "../../native/engine/raster.cpp"
#undef fwrite
#undef pread
#undef pwrite
#undef ftruncate
#undef deflateInit
#undef deflate
#undef fclose
static unsigned big(const unsigned char* p){return (unsigned(p[0])<<24)|(unsigned(p[1])<<16)|(unsigned(p[2])<<8)|p[3];}
int main(){
 using namespace upscale;
 const std::string raw="coverage/native-core/raster.rgba",png="coverage/native-core/raster.png";
 auto fails=[](auto f){bool failed=false;try{f();}catch(const std::runtime_error&){failed=true;}assert(failed);};
 assert(originalSizeAllowed(4000,4000,2));assert(!originalSizeAllowed(4001,4000,2));assert(originalSizeAllowed(2000,2000,4));assert(!originalSizeAllowed(8193,1,2));assert(!originalSizeAllowed(1,1,3));assert(!originalSizeAllowed(0,1,2));assert(!originalSizeAllowed(1,0,2));assert(!originalSizeAllowed(1,8193,2));
 fails([&]{Raster a(raw,0,1,true);});fails([&]{Raster a(raw,1,0,true);});fails([&]{Raster a(raw,16385,1,true);});fails([&]{Raster a(raw,1,16385,true);});fails([&]{Raster a(raw,10000,10000,true);});fails([&]{Raster a("/not/a/path",1,1,true);});fails([&]{Raster a("/not/a/path",1,1,false);});
 std::vector<unsigned char> pixels(5*4*4);for(size_t i=0;i<pixels.size();i+=4){pixels[i]=64;pixels[i+1]=32;pixels[i+2]=16;pixels[i+3]=128;}
 {Raster raster(raw,3,2,true);raster.write({pixels.data(),5,4,20},0,0,1,1,3,2);assert(raster.png(png,[]{return false;}));
 fails([&]{raster.write({nullptr,5,4,20},0,0,0,0,1,1);});fails([&]{raster.write({pixels.data(),5,4,20},-1,0,0,0,1,1);});fails([&]{raster.write({pixels.data(),5,4,20},0,-1,0,0,1,1);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,-1,0,1,1);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,0,-1,1,1);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,0,0,0,1);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,0,0,1,0);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,0,0,4,1);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,0,0,1,3);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,5,0,1,1);});fails([&]{raster.write({pixels.data(),5,4,20},0,0,0,4,1,1);});fails([&]{raster.write({pixels.data(),5,4,1},0,0,0,0,1,1);});fails([&]{raster.png("/not/a/path",[]{return false;});});}
 std::ifstream input(png,std::ios::binary);std::vector<unsigned char> bytes((std::istreambuf_iterator<char>(input)),{}),compressed;
 assert(bytes.size()>40 && bytes[0]==137);
 for(size_t i=8;i<bytes.size();){unsigned length=big(&bytes[i]);std::string type((char*)&bytes[i+4],4);if(type=="IDAT")compressed.insert(compressed.end(),bytes.begin()+i+8,bytes.begin()+i+8+length);unsigned crc=big(&bytes[i+8+length]);assert(crc==(unsigned)crc32(0,&bytes[i+4],length+4));i+=length+12;}
 std::vector<unsigned char> scanlines(26);uLongf count=scanlines.size();assert(uncompress(scanlines.data(),&count,compressed.data(),compressed.size())==Z_OK && count==26);assert(scanlines[0]==0 && scanlines[1]==127 && scanlines[2]==63 && scanlines[3]==31 && scanlines[4]==128);
 {Raster raster(raw,3,2,false);assert(!raster.png(png,[]{return true;}));}
 fails([&]{Raster raster(raw,2,2,false);});
 {Raster raster(raw,1,1,true);unsigned char invisible[4]={0,0,0,0};raster.write({invisible,1,1,4},0,0,0,0,1,1);int calls=0;assert(!raster.png(png,[&]{return ++calls>1;}));}

 {truncateFault=1;fails([&]{Raster raster(raw,1,1,true);});}
 {Raster raster(raw,3,2,true);for(int code:{-1,-2}){writeFault=code;if(code==-1)raster.write({pixels.data(),5,4,20},0,0,1,1,3,2);else fails([&]{raster.write({pixels.data(),5,4,20},0,0,1,1,3,2);});}
  for(int code:{1,2}){readFault=code;if(code==1)assert(raster.png(png,[]{return false;}));else fails([&]{raster.png(png,[]{return false;});});}
  for(int call=1;call<=12;call++){writeFault=call;fails([&]{raster.png(png,[]{return false;});});writeFault=0;}
  initFault=1;fails([&]{raster.png(png,[]{return false;});});deflateFault=1;fails([&]{raster.png(png,[]{return false;});});closeFault=1;fails([&]{raster.png(png,[]{return false;});});
 }
 {Raster raster(raw,16384,2,true);std::vector<unsigned char> noise(16384*2*4);unsigned state=17;for(auto& byte:noise){state=1664525*state+1013904223;byte=state>>24;}for(size_t i=3;i<noise.size();i+=4)noise[i]=255;raster.write({noise.data(),16384,2,16384*4},0,0,0,0,16384,2);assert(raster.png(png,[]{return false;}));}
 std::remove(raw.c_str());std::remove(png.c_str());
}
