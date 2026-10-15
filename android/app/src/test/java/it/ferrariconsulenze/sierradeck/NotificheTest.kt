package it.ferrariconsulenze.sierradeck

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * App 2.74.0: solo notifiche utili. Nicholas, 15/10: «ne arrivano troppe e
 * senza alcuna rilevanza, devi ricevere solo notifiche utili».
 */
class NotificheTest {
    private val min = 60_000L
    private val t0 = 1_760_000_000_000L
    private fun giro(stato: String, gia: MutableSet<String>, adesso: Long, primo: Boolean = false) =
        Avvisi.daAnnunciare(JSONObject(stato), gia, primo, adesso, Notifiche.ATTESA_CHAT_MS)

    @Test
    fun `una chat che finisce un turno e riparte subito non avvisa`() {
        val gia = mutableSetOf<String>()
        val ferma = """{"chat":[{"id":"c1","titolo":"Trading","aspetta":true}],"autopiloti":[]}"""
        val lavora = """{"chat":[{"id":"c1","titolo":"Trading","aspetta":false}],"autopiloti":[]}"""
        // Dieci pause brevi in un'ora: zero notifiche (prima erano dieci).
        var adesso = t0
        repeat(10) {
            assertTrue(giro(ferma, gia, adesso).isEmpty())
            assertTrue(giro(ferma, gia, adesso + 2 * min).isEmpty())
            giro(lavora, gia, adesso + 3 * min)
            adesso += 6 * min
        }
    }

    @Test
    fun `una chat che aspetta te da tre minuti avvisa una volta, con da quanto`() {
        val gia = mutableSetOf<String>()
        val ferma = """{"chat":[{"id":"c1","titolo":"Trading","aspetta":true,"ultimaRiga":"Fatto, vuoi che pubblichi?"}],"autopiloti":[]}"""
        assertTrue(giro(ferma, gia, t0).isEmpty())
        val avvisi = giro(ferma, gia, t0 + 3 * min)
        assertEquals(1, avvisi.size)
        assertEquals("«Trading» aspetta te", avvisi[0].titolo)
        assertEquals("Da 3 min. Fatto, vuoi che pubblichi?", avvisi[0].testo)
        assertTrue(giro(ferma, gia, t0 + 30 * min).isEmpty())
    }

    @Test
    fun `una domanda e una scelta suonano subito`() {
        val gia = mutableSetOf<String>()
        val avvisi = giro("""{"domande":[{"id":"d1","testo":"Quale?"}],"chat":[{"id":"c2","chiede":true}],"autopiloti":[]}""", gia, t0)
        assertEquals(listOf("d:d1", "k:c2"), avvisi.map { it.chiave })
        assertTrue(avvisi.all { Notifiche.tipoDi(it.chiave) == TipoNotifica.DOMANDA })
    }

    @Test
    fun `una notifica sola per chat - la scelta e l'attesa della stessa chat si sostituiscono`() {
        val gia = mutableSetOf<String>()
        val scelta = giro("""{"chat":[{"id":"c1","chiede":true}],"autopiloti":[]}""", gia, t0).single()
        giro("""{"chat":[{"id":"c1","aspetta":false}],"autopiloti":[]}""", gia, t0 + min)
        giro("""{"chat":[{"id":"c1","aspetta":true}],"autopiloti":[]}""", gia, t0 + 2 * min)
        val attesa = giro("""{"chat":[{"id":"c1","aspetta":true}],"autopiloti":[]}""", gia, t0 + 6 * min).single()
        assertEquals(scelta.id, attesa.id)
    }

    @Test
    fun `una notifica sola per autopilota - fermo e poi finito si aggiornano`() {
        val gia = mutableSetOf<String>()
        val fermo = giro("""{"autopiloti":[{"id":"ap1","nome":"Notte","stato":"sospeso","motivo":"criterio rotto"}]}""", gia, t0).single()
        giro("""{"autopiloti":[{"id":"ap1","nome":"Notte","stato":"lavoro"}]}""", gia, t0 + min)
        val finito = giro("""{"autopiloti":[{"id":"ap1","nome":"Notte","stato":"finito"}]}""", gia, t0 + 2 * min).single()
        assertEquals(fermo.id, finito.id)
        assertEquals(TipoNotifica.FERMO, Notifiche.tipoDi(fermo.chiave))
        assertEquals(TipoNotifica.FINITO, Notifiche.tipoDi(finito.chiave))
    }

