package dev.kigya.pixora

import android.graphics.Bitmap
import kotlin.math.*

/** Row buffers bound memory independently of output height; alpha stays untouched. */
object PresetFinisher {
    fun apply(output:Bitmap,source:Bitmap,profile:String,cancelled:()->Boolean) {
        if(profile !in setOf("details","sharp","balanced"))return
        val width=output.width;val height=output.height
        val row=IntArray(width)
        if(profile=="balanced") {
            val base=Bitmap.createScaledBitmap(source,width,height,true)
            try {
                val original=IntArray(width)
                for(y in 0 until height) {
                    if(cancelled())throw AppFailure("CANCELLED")
                    output.getPixels(row,0,width,0,y,width,1);base.getPixels(original,0,width,0,y,width,1)
                    for(x in 0 until width) {
                        val c=row[x];val b=original[x];var blended=c and -0x1000000
                        for(channel in 0..2){val shift=16-channel*8;blended=blended or (((((c ushr shift) and 255)*.8+((b ushr shift) and 255)*.2).roundToInt()).coerceIn(0,255) shl shift)}
                        row[x]=blended
                    }
                    output.setPixels(row,0,width,0,y,width,1)
                }
            }finally{base.recycle()}
            return
        }
        val weights=DoubleArray(7){exp(-((it-3)*(it-3))/2.0)}.let{v->val sum=v.sum();v.map{it/sum}.toDoubleArray()}
        val sample=IntArray(width)
        fun luminance(c:Int)=.2126*((c ushr 16) and 255)+.7152*((c ushr 8) and 255)+.0722*(c and 255)
        fun horizontal(y:Int):DoubleArray {
            output.getPixels(sample,0,width,0,y.coerceIn(0,height-1),width,1)
            return DoubleArray(width){x->var sum=0.0;for(k in 0..6)sum+=luminance(sample[(x+k-3).coerceIn(0,width-1)])*weights[k];sum}
        }
        val ring=Array(7){horizontal(it-3)};val amount=if(profile=="sharp").35 else .15
        for(y in 0 until height) {
            if(cancelled())throw AppFailure("CANCELLED")
            output.getPixels(row,0,width,0,y,width,1)
            for(x in 0 until width) {
                val c=row[x];var blur=0.0;for(k in 0..6)blur+=ring[(y+k)%7][x]*weights[k]
                val difference=luminance(c)-blur
                if(abs(difference)>=3 && (c ushr 24)>0) {
                    val delta=difference*amount;var sharpened=c and -0x1000000
                    for(channel in 0..2){val shift=16-channel*8;sharpened=sharpened or ((((c ushr shift and 255)+delta).roundToInt().coerceIn(0,255)) shl shift)}
                    row[x]=sharpened
                }
            }
            // Read the next original row before overwriting this row.
            val next=if(y+1<height)horizontal(y+4) else null
            output.setPixels(row,0,width,0,y,width,1)
            if(next!=null)ring[y%7]=next
        }
    }
}
