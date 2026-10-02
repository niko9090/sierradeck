package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** La linguetta «Istruzioni» (0.41.0): il testo intero, il Markdown senza HTML, l'esito in parole. */
class IstruzioniTest {
    @Test
    fun `le istruzioni arrivano dal computer con testo, perche ed esito`() {
        val j = """{"istruzioni":[{"id":"c-5@2026-10-02T12:00:00.000Z","quando":"2026-10-02T12:00:00.000Z","chatId":"ap1","chatTitolo":"Trading","testo":"# Compito\n- fai i test\n**subito**","perche":"i test non passano","esito":"partita","cosa":"scrivi","altro":1}]}"""
        val l = Api.json.decodeFromString(IstruzioniAutopilota.serializer(), j).istruzioni
        assertEquals("Trading", l[0].chatTitolo)
        assertEquals("i test non passano", l[0].perche)
        assertEquals("partita", esitoIstruzione(l[0].esito))
        assertEquals("mai arrivata", esitoIstruzione("persa"))
    }

    @Test
    fun `il markdown diventa righe con il loro tipo, mai HTML`() {
        val r = righeMarkdown("# Titolo\n\n- voce\n<script>x</script>\n```\ncodice\n```")
        assertEquals(listOf("titolo", "vuota", "voce", "testo", "codice"), r.map { it.tipo })
        assertEquals("<script>x</script>", r[3].testo)
        assertEquals("fai **subito** e `npm test`".replace("**", "").replace("`", ""), inRigaMd("fai **subito** e `npm test`").text)
    }

    @Test
    fun `la linguetta Istruzioni c'e' sempre, dopo le Domande`() {
        assertEquals("istruzioni", linguetteAutopilota(0).first())
        assertEquals(listOf("domande", "istruzioni"), linguetteAutopilota(1).take(2))
        assertTrue(altezzaLinguetta("istruzioni") > altezzaLinguetta("file"))
    }
}
