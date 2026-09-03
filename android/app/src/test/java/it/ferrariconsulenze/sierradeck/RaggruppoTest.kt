package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il tab Chat mostra tutte le chat del computer, raggruppate per workspace:
 * prima quello davanti, poi gli altri; dentro ogni gruppo prima le vive, poi
 * quelle salvate che si riaprono con un tocco.
 */
class RaggruppoTest {
    private val ws = Workspace(
        nomi = listOf("lavoro", "casa", "nas"),
        attivo = "casa",
        chat = listOf(
            ChatSalvata(workspace = "lavoro", sessione = "u1", cwd = "C:\\l", titolo = "una"),
            ChatSalvata(workspace = "lavoro", sessione = "u2", cwd = "C:\\l", titolo = "due"),
            ChatSalvata(workspace = "casa", sessione = "u3", cwd = "C:\\c", titolo = "tre"),
        )
    )

    @Test
    fun `il workspace davanti viene per primo, poi gli altri nell ordine del computer`() {
        val gruppi = raggruppaChat(emptyList(), ws)
        assertEquals(listOf("casa", "lavoro", "nas"), gruppi.map { it.workspace })
        assertTrue(gruppi[0].attivo)
        assertEquals(listOf(false, false), gruppi.drop(1).map { it.attivo })
    }

    @Test
    fun `una chat viva sta nel suo workspace e non compare anche come salvata`() {
        val vive = listOf(Chat(id = "p-3", titolo = "tre (viva)", cwd = "C:\\c", sessione = "u3"))
        val gruppi = raggruppaChat(vive, ws)
        val casa = gruppi.first { it.workspace == "casa" }
        assertEquals(1, casa.voci.size)
        assertEquals("p-3", casa.voci[0].viva?.id)
        assertNull(casa.voci[0].salvata)
        val lavoro = gruppi.first { it.workspace == "lavoro" }
        assertEquals(listOf("u1", "u2"), lavoro.voci.map { it.salvata?.sessione })
    }

    @Test
    fun `una chat viva sconosciuta all archivio sta nel workspace davanti`() {
        val vive = listOf(Chat(id = "p-9", titolo = "nuova", cwd = "C:\\x", sessione = "u9"))
        val gruppi = raggruppaChat(vive, ws)
        assertEquals("p-9", gruppi.first { it.workspace == "casa" }.voci[0].viva?.id)
        assertTrue(gruppi.first { it.workspace == "nas" }.voci.isEmpty())
    }

    @Test
    fun `un computer vecchio senza workspace mostra le sole chat vive come prima`() {
        val vive = listOf(Chat(id = "p-1", titolo = "sola"))
        val gruppi = raggruppaChat(vive, Workspace())
        assertEquals(1, gruppi.size)
        assertEquals(1, gruppi[0].voci.size)
        assertTrue(raggruppaChat(emptyList(), Workspace()).isEmpty())
    }

    @Test
    fun `le chiavi delle voci sono uniche anche fra vive e salvate`() {
        val vive = listOf(Chat(id = "u1", titolo = "id uguale alla sessione", sessione = "u7"))
        val chiavi = raggruppaChat(vive, ws).flatMap { it.voci }.map { it.chiave }
        assertEquals(chiavi.size, chiavi.toSet().size)
    }

    @Test
    fun `lo stato del computer si legge anche con le chat dei workspace`() {
        val json = Json { ignoreUnknownKeys = true }
        val stato = json.decodeFromString<Stato>(
            """{"chat":[],"workspace":{"nomi":["a"],"attivo":"a","chat":[{"workspace":"a","sessione":"s","cwd":"C:\\a","titolo":"t","ibernata":true}]}}"""
        )
        assertEquals("s", stato.workspace.chat[0].sessione)
        assertTrue(stato.workspace.chat[0].ibernata)
        // E senza, come lo manda un computer con una versione precedente.
        val vecchio = json.decodeFromString<Stato>("""{"chat":[],"workspace":{"nomi":["a"],"attivo":"a"}}""")
        assertTrue(vecchio.workspace.chat.isEmpty())
    }
}
