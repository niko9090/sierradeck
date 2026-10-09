package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Il collegamento (PC 0.51.0, app 2.51.0): la stessa macchina del PC
 * (`src/shared/collegamento.ts`), con le stesse cadute, ritorni e cambi di
 * strada simulati, la qualità, la coda senza doppioni.
 */
class LineaTest {
    private val ts = File("../../src/shared/collegamento.ts").readText()

    @Test
    fun `attese e tempi uguali a quelli del PC`() {
        val blocco = ts.substringAfter("ATTESE_RICONNESSIONE_MS").substringAfter("= [").substringBefore("]")
        assertEquals(blocco.split(",").map { it.trim().replace("_", "").toLong() }, Linea.ATTESE_MS)
        assertTrue(ts.contains("KEEPALIVE_OGNI_MS = 2000"))
        assertTrue(ts.contains("KEEPALIVE_SCADE_MS = 6000"))
        assertEquals(listOf(1000L, 2000L, 5000L, 10_000L, 30_000L, 30_000L, 30_000L), listOf(1, 2, 3, 4, 5, 6, 50).map { Linea.attesaPrima(it) })
    }

    @Test
    fun `qualita - tacche dal ritardo e dalle perdite`() {
        assertEquals(0, Linea.qualita(emptyList()).tacche)
        val buona = Linea.qualita(listOf(MisuraLinea(true, 40, 1), MisuraLinea(true, 60, 2)))
        assertEquals(4, buona.tacche); assertEquals(50L, buona.ritardoMs)
        assertEquals(3, Linea.qualita(listOf(MisuraLinea(true, 300, 1))).tacche)
        assertEquals(2, Linea.qualita(listOf(MisuraLinea(true, 700, 1))).tacche)
        assertEquals(1, Linea.qualita(listOf(MisuraLinea(true, 2500, 1))).tacche)
        val mezze = Linea.qualita(listOf(MisuraLinea(true, 50, 1), MisuraLinea(false, null, 2), MisuraLinea(true, 50, 3), MisuraLinea(false, null, 4)))
        assertEquals(2, mezze.tacche); assertEquals(0.5, mezze.perdite, 0.0001)
        assertEquals("non arriva niente", Linea.qualita(listOf(MisuraLinea(false, null, 1))).parola)
    }

    @Test
    fun `caduta, tentativi con attese crescenti, ritorno via WebRTC, poi di nuovo la rete di casa`() {
        var l = Linea.passo(Linea.NUOVA, EventoLinea.Ok(0, 30, "lan"))
        assertEquals("collegato", l.fase)
        assertFalse(Linea.eOra(l, 0, Linea.KEEPALIVE_OGNI_MS - 1))
        assertTrue(Linea.eOra(l, 0, Linea.KEEPALIVE_OGNI_MS))
        // Prima «linea lenta» (app 2.56.0): giù solo dopo 3 fallimenti di fila e 20 s senza niente.
        l = Linea.passo(l, EventoLinea.Errore(10_000, "irraggiungibile", "non risponde"))
        assertEquals("lenta", l.fase); assertNull(l.prossimoIl)
        l = Linea.passo(l, EventoLinea.Errore(16_000, "irraggiungibile", "non risponde"))
        assertEquals("lenta", l.fase)
        l = Linea.passo(l, EventoLinea.Errore(22_000, "irraggiungibile", "non risponde"))
        assertEquals("ricollego", l.fase); assertEquals(1, l.tentativo); assertEquals(23_000L, l.prossimoIl); assertEquals(0L, l.cadutaIl)
        assertEquals("Collegamento con LAPTOP caduto da 22 s · tentativo 1 · riprovo fra 1 s", Linea.testoRiconnessione(l, "LAPTOP", 22_000))
        assertFalse(Linea.eOra(l, 22_000, 22_500)); assertTrue(Linea.eOra(l, 22_000, 23_000))
        val attese = mutableListOf<Long>()
        var t = 23_000L
        repeat(5) {
            l = Linea.passo(l, EventoLinea.Errore(t, "irraggiungibile"))
            attese += l.prossimoIl!! - t
            t = l.prossimoIl!!
        }
        assertEquals(listOf(2000L, 5000L, 10_000L, 30_000L, 30_000L), attese)
        assertEquals(6, l.tentativo)
        l = Linea.passo(l, EventoLinea.RiprovaAdesso(t - 20_000))
        assertEquals(0L, Linea.fraSecondi(l, t - 20_000))
        // Isteresi: la prima risposta fa «lenta», la seconda «collegato».
        l = Linea.passo(l, EventoLinea.Ok(t, 180, "webrtc"))
        assertEquals("lenta", l.fase); assertEquals("webrtc", l.strada)
        l = Linea.passo(l, EventoLinea.Ok(t + 2000, 170, "webrtc"))
        assertEquals("collegato", l.fase); assertEquals("webrtc", l.strada); assertNull(l.prossimoIl)
        l = Linea.passo(l, EventoLinea.Ok(t + 30_000, 20, "lan"))
        assertEquals("Passo da WebRTC a rete di casa", Linea.cambioVisibile(l, t + 30_001))
        assertEquals(listOf("collegato", "caduta", "tornato", "cambio"), l.storia.map { it.tipo })
        assertEquals(6, l.storia[2].tentativi)
        assertTrue(Linea.rigaStoria(l.storia[1]).contains("caduta (rete di casa): non risponde"))
        assertTrue(Regex("tornato \\(WebRTC\\) dopo \\d+ (s|min) e 6 tentativi").containsMatchIn(Linea.rigaStoria(l.storia[2])))
    }

