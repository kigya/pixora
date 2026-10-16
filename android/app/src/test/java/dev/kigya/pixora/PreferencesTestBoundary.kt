package dev.kigya.pixora

import android.content.SharedPreferences
import org.mockito.Answers
import org.mockito.Mockito

/** A failed disk write must neither persist values nor escape through a fluent editor method. */
internal fun rejectingPreferencesEditor(): SharedPreferences.Editor {
    val editor = Mockito.mock(SharedPreferences.Editor::class.java, Answers.RETURNS_SELF)
    Mockito.`when`(editor.commit()).thenReturn(false)
    return editor
}
