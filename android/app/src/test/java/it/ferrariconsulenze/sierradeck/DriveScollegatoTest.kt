package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
    fun `0_56_3 una riga breve che si chiude e torna solo con un problema nuovo`() {
        val s = Api.json.decodeFromString(Stato.serializer(), """{"chat":[],"driveScollegato":{"titolo":"Drive scollegato da oggi: gli altri PC non si vedono","testo":"Spiegazione intera","breve":"Google Drive scollegato da oggi: si sistema dal PC.","chiave":"2026-10-09T11:19:48.000Z"}}""")
        val a = s.driveScollegato!!
        assertEquals("Google Drive scollegato da oggi: si sistema dal PC.", rigaDriveScollegato(a))
        assertTrue(mostraAvvisoDrive(a, null))
        assertFalse(mostraAvvisoDrive(a, "2026-10-09T11:19:48.000Z"))
        assertTrue(mostraAvvisoDrive(a, "2026-09-23T10:51:47.607Z"))
        assertFalse(mostraAvvisoDrive(null, null))
    }

    @Test
    fun `un PC di prima della 0_56_3 senza breve né chiave mostra il titolo e non si chiude`() {
        val a = AvvisoDrive(titolo = "Drive scollegato da 9 giorni: gli altri PC non si vedono", testo = "x")
        assertEquals(a.titolo, rigaDriveScollegato(a))
        assertTrue(mostraAvvisoDrive(a, "qualunque"))
    }

    @Test
    fun `con il Drive collegato non c'e' banda`() {
        assertNull(Api.json.decodeFromString(Stato.serializer(), """{"chat":[]}""").driveScollegato)
    }

    @Test
    fun `una chat di un altro PC ha il segno SU davanti, senza ripetere il nome`() {
        val c = Api.json.decodeFromString(Conversazione.serializer(), """{"chiave":"chat:pc:pc-fisso-id:abc","tipo":"chat","titolo":"Trading · su PC-ESEMPIO","suPc":"PC-ESEMPIO"}""")
        assertEquals("SU PC-ESEMPIO · Trading", titoloConSegno(c))
        // La strada (0.40.0), quando il computer la sa.
        assertEquals("SU PC-ESEMPIO (WebRTC) · Trading", titoloConSegno(c.copy(viaPc = "WebRTC")))
        val qui = Conversazione(chiave = "chat:1", titolo = "SierraDeck")
        assertEquals("SierraDeck", titoloConSegno(qui))
    }
}
