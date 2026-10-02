package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * «Installa» dal telefono (0.39.0): prima le note di cosa cambia, le stesse del
 * PC, poi «Installa e riavvia» o «Più tardi».
 */
class NoteAggiornamentoTest {

    /** Come le manda il computer: blocchi e pezzi, gia' scomposti, mai HTML. */
    private val dalComputer = """
        {"versione":"0.39.0","installata":"0.38.1","fonte":"github","dove":"https://github.com/niko9090/sierradeck/releases",
         "note":[
           {"versione":"0.39.0","blocchi":[
             {"tipo":"elenco","voci":[
               [{"testo":"Installa apre le note.","grassetto":true},{"testo":" Prima vedi cosa cambia."}],
               [{"testo":"Vedi "},{"testo":"le versioni","link":"https://github.com/niko9090/sierradeck/releases"},{"testo":" e "},{"testo":"questo","link":"javascript:alert(1)"}]
             ]},
             {"tipo":"paragrafo","pezzi":[{"testo":"App Android 2.43.0."}]}
           ]},
           {"versione":"0.38.2","blocchi":[{"tipo":"titolo","pezzi":[{"testo":"Consegne"}]},{"tipo":"sconosciuto","pezzi":[{"testo":"x"}]}]}
         ],
         "campoNuovo":1}
    """.trimIndent()

    private val note = Api.json.decodeFromString(NoteAggiornamento.serializer(), dalComputer)

    @Test
    fun `le note arrivano intere, la nuova prima e poi le saltate`() {
        assertEquals("0.39.0", note.versione)
        assertEquals(listOf("0.39.0", "0.38.2"), note.note.map { it.versione })
        assertEquals("La nuova · 0.39.0", etichettaNota(note.note[0], 0, note.versione))
        assertEquals("Saltata · 0.38.2", etichettaNota(note.note[1], 1, note.versione))
        assertTrue(sottotitoloNote(note).contains("c’è la 0.38.1"))
        assertTrue(sottotitoloNote(note).contains("1 che aveva saltato"))
    }

    @Test
    fun `ogni voce d elenco e una riga, con il grassetto e senza asterischi`() {
        val righe = righeNote(note.note[0])
        assertEquals(listOf("voce", "voce", "paragrafo"), righe.map { it.tipo })
        assertTrue(righe[0].tratti[0].grassetto)
        assertEquals("Installa apre le note. Prima vedi cosa cambia.", righe[0].tratti.joinToString("") { it.testo })
        assertFalse(righe.any { r -> r.tratti.any { it.testo.contains("**") } })
        // Un blocco che l'app non conosce si salta, non rompe la finestra.
        assertEquals(listOf("titolo"), righeNote(note.note[1]).map { it.tipo })
    }

    @Test
    fun `solo i link a github com si aprono`() {
        val voce = righeNote(note.note[0])[1]
        assertEquals("https://github.com/niko9090/sierradeck/releases", voce.tratti.first { it.testo == "le versioni" }.link)
        assertNull(voce.tratti.first { it.testo == "questo" }.link)
        assertNull(linkAmmessoApp("http://github.com/x"))
        assertNull(linkAmmessoApp("https://github.com.cattivo.it/x"))
        assertNull(linkAmmessoApp("https://utente@github.com/x"))
        assertEquals("https://github.com/a", linkAmmessoApp(" https://github.com/a "))
    }

    @Test
    fun `senza note lo dice per esteso e lascia installare`() {
        val n = noteMancanti("HTTP 409")
        assertTrue(n.note.isEmpty())
        assertTrue(n.avviso!!.contains(PAGINA_VERSIONI))
        assertTrue(n.avviso!!.contains("Puoi installare lo stesso"))
        assertEquals("", sottotitoloNote(n))
    }
}
