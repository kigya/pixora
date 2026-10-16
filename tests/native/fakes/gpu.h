#pragma once
#include <net.h>
namespace ncnn {
inline void create_gpu_instance(){}
inline int get_gpu_count(){return fault.gpuCount;}
inline int get_default_gpu_index(){return 0;}
}
