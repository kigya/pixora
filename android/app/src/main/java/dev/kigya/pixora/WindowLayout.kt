package dev.kigya.pixora
import android.app.Activity
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import androidx.window.layout.FoldingFeature
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
object WindowLayout {
 @Volatile var value=JSONObject().put("x",0).put("y",0).put("width",0).put("height",0).put("separating",false)
  private set
 val listeners=CopyOnWriteArraySet<(JSONObject)->Unit>()
 fun publish(info:WindowLayoutInfo,activity:Activity){
  val fold=info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull{it.isSeparating || it.occlusionType==FoldingFeature.OcclusionType.FULL}
  val d=activity.resources.displayMetrics.density
  value=JSONObject().put("x",(fold?.bounds?.left?:0)/d).put("y",(fold?.bounds?.top?:0)/d).put("width",(fold?.bounds?.width()?:0)/d).put("height",(fold?.bounds?.height()?:0)/d).put("separating",fold!=null)
  listeners.forEach{it(JSONObject(value.toString()))}
 }
}