    @Test
    fun `il caso di Nicholas (09-10) - lo schermo arriva mentre il controllo fallisce, mai non connesso`() {
        // Il controllo dello stato scade ogni due secondi; la storia della chat arriva ogni secondo e mezzo. Per due minuti.
        var l = Linea.passo(Linea.NUOVA, EventoLinea.Ok(0, 40, "tailscale"))
        val fasi = mutableSetOf<String>()
        var t = 1000L
        while (t <= 120_000L) {
            if (t % 2000 == 0L) l = Linea.passo(l, EventoLinea.Errore(t, "irraggiungibile", "non ha risposto in 6 secondi"))
            if (t % 1500 == 0L) l = Linea.passo(l, EventoLinea.Ok(t, 300, "tailscale"))
            fasi += Linea.faseVista(l, t)
            t += 500
        }
        assertFalse(fasi.toString(), "ricollego" in fasi)
        assertEquals(listOf("collegato"), l.storia.map { it.tipo })
    }

    @Test
    fun `linea lenta - dopo 8 s di silenzio senza errori, o pochi fallimenti, parole e colori`() {
        val l = Linea.passo(Linea.NUOVA, EventoLinea.Ok(0, 40))
        assertEquals("collegato", Linea.faseVista(l, Linea.LENTA_DOPO_MS - 1))
        assertEquals("lenta", Linea.faseVista(l, Linea.LENTA_DOPO_MS))
        var m = l
        repeat(5) { m = Linea.passo(m, EventoLinea.Errore((it + 1) * 1000L, "irraggiungibile")) }
        assertEquals("lenta", m.fase)
        // Il primo collegamento senza mai un segno di vita: giù subito, per la schermata dei tentativi.
        assertEquals("ricollego", Linea.passo(Linea.NUOVA, EventoLinea.Errore(0, "irraggiungibile")).fase)
        assertEquals("linea lenta", Linea.parolaFase("lenta")); assertEquals("non connesso", Linea.parolaFase("ricollego"))
    }

