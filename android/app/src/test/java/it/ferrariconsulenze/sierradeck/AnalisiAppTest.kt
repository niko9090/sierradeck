package it.ferrariconsulenze.sierradeck

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * I difetti trovati nell'analisi dell'app del 30/09/2026, con una prova
 * ciascuno (il rapporto è in `.sierradeck/quaderno/2026-09-30-analisi-app-android.md`).
 */
class AnalisiAppTest {

    private fun chat(id: String, chiede: Boolean = false, aspetta: Boolean = false, governata: Boolean = false, viva: Boolean = true, titolo: String = id) =
        Chat(id = id, titolo = titolo, chiede = chiede, aspetta = aspetta, governata = governata, viva = viva)

    // ── Lo stato di ogni chat, da lontano ────────────────────────────────

    @Test
    fun `una chat su una scelta aspetta che tu scelga, anche se la guida un autopilota`() {
        // L'autopilota non concede permessi al posto tuo: la chat resta ferma.
        assertEquals(TonoChat.SCEGLIE, leggiChat(chat("a", chiede = true, governata = true)).tono)
        assertEquals(TonoChat.SCEGLIE, leggiChat(chat("a", chiede = true, aspetta = true)).tono)
    }

    @Test
    fun `una chat che ha finito aspetta te, ma non se la guida un autopilota`() {
        assertEquals(TonoChat.ASPETTA, leggiChat(chat("a", aspetta = true)).tono)
        assertEquals(TonoChat.GUIDATA, leggiChat(chat("a", aspetta = true, governata = true)).tono)
    }

    @Test
    fun `senza terminale e spenta, altrimenti al lavoro`() {
        assertEquals(TonoChat.SPENTA, leggiChat(chat("a", viva = false)).tono)
        assertEquals(TonoChat.LAVORA, leggiChat(chat("a")).tono)
    }

    @Test
    fun `un computer vecchio che non manda viva non fa sembrare spente tutte le chat`() {
        val c = Api.json.decodeFromString(Chat.serializer(), """{"id":"x","titolo":"t"}""")
        assertTrue(c.viva)
        assertEquals(TonoChat.LAVORA, leggiChat(c).tono)
    }

    @Test
    fun `il riassunto dice prima chi aspetta te, e solo quello che c e`() {
        val r = riassuntoChat(listOf(chat("a", aspetta = true), chat("b"), chat("c"), chat("d", chiede = true)))
        assertEquals("1 aspetta che tu scelga · 1 aspetta te · 2 al lavoro", r)
        assertEquals(2, chatCheTiAspettano(listOf(chat("a", aspetta = true), chat("b", chiede = true), chat("c"))))
        assertEquals("nessuna chat aperta sul computer", riassuntoChat(emptyList()))
    }

    @Test
    fun `l etichetta di un altro PC dice se e acceso, come sul computer`() {
        assertEquals("su portatile · acceso", etichettaAltrove("portatile", true))
        assertEquals("su portatile · spento", etichettaAltrove("portatile", false))
        assertEquals("su portatile", etichettaAltrove("portatile", null))
        val s = Api.json.decodeFromString(SessioneRipresa.serializer(), """{"id":"1","altrove":"portatile","altroveAcceso":true}""")
        assertEquals(true, s.altroveAcceso)
    }

    // ── La banda delle urgenze ───────────────────────────────────────────

    @Test
    fun `una chat ferma su un permesso accende la banda, non solo il pallino`() {
        // Il difetto: la banda guardava solo le domande degli autopiloti, e la
        // cosa che blocca di più non si portava a chi guarda.
        val u = urgenzaDi(Stato(chat = listOf(chat("a", chiede = true, titolo = "Sito"))), connesso = true)
        assertEquals(TipoUrgenza.DOMANDE, u?.tipo)
        assertTrue(u!!.titolo.contains("Sito"))
        assertEquals("Vedi", u.azione)
    }

    @Test
    fun `domande e scelte insieme si contano insieme`() {
        val u = urgenzaDi(
            Stato(chat = listOf(chat("a", chiede = true)), domande = listOf(Domanda("d1", testo = "Quale chiave?"))),
            connesso = true
        )
        assertTrue(u!!.titolo.startsWith("2 "))
        assertEquals("Quale chiave?", u.sotto)
    }

    @Test
    fun `l ordine resta scollegato, domande, fermi, pronti`() {
        val fermo = AutopilotaBreve("x", nome = "Notte", stato = "sospeso", motivo = "test rossi")
        val pronto = AutopilotaBreve("y", nome = "Alba", stato = "pronto")
        assertEquals(TipoUrgenza.SCOLLEGATO, urgenzaDi(Stato(chat = listOf(chat("a", chiede = true))), connesso = false)?.tipo)
        assertEquals(TipoUrgenza.FERMI, urgenzaDi(Stato(autopiloti = listOf(pronto, fermo)), true)?.tipo)
        assertEquals("test rossi", urgenzaDi(Stato(autopiloti = listOf(fermo)), true)?.sotto)
        assertEquals(TipoUrgenza.PRONTI, urgenzaDi(Stato(autopiloti = listOf(pronto)), true)?.tipo)
        assertNull(urgenzaDi(Stato(chat = listOf(chat("a", aspetta = true))), true))
        assertNull(urgenzaDi(null, connesso = false))
    }

    // ── Le notifiche ─────────────────────────────────────────────────────

    @Test
    fun `la notifica di un autopilota fermo dice il motivo che il computer manda davvero`() {
        // `/api/stato` lo chiama `motivo`; la notifica leggeva `motivoSospensione`
        // (il nome del dettaglio) e diceva sempre «Serve una tua occhiata».
        val avvisi = Avvisi.daAnnunciare(
            JSONObject("""{"autopiloti":[{"id":"ap-1","nome":"Notte","stato":"sospeso","motivo":"la verifica non parte"}]}"""),
            mutableSetOf(), primoGiro = false
        )
        assertEquals("la verifica non parte", avvisi.single().testo)
    }

