package dev.kigya.pixora

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.io.File

/** Test-only licensed inputs. Saves actual model outputs for visual review. */
@RunWith(AndroidJUnit4::class)
class QualityReviewTest {
    @Test fun actualModelsProcessPhotographIllustrationAndAlpha() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val ctx=instrumentation.targetContext
        val activity=instrumentation.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val output=File(ctx.getExternalFilesDir(null),"quality-review").apply{mkdirs()}
        SessionStore.init(ctx)
        try {
            for(name in listOf("landscape-256.jpg","scene-65x49.png","alpha.png")) {
                val source=File(ctx.cacheDir,name)
                instrumentation.context.assets.open("quality-review/$name").use{input->source.outputStream().use{input.copyTo(it)}}
                source.copyTo(File(output,"original-$name"),overwrite=true)
                for(mode in listOf("quality","fast")) {
                    val image=ImageFiles.import(ctx,Uri.fromFile(source));SessionStore.replace(image)
                    SessionStore.update{it.put("jobId","review-$mode").put("state","PREPARING").put("mode",mode).put("scale",4).put("startedAt",System.currentTimeMillis()).put("timings",JSONObject())}
                    ImageProcessor(ctx,{}, {false}).process()
                    val result=SessionStore.snapshot();assertEquals(result.toString(),"SUCCEEDED",result.getString("state"))
                    val bitmap=BitmapFactory.decodeFile(result.getString("resultPath"))
                    assertEquals(image.getInt("workWidth")*4,bitmap.width);assertEquals(image.getInt("workHeight")*4,bitmap.height)
                    if(name=="alpha.png")assertEquals(0,android.graphics.Color.alpha(bitmap.getPixel(0,0)))
                    bitmap.recycle()
                    File(result.getString("resultPath")).copyTo(File(output,"$mode-${name.substringBeforeLast('.')}.png"),overwrite=true)
                    println("Quality review $mode $name ${result.getString("backend")} OK")
                }
                source.delete()
            }
        } finally {instrumentation.runOnMainSync{activity.finish()}}
    }
}
