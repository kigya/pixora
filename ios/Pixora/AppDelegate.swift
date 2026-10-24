import Expo
import React
import ReactAppDependencyProvider
import FirebaseCore
import FirebaseAnalytics
import FirebaseCrashlytics
import UIKit

@main
@objc(PixoraAppDelegate)
class PixoraAppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  private var reactNativeDelegate: ExpoReactNativeFactoryDelegate?

  override func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    if FirebaseApp.app() == nil { FirebaseApp.configure() }
    let preferences = UserDefaults.standard
    let explicit = preferences.integer(forKey: "consentVersion") == 2
    let analytics = !explicit || preferences.bool(forKey: "analyticsConsent")
    let crashes = !explicit || preferences.bool(forKey: "crashConsent")
    Analytics.setAnalyticsCollectionEnabled(analytics)
    Analytics.setConsent([.analyticsStorage: analytics ? .granted : .denied, .adStorage: .denied, .adUserData: .denied, .adPersonalization: .denied])
    Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(crashes)
    if !crashes { Crashlytics.crashlytics().deleteUnsentReports() }
    let delegate = PixoraReactDelegate()
    delegate.dependencyProvider = RCTAppDependencyProvider()
    reactNativeDelegate = delegate
    reactNativeFactory = ExpoReactNativeFactory(delegate: delegate)
    return super.application(application, didFinishLaunchingWithOptions: options)
  }
}

private class PixoraReactDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? { bridge.bundleURL ?? bundleURL() }
  override func bundleURL() -> URL? {
#if DEBUG
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle") ?? RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

@objc(PixoraSceneDelegate)
class PixoraSceneDelegate: ExpoAppSceneDelegate {
  private var startupObserver: NSObjectProtocol?
  private var startupOverlay: UIView?
  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    super.scene(scene, willConnectTo: session, options: options)
    guard let window else { return }
    let theme = UserDefaults.standard.string(forKey: "theme")
    window.overrideUserInterfaceStyle = theme == "dark" ? .dark : theme == "light" ? .light : .unspecified
    window.backgroundColor = UIColor(named: "LaunchBackground")
    let probe = PixoraLayoutProbe(frame: window.bounds)
    probe.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    probe.isUserInteractionEnabled = false
    probe.accessibilityElementsHidden = true
    window.addSubview(probe)
    // The first JS Aurora frame owns readiness + the minimum 1500 ms choreography.
    let overlay = UIView(frame: window.bounds)
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.backgroundColor = UIColor(named: "LaunchBackground")
    let icon = UIImageView(image: UIImage(named: "Splash"))
    icon.contentMode = .scaleAspectFit
    icon.translatesAutoresizingMaskIntoConstraints = false
    overlay.addSubview(icon)
    NSLayoutConstraint.activate([icon.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),icon.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),icon.widthAnchor.constraint(equalToConstant: 108),icon.heightAnchor.constraint(equalToConstant: 108)])
    window.addSubview(overlay)
    startupOverlay = overlay
    startupObserver = NotificationCenter.default.addObserver(forName: Notification.Name("PixoraStartupFinished"), object: nil, queue: .main) { [weak self] _ in
      self?.startupOverlay?.removeFromSuperview()
      self?.startupOverlay = nil
      if let observer = self?.startupObserver { NotificationCenter.default.removeObserver(observer) }
      self?.startupObserver = nil
    }
  }
  override func sceneDidDisconnect(_ scene: UIScene) {
    if let startupObserver { NotificationCenter.default.removeObserver(startupObserver) }
    startupObserver = nil
    startupOverlay = nil
    super.sceneDidDisconnect(scene)
  }
}
private class PixoraLayoutProbe: UIView {
  private var lastBounds = CGRect.zero
  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds != lastBounds { lastBounds = bounds; NotificationCenter.default.post(name: Notification.Name("PixoraWindowLayoutChanged"), object: window) }
  }
}
