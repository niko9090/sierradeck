package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.rete.Esito
import it.ferrariconsulenze.sierradeck.rete.Strade
import it.ferrariconsulenze.sierradeck.sottofondo.CicloAscolto
import it.ferrariconsulenze.sierradeck.sottofondo.CodaRisposte
import it.ferrariconsulenze.sierradeck.sottofondo.EsitoInvio
import it.ferrariconsulenze.sierradeck.sottofondo.InvioRisposta
import it.ferrariconsulenze.sierradeck.sottofondo.MemoriaInRam
import it.ferrariconsulenze.sierradeck.sottofondo.PortaHttp
import it.ferrariconsulenze.sierradeck.sottofondo.RispostaEventi
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket

/**
 * L'ascolto (app 2.100.0) contro un PC finto vero (socket su 127.0.0.1): la
 * richiesta lunga, il punto del registro, il PC di prima, le attese dopo i
 * fallimenti, le risposte dalla notifica con lo stesso id a ogni tentativo.
 */
class AscoltoAvvisiTest {
    private val chiave = "chiave-di-esempio"
    private val finti = mutableListOf<PcFintoHttp>()
    @After fun chiudi() = finti.forEach { it.chiudi() }

    private fun pc(risposta: (String, JsonObject) -> Pair<Int, String>) = PcFintoHttp(risposta).also { finti += it }
    private fun porta(p: PcFintoHttp) = PortaHttp({ "http://127.0.0.1:${p.porta}" }, chiave, PortaHttp.clienteSemplice())

    private val dueAvvisi = """{"ultimo":7,"stato":3,"avvisi":[
        {"n":6,"id":"domanda:d1","tipo":"domanda","titolo":"Notte chiede","testo":"Unisco il ramo?","sotto":"Consigliata: Sì","quando":"2026-11-11T10:00:00.000Z",
         "bersaglio":{"cosa":"domanda","id":"d1","autopilota":"ap1"},"azioni":[{"etichetta":"Sì","risposta":"Sì"},{"etichetta":"No","risposta":"No"}],"suona":true,"nuovo":"ignoto"},
        {"n":7,"id":"fermo:ap1","tipo":"fermo","titolo":"Lavoro fermo · Notte","testo":"la chat non parte","quando":"2026-11-11T10:00:01.000Z",
         "bersaglio":{"cosa":"workspace","id":"ws1","autopilota":"ap1"},"suona":false,"chiuso":{"quando":"2026-11-11T10:01:00.000Z","come":"ritirata"}}
    ]}"""

    @Test
    fun `un giro legge dal punto giusto, consegna il pacco, dice visto e avanza`() = runBlocking {
        val visti = mutableListOf<Pair<String, JsonObject>>()
        val p = pc { percorso, corpo -> visti += percorso to corpo
            if (percorso.startsWith("/api/eventi")) 200 to dueAvvisi else 200 to """{"consegnati":2}""" }
        val memoria = MemoriaInRam(5)
        val pacchi = mutableListOf<RispostaEventi>()
        val ciclo = CicloAscolto({ porta(p) }, memoria, { pacchi += it }, { error("non è un PC di prima") })
        assertEquals(0L, ciclo.giro())
        assertEquals("/api/eventi?avvisi=5&attesa=50", visti[0].first)
        assertEquals(chiave, p.arrivate[0].second)
        assertEquals(listOf("domanda:d1", "fermo:ap1"), pacchi.single().avvisi.map { it.id })
        val d = pacchi.single().avvisi[0]
        assertEquals(listOf("Sì", "No"), d.azioni.map { it.risposta })
        assertEquals("ap1", d.bersaglio.autopilota)
        assertEquals("ritirata", pacchi.single().avvisi[1].chiuso?.come)
        assertEquals("/api/avvisi/visto", visti[1].first)
        assertEquals("7", visti[1].second["fino"]?.jsonPrimitive?.content)
        assertNotNull(p.arrivate[1].third)
        assertEquals(7L, memoria.ultimo)
        assertNotNull(ciclo.stato.value.ultimoContatto)
        assertNull(ciclo.stato.value.motivo)
    }

    @Test
    fun `un giro a vuoto non dice visto e richiama subito`() = runBlocking {
        val p = pc { percorso, _ -> if (percorso.startsWith("/api/eventi")) { Thread.sleep(1_100); 200 to """{"ultimo":9,"stato":1,"avvisi":[]}""" } else 500 to "{}" }
        val memoria = MemoriaInRam(9)
        val ciclo = CicloAscolto({ porta(p) }, memoria, { error("niente pacco") }, { })
        assertEquals(0L, ciclo.giro())
        assertEquals(1, p.arrivate.size)
    }

    @Test
    fun `un PC di prima (404 non trovato) fa il giro di sempre ogni due minuti`() = runBlocking {
        val p = pc { _, _ -> 404 to """{"errore":"non trovato"}""" }
        var vecchi = 0
        val ciclo = CicloAscolto({ porta(p) }, MemoriaInRam(), { }, { vecchi++ })
        assertEquals(2 * 60_000L, ciclo.giro())
        assertEquals(1, vecchi)
        assertTrue(ciclo.stato.value.vecchioPc)
    }

    @Test
    fun `computer spento - attese crescenti, poi un cambio di rete le azzera`() = runBlocking {
        val libera = ServerSocket(0).use { it.localPort }
        val porta = PortaHttp({ "http://127.0.0.1:$libera" }, chiave, PortaHttp.clienteSemplice())
        val ciclo = CicloAscolto({ porta }, MemoriaInRam(), { }, { })
        assertEquals(listOf(1_000L, 2_000L, 5_000L, 10_000L, 30_000L, 60_000L, 60_000L), (1..7).map { ciclo.giro() })
        assertNotNull(ciclo.stato.value.motivo)
        ciclo.azzeraAttese()
        assertEquals(1_000L, ciclo.giro())
    }

