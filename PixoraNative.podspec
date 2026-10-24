Pod::Spec.new do |s|
  s.name = 'PixoraNative'
  s.version = '0.9.0'
  s.summary = 'Pixora offline ncnn CPU engine and iOS platform adapter'
  s.homepage = 'https://github.com/kigya/pixora'
  s.license = { :type => 'Proprietary' }
  s.author = 'Pixora'
  s.source = { :git => 'https://github.com/kigya/pixora.git', :tag => s.version }
  s.platform = :ios, '16.4'
  s.source_files = 'ios/Native/*.{h,mm}', 'native/engine/*.{h,cpp}', 'native/recommendation/**/*.{h,cpp}', 'native/recreate/recreate.{h,cpp}'
  s.script_phase = { :name => 'Build local diffusion CPU backend', :script => 'bash "${PODS_TARGET_SRCROOT}/scripts/build-recreate-ios.sh"', :execution_position => :before_compile, :output_files => ['${PODS_CONFIGURATION_BUILD_DIR}/PixoraDiffusion/libPixoraDiffusion.a'] }
  s.public_header_files = 'ios/Native/PixoraUpscale.h'
  s.header_mappings_dir = 'ios/Native'
  s.vendored_frameworks = 'ios/Vendor/ncnn.xcframework'
  s.resource_bundles = { 'PixoraAssets' => ['android/app/src/main/assets/models/*', 'android/app/src/main/assets/model-manifest.json', 'android/app/src/main/assets/LEGAL.txt', 'src/locales/*.json', 'ios/Resources/LEGAL-ios.txt'] }
  s.frameworks = 'UIKit', 'ImageIO', 'PhotosUI', 'UserNotifications', 'StoreKit', 'UniformTypeIdentifiers', 'CoreImage'
  s.libraries = 'c++', 'z'
  s.pod_target_xcconfig = { 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20', 'GCC_ENABLE_CPP_RTTI' => 'YES', 'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/native/engine" "$(PODS_TARGET_SRCROOT)/native/recommendation/include" "$(PODS_TARGET_SRCROOT)/native/recreate" "$(PODS_TARGET_SRCROOT)/native/recreate/vendor/stable-diffusion.cpp/include"', 'DEFINES_MODULE' => 'YES' }
  s.user_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -force_load "$(PODS_CONFIGURATION_BUILD_DIR)/PixoraDiffusion/libPixoraDiffusion.a"', 'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_ROOT)/../build/generated/ios/ReactCodegen"' }
  s.dependency 'React-Core'
  s.dependency 'ReactCodegen'
  s.dependency 'FirebaseAnalytics/Core'
  s.dependency 'FirebaseCrashlytics'
  s.dependency 'FirebaseRemoteConfig'
  s.dependency 'libwebp', '1.5.0'
end
