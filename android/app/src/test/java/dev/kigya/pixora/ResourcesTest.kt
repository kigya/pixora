package dev.kigya.pixora

import org.junit.Assert.*
import org.junit.Test
import java.io.Closeable
import java.io.IOException

class ResourcesTest {
    @Test fun closesExactlyOnceAndPreservesThePrimaryFailure() {
        for(readFailure in listOf(false,true))for(closeFailure in listOf(false,true)) {
            val read=IOException("read");val close=IOException("close");var closed=0
            val resource=Closeable{closed++;if(closeFailure)throw close}
            try {assertEquals(42,withClosed(resource){if(readFailure)throw read;42});assertFalse(readFailure||closeFailure)}
            catch(error:IOException){assertSame(if(readFailure)read else close,error);assertEquals(if(readFailure&&closeFailure)listOf(close) else emptyList<Throwable>(),error.suppressed.toList())}
            assertEquals(1,closed)
        }
    }
}
