#include "raster.h"
#include <algorithm>
#include <array>
#include <cerrno>
#include <cstdio>
#include <fcntl.h>
#include <stdexcept>
#include <unistd.h>
#include <zlib.h>
namespace upscale {
namespace {
void require(bool ok){if(!ok)throw std::runtime_error("RASTER_IO_FAILED");}
void transfer(int fd,void* data,size_t size,off_t offset,bool write) {
 auto* bytes=static_cast<uint8_t*>(data);
 while(size){ssize_t n=write?::pwrite(fd,bytes,size,offset) : ::pread(fd,bytes,size,offset);if(n<0 && errno==EINTR)continue;require(n>0);size-=n;bytes+=n;offset+=n;}
}
void big(uint8_t* p,uint32_t n){p[0]=n>>24;p[1]=n>>16;p[2]=n>>8;p[3]=n;}
void chunk(FILE* file,const char* name,const uint8_t* data,uint32_t size) {
 uint8_t length[4],crc[4];big(length,size);uLong sum=crc32(0,(const Bytef*)name,4);if(size)sum=crc32(sum,data,size);big(crc,(uint32_t)sum);
 require(fwrite(length,1,4,file)==4 && fwrite(name,1,4,file)==4);
 if(size)require(fwrite(data,1,size,file)==size);
 require(fwrite(crc,1,4,file)==4);
}
}
bool originalSizeAllowed(int w,int h,int scale){return w>0 && h>0 && (scale==2 || scale==4) && (int64_t)w*scale<=16384 && (int64_t)h*scale<=16384 && (int64_t)w*h*scale*scale<=64000000;}
Raster::Raster(const std::string& path,int width,int height,bool create):width_(width),height_(height),path_(path) {
 require(width>0 && height>0 && width<=16384 && height<=16384 && (int64_t)width*height<=64000000);
 fd_=open(path.c_str(),O_RDWR|(create?(O_CREAT|O_TRUNC):0),0600);require(fd_>=0);
 const off_t size=(off_t)width*height*4;
 if((create && ftruncate(fd_,size)!=0) || (!create && lseek(fd_,0,SEEK_END)!=size)){close(fd_);fd_=-1;throw std::runtime_error("RASTER_IO_FAILED");}
}
Raster::~Raster(){close(fd_);}
void Raster::write(PixelsView tile,int x,int y,int cropX,int cropY,int w,int h) {
 require(tile.data && x>=0 && y>=0 && cropX>=0 && cropY>=0 && w>0 && h>0 && (int64_t)x+w<=width_ && (int64_t)y+h<=height_ && (int64_t)cropX+w<=tile.width && (int64_t)cropY+h<=tile.height && (int64_t)tile.stride>=(int64_t)tile.width*4);
 for(int row=0;row<h;row++)transfer(fd_,tile.row(cropY+row)+cropX*4,(size_t)w*4,((off_t)(y+row)*width_+x)*4,true);
}
bool Raster::png(const std::string& destination,const std::function<bool()>& cancelled) {
 FILE* file=fopen(destination.c_str(),"wb");require(file);
 z_stream stream{};bool initialized=false,ok=false;
 try {
  const uint8_t signature[]={137,80,78,71,13,10,26,10};require(fwrite(signature,1,8,file)==8);
  uint8_t header[13]={};big(header,width_);big(header+4,height_);header[8]=8;header[9]=6;chunk(file,"IHDR",header,13);
  const uint8_t intent=0;chunk(file,"sRGB",&intent,1);
  require(deflateInit(&stream,6)==Z_OK);initialized=true;
  std::vector<uint8_t> row((size_t)width_*4+1);std::array<uint8_t,65536> buffer{};
  for(int y=0;y<height_;y++) {
   if(cancelled())break;
   row[0]=0;transfer(fd_,row.data()+1,row.size()-1,(off_t)y*width_*4,false);
   for(size_t i=1;i<row.size();i+=4)for(int c=0;c<3;c++)row[i+c]=row[i+3]?std::min(255,(int)row[i+c]*255/row[i+3]):0;
   stream.next_in=row.data();stream.avail_in=(uInt)row.size();
   const int flush=y+1==height_?Z_FINISH:Z_NO_FLUSH;
   int status;
   do {stream.next_out=buffer.data();stream.avail_out=buffer.size();status=deflate(&stream,flush);require(status==Z_OK || status==Z_STREAM_END);uint32_t size=(uint32_t)(buffer.size()-stream.avail_out);if(size)chunk(file,"IDAT",buffer.data(),size);if(status==Z_STREAM_END)break;}while(stream.avail_out==0);
   if(y+1==height_)ok=true;
  }
  if(ok && !cancelled())chunk(file,"IEND",nullptr,0);else ok=false;
  deflateEnd(&stream);initialized=false;
  const int status=fclose(file);file=nullptr;require(status==0);
 } catch(...) {if(initialized)deflateEnd(&stream);if(file)fclose(file);remove(destination.c_str());throw;}
 if(!ok)remove(destination.c_str());return ok;
}
}
