import Foundation
import XcodeProj
import PathKit
let path = Path(CommandLine.arguments[1])
let project = try XcodeProj(path: path)
for file in project.pbxproj.fileReferences where file.path == "Pixora/AppDelegate.swift" {
 file.path = "Pixora/AppDelegate.mm"; file.name = "AppDelegate.mm"; file.lastKnownFileType = "sourcecode.cpp.objcpp"
}
for target in project.pbxproj.nativeTargets {
 if target.name == "PixoraTests" {
  for config in target.buildConfigurationList?.buildConfigurations ?? [] {config.buildSettings["PRODUCT_BUNDLE_IDENTIFIER"]="dev.kigya.pixora.tests"}
  target.buildPhases.removeAll(where: {($0 as? PBXShellScriptBuildPhase)?.name == "Pixora Firebase config"})
  continue
 }
 guard target.name == "Pixora" else {continue}
 for phase in target.buildPhases.compactMap({$0 as? PBXShellScriptBuildPhase}) where phase.name?.contains("Crashlytics") == true {
  let guardLine = "if [ \"${CODE_SIGNING_ALLOWED:-YES}\" = NO ]; then echo 'Unsigned verification: dSYM upload deferred to release handoff'; exit 0; fi\n"
  if !(phase.shellScript ?? "").contains("Unsigned verification: dSYM upload deferred") {phase.shellScript = guardLine + (phase.shellScript ?? "")}
 }
 for phase in target.buildPhases.compactMap({$0 as? PBXResourcesBuildPhase}) {
  phase.files?.removeAll(where: {$0.file?.path?.contains("LaunchScreen.storyboard") == true})
 }
 for config in target.buildConfigurationList?.buildConfigurations ?? [] {
  config.buildSettings["PIXORA_APP_INFO_PLIST"] = "Pixora/Info.plist"
  config.buildSettings["INFOPLIST_FILE"] = "$(PIXORA_APP_INFO_PLIST)"
  config.buildSettings["PRODUCT_BUNDLE_IDENTIFIER"] = config.name == "Debug" ? "dev.kigya.pixora.debug" : "dev.kigya.pixora"
  config.buildSettings["CURRENT_PROJECT_VERSION"] = "10"
  config.buildSettings["MARKETING_VERSION"] = "0.8.0"
  config.buildSettings["ENABLE_USER_SCRIPT_SANDBOXING"] = "NO"
  config.buildSettings["DEBUG_INFORMATION_FORMAT"] = "dwarf-with-dsym"
 }
 if !target.buildPhases.contains(where: {($0 as? PBXShellScriptBuildPhase)?.name == "Pixora Firebase config"}) {
  let phase = PBXShellScriptBuildPhase(name: "Pixora Firebase config", shellPath: "/bin/sh", shellScript: "set -eu\n/bin/mkdir -p \"$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH\"\n/bin/cp \"$SRCROOT/Config/$CONFIGURATION/GoogleService-Info.plist\" \"$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/GoogleService-Info.plist\"\n")
  project.pbxproj.add(object: phase)
  target.buildPhases.append(phase)
 }
}
if !project.pbxproj.nativeTargets.contains(where: {$0.name == "PixoraTests"}) {
 let app = project.pbxproj.nativeTargets.first(where: {$0.name == "Pixora"})!
 let product = PBXFileReference(sourceTree: .buildProductsDir, explicitFileType: "wrapper.cfbundle", path: "PixoraTests.xctest", includeInIndex: false)
 project.pbxproj.add(object: product)
 project.pbxproj.rootObject?.productsGroup?.children.append(product)
 let sources = PBXSourcesBuildPhase()
 let frameworks = PBXFrameworksBuildPhase()
 project.pbxproj.add(object: sources); project.pbxproj.add(object: frameworks)
 let configurations = ["Debug", "Release"].map { name -> XCBuildConfiguration in
  let config = XCBuildConfiguration(name: name, buildSettings: [
    "PRODUCT_BUNDLE_IDENTIFIER":"dev.kigya.pixora.tests", "PRODUCT_NAME":"PixoraTests",
    "GENERATE_INFOPLIST_FILE":"YES", "IPHONEOS_DEPLOYMENT_TARGET":"15.1",
    "CLANG_ENABLE_OBJC_ARC":"YES", "CLANG_CXX_LANGUAGE_STANDARD":"c++20",
    "BUNDLE_LOADER":"$(TEST_HOST)", "TEST_HOST":"$(BUILT_PRODUCTS_DIR)/Pixora.app/Pixora",
    "HEADER_SEARCH_PATHS":"$(inherited) $(SRCROOT)/../native/engine $(SRCROOT)/../native/recommendation/include",
    "LD_RUNPATH_SEARCH_PATHS":"$(inherited) @executable_path/Frameworks @loader_path/Frameworks",
    "TARGETED_DEVICE_FAMILY":"1,2", "OTHER_LDFLAGS":"$(inherited) -framework XCTest"])
  project.pbxproj.add(object: config); return config
 }
 let list = XCConfigurationList(buildConfigurations: configurations, defaultConfigurationName: "Debug")
 project.pbxproj.add(object: list)
 let tests = PBXNativeTarget(name: "PixoraTests", buildConfigurationList: list, buildPhases: [sources,frameworks], productName: "PixoraTests", product: product, productType: .unitTestBundle)
 project.pbxproj.add(object: tests)
 let group = PBXFileSystemSynchronizedRootGroup(sourceTree: .group, path: "Tests")
 project.pbxproj.add(object: group)
 project.pbxproj.rootObject?.mainGroup.children.append(group)
 tests.fileSystemSynchronizedGroups = [group]
 project.pbxproj.rootObject?.targets.append(tests)
 _ = try tests.addDependency(target: app)
 project.pbxproj.objectVersion = 77
}
let schemePath = path + "xcshareddata/xcschemes/Pixora.xcscheme"
let scheme = try XCScheme(path: schemePath)
let tests = project.pbxproj.nativeTargets.first(where: {$0.name == "PixoraTests"})!
let reference = XCScheme.BuildableReference(referencedContainer: "container:Pixora.xcodeproj", blueprint: tests, buildableName: "PixoraTests.xctest", blueprintName: "PixoraTests")
scheme.testAction?.testables = [.init(skipped: false, parallelization: .none, buildableReference: reference)]
scheme.testAction?.codeCoverageEnabled = true
try project.write(path: path)
try scheme.write(path: schemePath, override: true)