    @Test
    fun `un solo stato per PC, fatto avanzare da ogni risposta dell'Api - la storia arriva, il controllo scade`() = kotlinx.coroutines.runBlocking {
        Collegamenti.azzera(Collegamenti.ACCOPPIATO)
        // Un PC che risponde alla storia della chat e mai allo stato (lo stato «pesante» che scade).
        val pc = PcFintoHttp { percorso: String, _: kotlinx.serialization.json.JsonObject ->
            if (percorso == "/api/stato") 504 to """{"errore":"tempo scaduto"}""" else 200 to """{"righe":["ciao"],"totale":1,"da":0}"""
        }
        val api = Api("http://127.0.0.1:${pc.porta}", "chiave-di-esempio")
        repeat(10) {
            // Il controllo dello stato scade (come lo segna il giro di App/ChatSuAltroPc)…
            Collegamenti.passo(Collegamenti.ACCOPPIATO, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", "non ha risposto in 6 secondi"))
            // …ma la storia della chat arriva, e conta.
            try { api.storia("p-1", -1, 40) } catch (_: Exception) { }
            assertTrue(Collegamenti.di(Collegamenti.ACCOPPIATO).fase != "ricollego")
        }
        assertEquals("collegato", Collegamenti.di(Collegamenti.ACCOPPIATO).fase)
        pc.chiudi()
        // Il PC non c'è più: la rete cade (IOException) — prima lenta, poi giù quando il silenzio e i fallimenti bastano.
        repeat(3) { try { api.storia("p-1", -1, 40) } catch (_: Exception) { } }
        val dopo = Collegamenti.di(Collegamenti.ACCOPPIATO)
        assertTrue(dopo.fase, dopo.fase == "lenta" || dopo.fase == "ricollego")
        assertTrue(dopo.falliti >= 3)
    }

    @Test
    fun `storia e misure si tengono corte, riprova adesso a linea su non cambia niente`() {
        var l = Linea.NUOVA
        for (i in 0 until 100) l = Linea.passo(l, EventoLinea.Ok(i * 1000L, 10, if (i % 2 == 0) "lan" else "webrtc"))
        assertEquals(30, l.storia.size); assertEquals(12, l.misure.size)
        val su = Linea.passo(Linea.NUOVA, EventoLinea.Ok(0, 5))
        assertTrue(su === Linea.passo(su, EventoLinea.RiprovaAdesso(5)))
    }

    @Test
    fun `errori della strada e strada migliore`() {
        assertTrue(listOf("irraggiungibile", "collegando", "spento").all { Linea.erroreDiStrada(it) })
        assertFalse(listOf("chat", "pin", "lento").any { Linea.erroreDiStrada(it) })
        assertEquals("tailscale", Linea.stradaMigliore(listOf("drive", "webrtc", "tailscale")))
        assertTrue(Linea.meglio("lan", "webrtc")); assertFalse(Linea.meglio("drive", "webrtc"))
    }

    @Test
    fun `la strada fra telefono e PC accoppiato, dall'indirizzo (0_52)`() {
        assertEquals("tailscale", Linea.stradaDiIndirizzo("http://100.101.102.103:7420"))
        assertEquals("lan", Linea.stradaDiIndirizzo("192.168.1.20:7420"))
        assertEquals("lan", Linea.stradaDiIndirizzo("http://10.0.0.5:7420/"))
        assertEquals("lan", Linea.stradaDiIndirizzo("172.20.1.1"))
        assertNull(Linea.stradaDiIndirizzo("http://8.8.8.8:7420"))
        assertNull(Linea.stradaDiIndirizzo("pc-fisso.local:7420"))
        assertNull(Linea.stradaDiIndirizzo("100.200.1.1"))
    }

    @Test
    fun `la coda - scritto a linea giu parte al ritorno, una volta sola`() {
        var c = Linea.accoda(emptyList(), "m-1", "continua", 1)
        c = Linea.accoda(c, "m-1", "continua", 1)
        c = Linea.accoda(c, "m-2", "poi i test", 2)
        assertEquals(listOf("m-1", "m-2"), c.map { it.id })
        c = Linea.inInvio(c, "m-1")
        assertNull(Linea.prossimoDaMandare(c))
        c = Linea.nonPartito(c, "m-1")
        assertEquals("m-1", Linea.prossimoDaMandare(c)?.id)
        c = Linea.consegnato(Linea.inInvio(c, "m-1"), "m-1")
        assertEquals("m-2", Linea.prossimoDaMandare(c)?.id)
    }

    @Test
    fun `il ponte e la mappa arrivano nei modelli, e un PC vecchio senza non rompe niente`() {
        val s = Api.json.decodeFromString<Stato>("""{"chat":[],"ponte":{"strada":"tailscale","ritardoMs":84}}""")
        assertEquals("tailscale", s.ponte?.strada); assertEquals(84L, s.ponte?.ritardoMs)
        assertNull(Api.json.decodeFromString<Stato>("""{"chat":[]}""").ponte)
        val sal = Api.json.decodeFromString<Salute>("""{"tono":"ok","voci":[],"mappa":{"nodi":[{"id":"fisso","nome":"FISSO","x":50,"y":50,"io":true,"stato":"acceso"},{"id":"lap","nome":"LAPTOP","x":50,"y":12,"stato":"acceso"}],"linee":[{"a":"lap","strada":"WebRTC","stato":"ok","colore":"#3fb950","testo":"LAPTOP: WebRTC"}]}}""")
        assertEquals(2, sal.mappa?.nodi?.size)
        assertEquals("ok", sal.mappa?.linee?.first()?.stato)
    }
}
