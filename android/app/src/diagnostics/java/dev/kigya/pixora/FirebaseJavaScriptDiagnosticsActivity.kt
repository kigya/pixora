package dev.kigya.pixora
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
class FirebaseJavaScriptDiagnosticsActivity : ReactActivity() {
    override fun onCreate(state: Bundle?) { Telemetry.update(true,true,true); super.onCreate(state) }
    override fun getMainComponentName()="PixoraDiagnostics"
    override fun createReactActivityDelegate(): ReactActivityDelegate=DefaultReactActivityDelegate(this,mainComponentName)
}
