Pod::Spec.new do |s|
  s.name = 'PixoraNative'
  s.version = '0.8.0'
  s.summary = 'Pixora offline ncnn CPU engine and iOS platform adapter'
  s.homepage = 'https://github.com/kigya/pixora'
  s.license = { :type => 'Proprietary' }
  s.author = 'Pixora'
  s.source = { :git => 'https://github.com/kigya/pixora.git', :tag => s.version }
  s.platform = :ios, '15.1'
  s.source_files = 'ios/Native/*.{h,mm}', 'native/engine/*.{h,cpp}', 'native/recommendation/**/*.{h,cpp}'
  s.public_header_files = 'ios/Native/PixoraUpscale.h'
  s.header_mappings_dir = 'ios/Native'
  s.vendored_frameworks = 'ios/Vendor/ncnn.xcframework'
  s.resource_bundles = { 'PixoraAssets' => ['android/app/src/main/assets/models/*', 'android/app/src/main/assets/model-manifest.json', 'android/app/src/main/assets/LEGAL.txt', 'src/locales/*.json', 'ios/Resources/LEGAL-ios.txt'] }
  s.frameworks = 'UIKit', 'ImageIO', 'PhotosUI', 'UserNotifications', 'StoreKit', 'UniformTypeIdentifiers', 'CoreImage'
  s.libraries = 'c++', 'z'
  s.pod_target_xcconfig = { 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20', 'GCC_ENABLE_CPP_RTTI' => 'YES', 'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/native/engine" "$(PODS_TARGET_SRCROOT)/native/recommendation/include"', 'DEFINES_MODULE' => 'YES' }
  s.user_target_xcconfig = { 'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_ROOT)/../build/generated/ios/ReactCodegen"' }
  s.dependency 'React-Core'
  s.dependency 'ReactCodegen'
  s.dependency 'FirebaseAnalytics/Core'
  s.dependency 'FirebaseCrashlytics'
  s.dependency 'FirebaseRemoteConfig'
  s.dependency 'libwebp', '1.5.0'
end
