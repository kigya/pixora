#pragma once
#include <jni.h>
struct AAssetManager{};
inline AAssetManager* AAssetManager_fromJava(JNIEnv*,jobject assets){return static_cast<AAssetManager*>(assets);}
