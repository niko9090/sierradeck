package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

class CaratteriInteriTest {
    private val razzo = "🚀"

    @Test
    fun `un emoji tagliato a meta al 200esimo carattere se ne va, il resto resta l inizio dell opzione`() {
        val tagliata = ("a".repeat(199) + razzo + " e altro").substring(0, 200)
        assertEquals("a".repeat(199), senzaMezziCaratteri(tagliata))
    }

    @Test
    fun `gli emoji interi e i testi normali non cambiano`() {
        assertEquals("ok $razzo fatto", senzaMezziCaratteri("ok $razzo fatto"))
        assertEquals("Sì, consenti", senzaMezziCaratteri("Sì, consenti"))
    }

    @Test
    fun `una meta bassa sola all inizio se ne va anche lei`() {
        assertEquals("ciao", senzaMezziCaratteri("\uDE80ciao"))
    }
}
