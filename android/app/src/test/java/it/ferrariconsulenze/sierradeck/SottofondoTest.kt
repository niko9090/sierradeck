package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Ponte
import it.ferrariconsulenze.sierradeck.nucleo.StatoSottofondo

/**
 * Le chat in sottofondo (app 2.58.4, PC 0.58.4): il campo dice sempre cosa
 * succede, con le stesse parole del PC, e un rifiuto ha il suo perché.
 */
class SottofondoTest {

    @Test
    fun `le rotte passano dal ponte, come sul PC`() {
        assertTrue("/api/sottofondo/avvia" in Ponte.ROTTE)
        assertTrue("/api/sottofondo/stato" in Ponte.ROTTE)
    }
}
