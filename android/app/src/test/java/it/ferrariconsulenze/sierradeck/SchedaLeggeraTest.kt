package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * La scheda dell'autopilota leggera, con l'ETag (app 2.86.0, PC 0.86.0): il
 * telefono la rileggeva intera ogni due secondi.
 */
class SchedaLeggeraTest {
    @Before fun pulisci() = EtagTenuti.svuota()
    @After fun ripulisci() = EtagTenuti.svuota()

    private val leggera = """{"id":"ap-1","nome":"Notte","stato":"lavora","decisioni":[{"quando":"2026-10-01T00:00:00Z","cosa":"continua"}],
        "chat":[{"quando":"2026-10-01T00:00:00Z","da":"lui","testo":"ultima"}],"chatIntera":120,"troncati":{"decisioni":500,"dialogo":3,"modifiche":1}}"""

    @Test fun `chiede la scheda leggera, poi con If-None-Match, e un 304 ridà la stessa`() = runBlocking {
        val corpi = mutableListOf<JsonObject>()
        val pc = PcFintoHttp({ _, _ -> "\"v1\"" }) { percorso, corpo -> corpi += corpo; (if (percorso == "/api/autopilota") 200 else 404) to leggera }
        try {
            val api = Api("http://127.0.0.1:${pc.porta}", "chiave-di-esempio")
            val prima = api.autopilota("ap-1")
            assertEquals(true, corpi[0]["leggero"]!!.jsonPrimitive.boolean)
            assertEquals(120, prima.chatIntera)
            assertEquals(500, prima.troncati?.decisioni)
            assertNull(pc.seNonCambiato[0])
            val seconda = api.autopilota("ap-1")
            assertEquals("\"v1\"", pc.seNonCambiato[1])
            assertEquals(prima, seconda)
        } finally { pc.chiudi() }
    }

    @Test fun `la conversazione intera si chiede senza il segno leggero`() = runBlocking {
        val corpi = mutableListOf<JsonObject>()
        val pc = PcFintoHttp { _, corpo -> corpi += corpo; 200 to """{"id":"ap-1","chat":[]}""" }
        try {
            Api("http://127.0.0.1:${pc.porta}", "chiave-di-esempio").autopilota("ap-1", intera = true)
            assertNull(corpi.single()["leggero"])
        } finally { pc.chiudi() }
    }

    @Test fun `un PC vecchio senza ETag, niente tenuto, niente If-None-Match`() = runBlocking {
        val pc = PcFintoHttp { _, _ -> 200 to """{"id":"ap-1","chat":[]}""" }
        try {
            val api = Api("http://127.0.0.1:${pc.porta}", "chiave-di-esempio")
            val d = api.autopilota("ap-1")
            api.autopilota("ap-1")
            assertEquals(listOf<String?>(null, null), pc.seNonCambiato.toList())
            assertNull(d.chatIntera)
            assertEquals(0, EtagTenuti.quante())
        } finally { pc.chiudi() }
    }

    @Test fun `quante righe mancano della conversazione`() {
        assertEquals(0, RegoleSchedaLeggera.righePrima(null))
        assertEquals(0, RegoleSchedaLeggera.righePrima(AutopilotaDettaglio(chat = listOf(Battuta()))))
        assertEquals(119, RegoleSchedaLeggera.righePrima(AutopilotaDettaglio(chat = listOf(Battuta()), chatIntera = 120)))
    }

    @Test fun `le risposte tenute non crescono senza limite`() {
        repeat(EtagTenuti.MASSIMO * 3) { EtagTenuti.tieni(EtagTenuti.chiave("h", "/api/autopilota", "{\"autopilota\":\"ap-$it\"}"), "\"e$it\"", "t$it") }
        assertEquals(EtagTenuti.MASSIMO, EtagTenuti.quante())
        // Le più recenti restano.
        val ultima = EtagTenuti.chiave("h", "/api/autopilota", "{\"autopilota\":\"ap-${EtagTenuti.MASSIMO * 3 - 1}\"}")
        assertEquals("\"e${EtagTenuti.MASSIMO * 3 - 1}\"", EtagTenuti.etag(ultima))
        // Senza ETag la voce si dimentica.
        EtagTenuti.tieni(ultima, null, "x")
        assertNull(EtagTenuti.etag(ultima))
    }

    @Test fun `la Panoramica dalla scheda si rilegge al massimo ogni dieci secondi`() {
        assertTrue(PANORAMICA_OGNI_MS >= 10_000L)
        assertTrue(Davanti.ELENCO_MS >= 5_000L)
    }
}