    @Test
    fun `una chat ferma su una scelta si annuncia, una volta, e senza risposta scritta`() {
        val visti = mutableSetOf<String>()
        val s = JSONObject("""{"chat":[{"id":"c1","titolo":"Sito","chiede":true,"aspetta":true}]}""")
        val primi = Avvisi.daAnnunciare(s, visti, primoGiro = true)
        // Anche al primo giro: sta aspettando adesso, come una domanda.
        assertEquals(1, primi.size)
        assertEquals("c1", primi[0].scelta)
        assertNull(primi[0].chat)
        assertTrue(primi[0].titolo.contains("tu scelga"))
        // Niente doppione «aspetta te», né al giro dopo.
        assertEquals(0, Avvisi.daAnnunciare(s, visti, primoGiro = false).size)
    }

    @Test
    fun `anche una chat governata ferma su una scelta si annuncia`() {
        val avvisi = Avvisi.daAnnunciare(
            JSONObject("""{"chat":[{"id":"c1","titolo":"Sito","chiede":true,"governata":true}]}"""),
            mutableSetOf(), primoGiro = false
        )
        assertEquals(1, avvisi.size)
    }

    @Test
    fun `una scelta risolta torna annunciabile`() {
        val visti = mutableSetOf<String>()
        Avvisi.daAnnunciare(JSONObject("""{"chat":[{"id":"c1","chiede":true}]}"""), visti, false)
        Avvisi.daAnnunciare(JSONObject("""{"chat":[{"id":"c1","chiede":false}]}"""), visti, false)
        assertEquals(1, Avvisi.daAnnunciare(JSONObject("""{"chat":[{"id":"c1","chiede":true}]}"""), visti, false).size)
    }

    @Test
    fun `un autopilota pronto aspetta il via e si annuncia una volta`() {
        val visti = mutableSetOf<String>()
        val s = JSONObject("""{"autopiloti":[{"id":"ap-1","nome":"Alba","stato":"pronto"}]}""")
        val avvisi = Avvisi.daAnnunciare(s, visti, primoGiro = false)
        assertEquals(1, avvisi.size)
        assertTrue(avvisi[0].titolo.contains("via"))
        assertEquals(0, Avvisi.daAnnunciare(s, visti, primoGiro = false).size)
    }

    @Test
    fun `le famiglie nuove non si sovrappongono alle vecchie`() {
        val famiglie = listOf(Avvisi.ID_DOMANDA, Avvisi.ID_FINITO, Avvisi.ID_FERMO, Avvisi.ID_ASPETTA, Avvisi.ID_SCELTA, Avvisi.ID_PRONTO)
        assertEquals(famiglie.size, famiglie.toSet().size)
        for (f in famiglie) assertEquals(0, f % Avvisi.PASSO_FAMIGLIA)
    }

    @Test
    fun `la riga fissa non conta le governate e conta le scelte`() {
        assertEquals("1 su 2 chat aspettano te", rigaPresenza(JSONObject("""{"chat":[{"id":"a","aspetta":true,"governata":true},{"id":"b","chiede":true}]}""")))
        assertEquals("2 chat, nessuna ti aspetta", rigaPresenza(JSONObject("""{"chat":[{"id":"a","aspetta":true,"governata":true},{"id":"b"}]}""")))
        assertEquals("Un autopilota ti sta chiedendo una cosa", rigaPresenza(JSONObject("""{"domande":[{"id":"d"}]}""")))
    }

    // ── Lavori e consumi ─────────────────────────────────────────────────

    @Test
    fun `il riassunto dei lavori non tace su chi aspetta il via o una risposta`() {
        // Prima: «N in attesa di te» contava solo sospesi e falliti.
        val l = listOf(
            AutopilotaBreve("1", stato = "pronto"), AutopilotaBreve("2", stato = "attesa"),
            AutopilotaBreve("3", stato = "lavoro"), AutopilotaBreve("4", stato = "lavoro"),
            AutopilotaBreve("5", stato = "fallito"), AutopilotaBreve("6", stato = "finito")
        )
        assertEquals("1 fermo · 1 aspetta una risposta · 1 aspetta il via · 2 al lavoro · 1 finito", riassuntoLavori(l))
        assertEquals("2 si preparano", riassuntoLavori(listOf(AutopilotaBreve("1", stato = "intervista"), AutopilotaBreve("2", stato = "intervista"))))
        assertEquals("nessun lavoro affidato", riassuntoLavori(emptyList()))
    }

    @Test
    fun `i limiti letti ieri non sembrano di adesso`() {
        val zona = java.util.TimeZone.getTimeZone("Europe/Rome")
        val cal = java.util.Calendar.getInstance(zona).apply { set(2026, 8, 30, 15, 0, 0) }
        val adesso = cal.timeInMillis
        val stamattina = cal.apply { set(java.util.Calendar.HOUR_OF_DAY, 9); set(java.util.Calendar.MINUTE, 5) }.timeInMillis
        assertEquals("alle 09:05", quandoLetti(stamattina, adesso, zona))
        val ieri = stamattina - 24L * 3600 * 1000
        assertEquals("ieri alle 09:05", quandoLetti(ieri, adesso, zona))
        val prima = stamattina - 3L * 24 * 3600 * 1000
        assertTrue(quandoLetti(prima, adesso, zona).startsWith("il 27 set"))
        assertFalse(quandoLetti(prima, adesso, zona).startsWith("alle"))
    }
}
