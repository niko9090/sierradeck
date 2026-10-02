package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 0.39.3: il Drive del computer scollegato si vede anche dal telefono, e le
 * chat di altri PC nelle Domande hanno il segno «SU <PC>».
 */
class DriveScollegatoTest {

    @Test
    fun `lo stato porta la banda del Drive scollegato`() {
        val s = Api.json.decodeFromString(Stato.serializer(), """{"chat":[],"driveScollegato":{"titolo":"Drive scollegato da 9 giorni: gli altri PC non si vedono","testo":"Il 23/09 Google ha rifiutato l’autorizzazione (invalid_grant).","giorni":9},"campoNuovo":1}""")
        val a = s.driveScollegato!!
        assertEquals(9, a.giorni)
        assertTrue(a.titolo.startsWith("Drive scollegato da 9 giorni"))
        assertTrue(testoDriveScollegato(a).contains("invalid_grant"))
        assertTrue(testoDriveScollegato(a).contains("Account → Drive → «Collega»"))
    }

    @Test
    fun `con il Drive collegato non c'e' banda`() {
        assertNull(Api.json.decodeFromString(Stato.serializer(), """{"chat":[]}""").driveScollegato)
    }

    @Test
    fun `una chat di un altro PC ha il segno SU davanti, senza ripetere il nome`() {
        val c = Api.json.decodeFromString(Conversazione.serializer(), """{"chiave":"chat:pc:058be1ee679e:abc","tipo":"chat","titolo":"Trading · su LAPTOP-E60QM2D1","suPc":"LAPTOP-E60QM2D1"}""")
        assertEquals("SU LAPTOP-E60QM2D1 · Trading", titoloConSegno(c))
        val qui = Conversazione(chiave = "chat:1", titolo = "SierraDeck")
        assertEquals("SierraDeck", titoloConSegno(qui))
    }
}
