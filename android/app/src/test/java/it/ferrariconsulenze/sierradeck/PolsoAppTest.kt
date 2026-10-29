package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * «I PC girano lenti» (12/10): con l'app dietro lo stato si chiedeva ogni 15
 * secondi invece di 2. Dalla 2.86.0 dietro non si chiede più: avvisa la Sentinella.
 */
class PolsoAppTest {
    @Test
    fun `davanti sempre, dietro mai`() {
        assertTrue(PolsoApp.tocca(true))
        assertFalse(PolsoApp.tocca(false))
    }
}
