package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** PC 0.70: «Aspettano te» di partenza; le chat che hanno finito il turno in «Tutte». */
class AspettaTeTest {
    @Test
    fun `il tipo del PC decide, e senza tipo si guarda chiede`() {
        assertFalse(aspettaTe(Conversazione(chiave = "a", vista = StatoVistaDrive("finito", "ha finito", "quieto"))))
        assertTrue(aspettaTe(Conversazione(chiave = "b", vista = StatoVistaDrive("permesso", "permesso", "rosso"))))
        assertTrue(aspettaTe(Conversazione(chiave = "c", chiede = true)))
        assertFalse(aspettaTe(Conversazione(chiave = "d")))
        assertTrue(aspettaTe(Conversazione(chiave = "e", tipo = "autopilota")))
    }

    @Test
    fun `PC 0_73_1 - le risposte date dall'autopilota non contano nel numero`() {
        val risposta = StatoVistaDrive("risposta", "risposta dall’autopilota", "blu")
        val tutte = listOf(
            Conversazione(chiave = "r1", tipo = "autopilota", vista = risposta),
            Conversazione(chiave = "r2", tipo = "autopilota", vista = risposta),
            Conversazione(chiave = "f", vista = StatoVistaDrive("finito", "ha finito", "quieto"))
        )
        assertEquals(2, tutte.count { aspettaTe(it) })
        assertEquals(0, contaAspettanoTe(tutte))
        assertEquals(1, contaAspettanoTe(tutte + Conversazione(chiave = "d", vista = StatoVistaDrive("domanda", "domanda", "ambra"))))
        // PC vecchio, senza tipo: conta chi chiede.
        assertEquals(1, contaAspettanoTe(listOf(Conversazione(chiave = "x", chiede = true), Conversazione(chiave = "y", tipo = "autopilota"))))
    }
}
