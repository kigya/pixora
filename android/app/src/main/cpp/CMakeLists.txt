cmake_minimum_required(VERSION 3.22.1)
project(appmodules)
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)
set(ncnn_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../vendor/ncnn/arm64-v8a/lib/cmake/ncnn)
find_package(ncnn REQUIRED)
# Keep allocation exceptions in the JNI wrapper; ncnn itself remains prebuilt.
set_property(TARGET ncnn PROPERTY INTERFACE_COMPILE_OPTIONS -frtti -fexceptions)
add_library(upscale SHARED engine/upscale.cpp
  ../../../../../native/engine/engine.cpp ../../../../../native/engine/pixels.cpp ../../../../../native/engine/raster.cpp
  engine/raster_jni.cpp engine/recommendation_jni.cpp ../../../../../native/recommendation/recommendation.cpp)
target_include_directories(upscale PRIVATE ${FEEDBACK_GENERATED_DIR}
  ../../../../../native/engine
  ../../../../../native/recommendation/include)
target_compile_features(upscale PRIVATE cxx_std_17)
target_compile_options(upscale PRIVATE -fexceptions)
target_link_libraries(upscale ncnn android jnigraphics log z)
target_link_options(upscale PRIVATE "-Wl,-z,max-page-size=16384")

option(UPSCALE_COVERAGE "Instrument own native code for local tests" OFF)
if(UPSCALE_COVERAGE)
  target_compile_definitions(upscale PRIVATE UPSCALE_COVERAGE=1)
  target_compile_options(upscale PRIVATE -fprofile-instr-generate -fcoverage-mapping -O0 -g)
  target_link_options(upscale PRIVATE -fprofile-instr-generate)
endif()

# Only the explicit local diagnostics variant compiles crash-test triggers.
option(PIXORA_FIREBASE_DIAGNOSTICS "Build Firebase validation harness" OFF)
if(PIXORA_FIREBASE_DIAGNOSTICS)
  add_library(pixora_diagnostics SHARED ../../diagnostics/cpp/crash.cpp)
  target_compile_features(pixora_diagnostics PRIVATE cxx_std_17)
  target_link_options(pixora_diagnostics PRIVATE "-Wl,-z,max-page-size=16384")
endif()
