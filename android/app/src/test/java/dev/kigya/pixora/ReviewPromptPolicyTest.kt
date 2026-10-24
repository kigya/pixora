package dev.kigya.pixora

import android.app.Application
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ReviewPromptPolicyTest {
    private fun succeeded(jobId: String = "job") = JSONObject().put("jobId", jobId).put("state", "SUCCEEDED")

    @Test fun onlyOffersForCurrentSuccessfulUnshownJobAndUsesActualShownCooldown() {
        val now = 2_000_000L
        assertFalse(ReviewPromptPolicy.canOffer(succeeded(), "", emptySet(), 0L, now))
        assertFalse(ReviewPromptPolicy.canOffer(succeeded(), "other", emptySet(), 0L, now))
        assertFalse(ReviewPromptPolicy.canOffer(JSONObject().put("jobId", "job").put("state", "READY"), "job", emptySet(), 0L, now))
        assertFalse(ReviewPromptPolicy.canOffer(succeeded(), "job", setOf("job"), 0L, now))
        assertTrue(ReviewPromptPolicy.canOffer(succeeded(), "job", emptySet(), 0L, now))
        assertFalse(ReviewPromptPolicy.canOffer(succeeded(), "job", emptySet(), now - ReviewPromptPolicy.COOLDOWN_MS + 1L, now))
        assertTrue(ReviewPromptPolicy.canOffer(succeeded(), "job", emptySet(), now - ReviewPromptPolicy.COOLDOWN_MS, now))
        assertFalse(ReviewPromptPolicy.canOffer(succeeded(), "job", emptySet(), now + 1L, now))
    }

    @Test fun markingShownPersistsJobIdentityAndClockValueWithoutMutatingInput() {
        val original = setOf("previous")
        val (shown, timestamp) = ReviewPromptPolicy.markShown(original, "current", 42L)
        assertEquals(setOf("previous", "current"), shown)
        assertEquals(setOf("previous"), original)
        assertEquals(42L, timestamp)
        assertEquals(0L, ReviewPromptPolicy.markShown(emptySet(), "current", -2L).second)
    }

    @Test(expected = IllegalArgumentException::class)
    fun markingBlankJobIsRejected() {
        ReviewPromptPolicy.markShown(emptySet(), " ", 10L)
    }
}
