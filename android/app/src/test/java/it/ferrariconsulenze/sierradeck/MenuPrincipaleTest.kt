package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.io.File

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
        assertEquals(listOf("progetti", "autopiloti", "domande", "chat", "file", "salute", "impostazioni"), Scheda.entries.map { it.id })
    }

    @Test
    fun `con gli stessi nomi corti della pagina (i trattini morbidi vanno a capo pulito)`() {
        assertEquals(voci.map { it["breve"]!!.jsonPrimitive.content }, Scheda.entries.map { it.breve })
        assertEquals("Imposta\u00adzioni", Scheda.IMPOSTAZIONI.breve)
    }

    @Test
    fun `le voci di prima non ci sono piu`() {
        val nomi = Scheda.entries.map { it.name }
        for (via in listOf("LAVORI", "NEGOZIO", "COMPUTER")) assertFalse(via, via in nomi)
        // Dalla 2.83.0 la barra ha quattro voci (`NavigazioneTest`); le sette restano destinazioni.
    }
}
