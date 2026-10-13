package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PC 0.71: il ruolo di ogni chat nell'albero dell'autopilota, come lo manda il PC. */
class RuoloChatTest {
    @Test
    fun `legge il ruolo, la revisione e l'ok`() {
        val n = Api.json.decodeFromString(NodoAlbero.serializer(), """{"id":"c-2","tipo":"chat","titolo":"Rivedi","stato":"lavoro","parola":"al lavoro","cicli":1,"figli":[],"ruolo":{"id":"revisione","nome":"Revisione","parola":"revisione","colore":"ambra"},"revisioneDi":"c-1"}""")
        assertEquals("revisione", n.ruolo?.parola)
        assertEquals("c-1", n.revisioneDi)
        val a = Api.json.decodeFromString(NodoAlbero.serializer(), """{"id":"c-1","stato":"finita","ruolo":{"id":"sviluppo","parola":"sviluppo","colore":"blu"},"approvata":true}""")
        assertTrue(a.approvata)
    }

    @Test
    fun `un PC di prima non manda il ruolo`() {
        assertNull(Api.json.decodeFromString(NodoAlbero.serializer(), """{"id":"c-1","stato":"lavoro"}""").ruolo)
    }
}
