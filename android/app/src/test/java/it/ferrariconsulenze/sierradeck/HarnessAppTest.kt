package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * L'autopilota «harness» e le Domande come conversazione, lato app (0.36.0).
 * Il rapporto e' in `.sierradeck/quaderno/2026-09-30-autopilota-harness.md`.
 */
class HarnessAppTest {

    @Test
    fun `si risponde dalla stessa rotta del PC e della pagina`() {
        assertEquals(
            "/api/rispondi" to mapOf("domanda" to "d1", "risposta" to "blu"),
            richiestaRisposta(ViaRisposta(via = "rispondi", domanda = "d1"), "blu")
        )
        assertEquals(
            "/api/scrivi" to mapOf("chat" to "c1", "testo" to "vai"),
            richiestaRisposta(ViaRisposta(via = "scrivi", chat = "c1"), "vai")
        )
        assertEquals("/api/autopilota/dialogo", richiestaRisposta(ViaRisposta(via = "dialogo", autopilota = "a1"), "ciao").first)
    }

    @Test
    fun `le conversazioni arrivano dal computer con messaggi e opzioni`() {
        val d = Api.json.decodeFromString(Domande.serializer(), """
            {"voci":[{"tipo":"scelta","chat":"p-1"}],
             "conversazioni":[{"chiave":"chat:p-1","tipo":"chat","titolo":"Permesso","sotto":"D:/q","chiede":true,
               "messaggi":[{"da":"tu","testo":"fai piano"},{"da":"lui","testo":"Posso scrivere?","tono":"domanda","opzioni":[{"numero":1,"testo":"Yes","scelta":true}]}],
               "risposta":{"via":"scrivi","chat":"p-1"},"scelte":{"chat":"p-1","opzioni":[{"numero":1,"testo":"Yes","scelta":true}]},
               "segnaposto":"Tocca un'opzione"}]}
        """.trimIndent())
        val c = d.conversazioni.single()
        assertEquals("chat:p-1", c.chiave)
        assertEquals(listOf("tu", "lui"), c.messaggi.map { it.da })
        assertEquals("Yes", c.messaggi[1].opzioni?.single()?.testo)
        assertEquals("p-1", c.scelte?.chat)
        assertEquals("/api/scrivi", richiestaRisposta(c.risposta, "x").first)
    }

    @Test
    fun `un computer vecchio senza conversazioni lascia la vista di prima`() {
        val d = Api.json.decodeFromString(Domande.serializer(), """{"voci":[]}""")
        assertTrue(d.conversazioni.isEmpty())
    }

    @Test
    fun `il dettaglio dell autopilota porta l albero delle sue chat`() {
        val a = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","nome":"Sito","ramoBase":"main","pubblicazione":"beta",
             "albero":{"id":"ap-1","tipo":"coordinatore","titolo":"Sito","stato":"lavoro","parola":"coordina","cicli":3,
               "figli":[{"id":"c-1","tipo":"chat","titolo":"le API","stato":"pausa","parola":"in pausa per i limiti del piano","ramo":"ap/ap-1/c-1","cicli":2}]}}
        """.trimIndent())
        assertEquals("main", a.ramoBase)
        assertEquals("beta", a.pubblicazione)
        val f = a.albero!!.figli.single()
        assertEquals("ap/ap-1/c-1", f.ramo)
        assertEquals("in pausa per i limiti del piano", f.parola)
    }

    @Test
    fun `la chat con l autopilota e le conversazioni si copiano (tocco lungo)`() {
        // Il difetto del 30/09: senza SelectionContainer un Text di Compose non
        // si seleziona. La prova guarda il sorgente: la vista dipende da Compose.
        val sorgenti = File("src/main/java/it/ferrariconsulenze/sierradeck")
        val lavori = File(sorgenti, "Lavori.kt").readText()
        val pezzo = lavori.substring(lavori.indexOf("items(chat) { b ->")).take(700)
        assertTrue(pezzo.contains("SelectionContainer"))
        assertTrue(File(sorgenti, "Conversazioni.kt").readText().contains("SelectionContainer { Text(m.testo"))
    }
}