    @Test
    fun `la chiave non riconosciuta aspetta almeno un minuto e lo dice`() = runBlocking {
        val p = pc { _, _ -> 401 to """{"errore":"chiave"}""" }
        val ciclo = CicloAscolto({ porta(p) }, MemoriaInRam(), { }, { })
        assertTrue(ciclo.giro() >= 60_000L)
        assertTrue(ciclo.stato.value.motivo!!.contains("accoppiato"))
    }

    @Test
    fun `senza PC accoppiato il servizio si ferma`() = runBlocking {
        assertEquals(CicloAscolto.NON_ACCOPPIATO, CicloAscolto({ null }, MemoriaInRam(), { }, { }).giro())
    }

    @Test
    fun `la risposta dalla notifica riprova con lo stesso id finche il PC la prende`() = runBlocking {
        var volte = 0
        val p = pc { percorso, corpo ->
            assertEquals("/api/rispondi", percorso)
            assertEquals("d1", corpo["domanda"]?.jsonPrimitive?.content)
            assertEquals("Sì, \"subito\"", corpo["risposta"]?.jsonPrimitive?.content)
            if (++volte == 1) 503 to """{"errore":"si sta aggiornando"}""" else 200 to """{"fatto":true}"""
        }
        val r = InvioRisposta("id-fisso", "domanda:d1", "Notte chiede", "domanda", "d1", null, "Sì, \"subito\"", creata = 1_000)
        val (restano, finite) = CodaRisposte.mandaTutte(porta(p), listOf(r), 2_000)
        assertEquals(listOf(r), restano)
        assertTrue(finite.isEmpty())
        val (restano2, finite2) = CodaRisposte.mandaTutte(porta(p), restano, 3_000)
        assertTrue(restano2.isEmpty())
        assertEquals(EsitoInvio.PRESA, finite2.single().second)
        assertEquals(listOf("id-fisso", "id-fisso"), p.arrivate.map { it.third })
    }

    @Test
    fun `la risposta a una domanda di un altro PC passa dal ponte`() = runBlocking {
        val p = pc { percorso, corpo ->
            assertEquals("/api/ponte", percorso)
            assertEquals("pc-due", corpo["pc"]?.jsonPrimitive?.content)
            assertEquals("/api/rispondi", corpo["percorso"]?.jsonPrimitive?.content)
            200 to """{"fatto":true}"""
        }
        val r = InvioRisposta("id-2", "pc:pc-due:domanda:d9", "Altro chiede", "domanda", "d9", "pc-due", "No")
        assertEquals(EsitoInvio.PRESA, CodaRisposte.esito(CodaRisposte.manda(porta(p), r)))
    }

    @Test
    fun `un no del PC chiude l'invio, la rete e i 5xx si riprovano, dopo un giorno basta`() = runBlocking {
        assertEquals(EsitoInvio.RIFIUTATA, CodaRisposte.esito(Esito.Rifiuto(409, "già chiusa")))
        assertEquals(EsitoInvio.RIFIUTATA, CodaRisposte.esito(Esito.MancaSulPc("/api/rispondi")))
        assertEquals(EsitoInvio.RIPROVA, CodaRisposte.esito(Esito.Rifiuto(503, "occupato")))
        assertEquals(EsitoInvio.RIPROVA, CodaRisposte.esito(Esito.Rifiuto(429, "piano")))
        assertEquals(EsitoInvio.RIPROVA, CodaRisposte.esito(Esito.Rete("spento")))
        val vecchia = InvioRisposta("x", "a", "t", "domanda", "d", null, "sì", creata = 0L + 1)
        val p = pc { _, _ -> error("non deve partire") }
        val (restano, finite) = CodaRisposte.mandaTutte(porta(p), listOf(vecchia), CodaRisposte.SCADE_MS + 10)
        assertTrue(restano.isEmpty())
        assertEquals(EsitoInvio.RIFIUTATA, finite.single().second)
    }

    @Test
    fun `la coda su disco si rilegge uguale, e un testo rotto e una coda vuota`() {
        val coda = listOf(InvioRisposta("a", "domanda:1", "T", "domanda", "1", null, "sì\nproprio", "la domanda", 5), InvioRisposta("b", "chat:c:1", "C", "chat", "c", "pc", "vai"))
        assertEquals(coda, CodaRisposte.decodifica(CodaRisposte.codifica(coda)))
        assertTrue(CodaRisposte.decodifica("{rotto").isEmpty())
        assertTrue(CodaRisposte.decodifica(null).isEmpty())
    }

    @Test
    fun `la richiesta lunga aspetta quanto chiede, le altre come sempre`() {
        assertEquals(65_000L, Strade.attesaDi("/api/eventi?avvisi=3&attesa=50"))
        assertEquals(15_000L, Strade.attesaDi("/api/eventi?avvisi=3&attesa=0"))
        assertEquals(65_000L, Strade.attesaDi("/api/eventi?attesa=500&avvisi=1"))
        assertNull(Strade.attesaDi("/api/stato"))
        assertNull(Strade.attesaDi("/api/eventi?avvisi=3"))
        assertEquals("/api/eventi", Strade.via("/api/eventi?avvisi=3&attesa=50"))
        assertTrue(Strade.via("/api/eventi?avvisi=1") in Strade.LETTURE)
        assertFalse("/api/eventi?avvisi=1" in Strade.LETTURE)
    }
}
