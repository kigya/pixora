# Preserve readable source locations and JNI contracts, without keeping application classes wholesale.
-keepattributes SourceFile,LineNumberTable
-keep class dev.kigya.pixora.NativeEngine { native <methods>; }
-keep interface dev.kigya.pixora.ProgressCallback { *; }
-keepclassmembers class * implements dev.kigya.pixora.ProgressCallback { public <methods>; }
# RNScreensFragmentFactory identifies restored fragments by their package name.
# Preserve only these third-party fragment names so R8 repackaging cannot bypass
# the factory and invoke ScreenFragment's deliberately unsupported constructor.
-keepnames class com.swmansion.rnscreens.** extends androidx.fragment.app.Fragment
