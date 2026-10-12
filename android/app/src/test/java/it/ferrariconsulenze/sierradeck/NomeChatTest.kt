package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/** PC 0.70: tre chat con lo stesso nome si distinguono anche sul telefono. */
class NomeChatTest {
    @Test
    fun `il nome distinto del PC, poi il titolo, poi la cartella`() {
        assertEquals("Lavoro #2", nomeChat(Chat(id = "a", titolo = "Lavoro", nome = "Lavoro #2")))
        assertEquals("Lavoro", nomeChat(Chat(id = "a", titolo = "Lavoro")))
        assertEquals("C:/Prova", nomeChat(Chat(id = "a", cwd = "C:/Prova")))
        // Dal JSON di un PC 0.70.
        val c = Api.json.decodeFromString(Chat.serializer(), """{"id":"x","titolo":"Lavoro","nome":"Lavoro #3"}""")
        assertEquals("Lavoro #3", nomeChat(c))
    }
}
