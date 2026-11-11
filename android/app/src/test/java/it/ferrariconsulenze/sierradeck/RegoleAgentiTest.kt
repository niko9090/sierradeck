package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import it.ferrariconsulenze.sierradeck.nucleo.Specialista
import it.ferrariconsulenze.sierradeck.nucleo.aspettaTe
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.tema.Attivita
import it.ferrariconsulenze.sierradeck.schermate.tema.argb
import it.ferrariconsulenze.sierradeck.nucleo.RigaAlLavoro

/** PC 0.82.0: il colore fisso di cosa fa una chat e la riga di ogni agente, come sul PC e nella pagina. */
class RegoleAgentiTest {
    @Test
    fun `otto attività, ognuna con colore e simbolo suoi`() {
        assertEquals(listOf("sviluppo", "interfaccia", "collaudo", "revisione", "rilascio", "aspetta", "ferma", "finita"), TabellaAttivita.ordine)
        val att = TabellaAttivita.ordine.map { TabellaAttivita.attivita.getValue(it) }
        assertEquals(8, att.map { TabellaAttivita.colori.getValue(it.colore) }.toSet().size)
        assertEquals(8, att.map { it.icona }.toSet().size)
        assertNotEquals(TabellaAttivita.attivita.getValue("revisione").colore, TabellaAttivita.attivita.getValue("aspetta").colore)
    }

    @Test
    fun `un colore sconosciuto resta grigio`() {
        assertEquals(TabellaAttivita.colori.getValue("quieto"), Attivita.argb("arcobaleno"))
        assertEquals(TabellaAttivita.colori.getValue("quieto"), Attivita.argb(null))
    }
}
