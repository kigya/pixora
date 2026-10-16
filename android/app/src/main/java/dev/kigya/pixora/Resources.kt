package dev.kigya.pixora

import java.io.Closeable

/** Non-null platform resources; preserves a read/write failure if close also fails. */
fun <T:Closeable,R> withClosed(resource:T,block:(T)->R):R {
    val result=try {block(resource)}
    catch(error:Throwable) {
        try {resource.close()}catch(closeError:Throwable){error.addSuppressed(closeError)}
        throw error
    }
    resource.close()
    return result
}
