package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.io.File
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.nucleo.MenuApp
import it.ferrariconsulenze.sierradeck.schermate.radice.Scheda
import it.ferrariconsulenze.sierradeck.schermate.radice.SezioneAltro
import org.junit.Assert.assertNull

/**
 * Il menu principale (app 2.61.0, PC 0.61.0): le sette voci del PC e della
 * pagina, che dalla 2.83.0 sono le destinazioni dentro le quattro voci della barra, nello stesso ordine e con gli stessi nomi
 * corti. Le voci le scrive il PC in `assets/menu.json`
 * (`tests/shared/menu-principale.test.ts`).
 */
class MenuPrincipaleTest {
    private val voci = Api.json.parseToJsonElement(File("src/main/assets/menu.json").readText()).jsonObject["voci"]!!.jsonArray.map { it.jsonObject }

    @Test
    fun `la fascia ha le voci del PC, nello stesso ordine`() {
        assertEquals(voci.map { it["id"]!!.jsonPrimitive.content }, Scheda.entries.map { it.id })
        assertEquals(listOf("progetti", "autopiloti", "domande", "chat", "computer", "file", "salute", "impostazioni"), Scheda.entries.map { it.id })
    }

    @Test
    fun `i nomi corti li da il json, con i trattini morbidi`() {
        val menu = MenuApp.da(File("src/main/assets/menu.json").readText())
        assertEquals(voci.map { it["breve"]!!.jsonPrimitive.content }, Scheda.entries.map { menu.breve(it.id) })
        assertEquals("Imposta\u00adzioni", menu.breve("impostazioni"))
    }

    @Test
    fun `i titoli di Altro vengono dal json, e Correzioni sul telefono non c'e`() {
        val menu = MenuApp.da(File("src/main/assets/menu.json").readText())
        assertEquals("Aggiornamenti", SezioneAltro.AGGIORNAMENTI.titolo(menu))
        assertEquals("Info e aiuto", SezioneAltro.INFO.titolo(menu))
        assertEquals("Salute", SezioneAltro.SALUTE.titolo(menu))
        assertEquals("Tutte le chat", SezioneAltro.CHAT.titolo(menu))
        assertEquals(listOf("Da sistemare", "Consumi"), menu.voce("salute")!!.sotto.map { it.nome })
        assertNull(menu.voce("correzioni"))
    }

    @Test
    fun `le voci di prima non ci sono piu`() {
        val nomi = Scheda.entries.map { it.name }
        for (via in listOf("LAVORI", "NEGOZIO", "SPECIALISTI", "RETE")) assertFalse(via, via in nomi)
        // Dalla 2.83.0 la barra ha quattro voci (`NavigazioneTest`); le sette restano destinazioni.
    }
}
