package dev.kigya.pixora

import android.app.Activity
import android.app.Application
import android.graphics.Rect
import androidx.window.layout.DisplayFeature
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowLayoutInfo
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],application=Application::class)
class WindowLayoutTest {
    private class Fold(override val isSeparating:Boolean,override val occlusionType:FoldingFeature.OcclusionType):FoldingFeature {
        override val bounds=Rect(200,0,220,800)
        override val orientation=FoldingFeature.Orientation.VERTICAL
        override val state=FoldingFeature.State.HALF_OPENED
    }
    @Test fun foldedAndFlatWindowsPublishIndependentSnapshots() {
        val activity=Robolectric.buildActivity(Activity::class.java).setup().get()
        var deliveries=0
        val listener:(org.json.JSONObject)->Unit={deliveries++;it.put("width",-1)}
        WindowLayout.listeners.add(listener)
        try {
            val density=activity.resources.displayMetrics.density
            for(separating in listOf(true,false))for(full in listOf(true,false)) {
                WindowLayout.publish(WindowLayoutInfo(listOf(Fold(separating,if(full)FoldingFeature.OcclusionType.FULL else FoldingFeature.OcclusionType.NONE))),activity)
                assertEquals(separating || full,WindowLayout.value.getBoolean("separating"))
                assertEquals(if(separating || full)20.0/density else 0.0,WindowLayout.value.getDouble("width"),.001)
            }
            WindowLayout.publish(WindowLayoutInfo(listOf(object:DisplayFeature{override val bounds=Rect(0,0,100,100)})),activity)
            assertFalse(WindowLayout.value.getBoolean("separating"));assertEquals(0.0,WindowLayout.value.getDouble("height"),0.0)
            assertEquals(5,deliveries)
        } finally {WindowLayout.listeners.remove(listener);activity.finish()}
    }
}