    @Test
    fun `una versione del computer pronta da installare avvisa una volta per versione`() {
        val gia = mutableSetOf<String>()
        val pronto = """{"aggiornamento":{"fase":"pronto","versione":"0.74.0"},"autopiloti":[]}"""
        val a = giro(pronto, gia, t0).single()
        assertEquals(TipoNotifica.VERSIONE, Notifiche.tipoDi(a.chiave))
        assertTrue(a.titolo.contains("0.74.0"))
        assertTrue(giro(pronto, gia, t0 + min).isEmpty())
        // Mentre cerca o scarica non è una notizia.
        assertTrue(giro("""{"aggiornamento":{"fase":"scarico","versione":"0.75.0"},"autopiloti":[]}""", gia, t0).isEmpty())
    }

    @Test
    fun `gli interruttori - spento un tipo, quel tipo tace, i file sono spenti di partenza`() {
        val avvisi = listOf(
            Avvisi.Avviso(chiave = "d:1", titolo = "", testo = "", id = 1),
            Avvisi.Avviso(chiave = "f:ap", titolo = "", testo = "", id = 2),
            Avvisi.Avviso(chiave = "s:ap", titolo = "", testo = "", id = 3)
        )
        assertEquals(3, Notifiche.filtra(avvisi, emptyMap()).size)
        assertEquals(listOf("d:1", "s:ap"), Notifiche.filtra(avvisi, mapOf("finito" to false)).map { it.chiave })
        assertFalse(Notifiche.suona(TipoNotifica.FILE, emptyMap()))
        assertTrue(Notifiche.suona(TipoNotifica.FILE, mapOf("file" to true)))
        assertTrue(TipoNotifica.values().filter { it != TipoNotifica.FILE }.all { Notifiche.suona(it, emptyMap()) })
    }

    @Test
    fun `il computer perso si dice dopo cinque minuti, il ritorno solo se era stato detto`() {
        var l = Notifiche.Linea()
        // Un ricollegamento di due minuti: niente, né all'andata né al ritorno.
        var r = Notifiche.linea(l, false, t0, "PC-ESEMPIO"); l = r.first; assertNull(r.second)
        r = Notifiche.linea(l, false, t0 + 2 * min, "PC-ESEMPIO"); l = r.first; assertNull(r.second)
        r = Notifiche.linea(l, true, t0 + 3 * min, "PC-ESEMPIO"); l = r.first; assertNull(r.second)
        // Perso davvero: dopo cinque minuti, una volta.
        r = Notifiche.linea(l, false, t0 + 10 * min, "PC-ESEMPIO"); l = r.first; assertNull(r.second)
        r = Notifiche.linea(l, false, t0 + 15 * min, "PC-ESEMPIO"); l = r.first
        val perso = r.second
        assertNotNull(perso)
        assertEquals("PC-ESEMPIO non si raggiunge", perso!!.titolo)
        assertEquals(TipoNotifica.COLLEGAMENTO, Notifiche.tipoDi(perso.chiave))
        r = Notifiche.linea(l, false, t0 + 40 * min, "PC-ESEMPIO"); l = r.first; assertNull(r.second)
        // Torna: lo stesso numero, quindi sostituisce il «perso».
        r = Notifiche.linea(l, true, t0 + 45 * min, "PC-ESEMPIO")
        assertEquals("PC-ESEMPIO è di nuovo raggiungibile", r.second?.titolo)
        assertEquals("Era irraggiungibile da 35 min.", r.second?.testo)
        assertEquals(perso.id, r.second?.id)
        assertEquals(Notifiche.Linea(), r.first)
    }

    @Test
    fun `le famiglie nuove non toccano le altre`() {
        val famiglie = listOf(Avvisi.ID_DOMANDA, Avvisi.ID_FINITO, Avvisi.ID_FERMO, Avvisi.ID_ASPETTA, Avvisi.ID_SCELTA, Avvisi.ID_PRONTO, Avvisi.ID_VERSIONE, Avvisi.ID_COLLEGAMENTO)
        assertEquals(famiglie.size, famiglie.toSet().size)
    }

    @Test
    fun `il segno dell'attesa non resta nel ricordo quando la chat sparisce`() {
        val gia = mutableSetOf<String>()
        giro("""{"chat":[{"id":"c1","aspetta":true}],"autopiloti":[]}""", gia, t0)
        assertTrue(gia.any { it.startsWith("t:c1:") })
        giro("""{"chat":[],"autopiloti":[]}""", gia, t0 + min)
        assertTrue(gia.none { it.startsWith("t:") })
    }
}
