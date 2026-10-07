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
        l = Linea.passo(l, EventoLinea.Errore(10_000, "irraggiungibile", "non risponde"))
        assertEquals("ricollego", l.fase); assertEquals(1, l.tentativo); assertEquals(11_000L, l.prossimoIl)
        assertEquals("Collegamento con LAPTOP caduto da 0 s · tentativo 1 · riprovo fra 1 s", Linea.testoRiconnessione(l, "LAPTOP", 10_000))
        assertFalse(Linea.eOra(l, 10_000, 10_500)); assertTrue(Linea.eOra(l, 10_000, 11_000))
        val attese = mutableListOf<Long>()
        var t = 11_000L
        repeat(5) {
            l = Linea.passo(l, EventoLinea.Errore(t, "irraggiungibile"))
            attese += l.prossimoIl!! - t
            t = l.prossimoIl!!
        }
        assertEquals(listOf(2000L, 5000L, 10_000L, 30_000L, 30_000L), attese)
        assertEquals(6, l.tentativo)
        l = Linea.passo(l, EventoLinea.RiprovaAdesso(t - 20_000))
        assertEquals(0L, Linea.fraSecondi(l, t - 20_000))
        l = Linea.passo(l, EventoLinea.Ok(t, 180, "webrtc"))
        assertEquals("collegato", l.fase); assertEquals("webrtc", l.strada); assertNull(l.prossimoIl)
        assertEquals("Passo da rete di casa a WebRTC", Linea.cambioVisibile(l, t + 1000))
        assertNull(Linea.cambioVisibile(l, t + Linea.CAMBIO_VISIBILE_MS + 1))
        l = Linea.passo(l, EventoLinea.Ok(t + 30_000, 20, "lan"))
        assertEquals("Passo da WebRTC a rete di casa", Linea.cambioVisibile(l, t + 30_001))
        assertEquals(listOf("collegato", "caduta", "tornato", "cambio", "cambio"), l.storia.map { it.tipo })
        assertEquals(6, l.storia[2].tentativi)
        assertTrue(Linea.rigaStoria(l.storia[1]).contains("caduta (rete di casa): non risponde"))
        assertTrue(Regex("tornato \\(WebRTC\\) dopo \\d+ s e 6 tentativi").containsMatchIn(Linea.rigaStoria(l.storia[2])))
    }

    @Test
    fun `storia e misure si tengono corte, riprova adesso a linea su non cambia niente`() {
        var l = Linea.NUOVA
        for (i in 0 until 100) l = Linea.passo(l, if (i % 2 == 0) EventoLinea.Ok(i * 1000L, 10) else EventoLinea.Errore(i * 1000L, "x"))
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
