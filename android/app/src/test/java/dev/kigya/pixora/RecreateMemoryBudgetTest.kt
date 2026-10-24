package dev.kigya.pixora

import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class RecreateMemoryBudgetTest {
    @Test fun acceptsCalibrationBudgetsWithoutChangingProductionDefault() {
        RecreateMemoryBudget.limitMiB = 512
        assertEquals(512, RecreateMemoryBudget.limitMiB)
        RecreateMemoryBudget.limitMiB = 768
        assertEquals(768, RecreateMemoryBudget.limitMiB)
        RecreateMemoryBudget.limitMiB = 1024
        assertEquals(1024, RecreateMemoryBudget.limitMiB)
        RecreateMemoryBudget.limitMiB = 512
    }

    @Test fun sdkBudgetsNeverWeakenMeasuredAvailableMemoryGuard() {
        for (budget in listOf(512, 768, 1024)) {
            RecreateMemoryBudget.limitMiB = budget
            for (available in listOf(-1L, budget.toLong() * 1024 * 1024, 2L * 1024 * 1024 * 1024 - 1)) {
                try {
                    RecreateMemoryBudget.requireHeadroom(available)
                    fail("Expected LOW_MEMORY below measured headroom")
                } catch (failure: AppFailure) { assertEquals("LOW_MEMORY", failure.code) }
            }
            RecreateMemoryBudget.requireHeadroom(2L * 1024 * 1024 * 1024)
            RecreateMemoryBudget.requireHeadroom(3L * 1024 * 1024 * 1024)
        }
        RecreateMemoryBudget.limitMiB = 512
    }

    @Test fun rejectsValuesOutsideTheCalibratedProfiles() {
        for (invalid in listOf(0, 511, 640, 1536)) {
            try {
                RecreateMemoryBudget.limitMiB = invalid
                fail("Expected $invalid MiB to be rejected")
            } catch (_: IllegalArgumentException) {
                assertEquals(512, RecreateMemoryBudget.limitMiB)
            }
        }
    }
}
