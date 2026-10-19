package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId

/** Lo storico degli errori nell'app (app 2.81.0): la coda verso il PC e la voce «Errori». */
class ErroriAppTest {
    @Test
    fun laCodaNonSuperaVentiETagliaITestiLunghi() {
        var coda = emptyList<ErroreDaMandare>()
        repeat(25) { coda = ErroriApp.conNuovo(coda, ErroreDaMandare("boom $it", "x".repeat(500))) }
        assertEquals(ErroriApp.MASSIMO, coda.size)
        assertEquals("boom 0", coda.first().testo)
        assertEquals(240, coda.first().cosa?.length)
    }

    @Test
    fun ilContoComeSulPcESullaPagina() {
        assertEquals("Nessun errore registrato", ErroriApp.conto(emptyList()))
        assertEquals("1 errore, 3 volte", ErroriApp.conto(listOf(VoceErroreApp(messaggio = "a", volte = 3))))
        assertEquals("2 errori diversi, 2 volte", ErroriApp.conto(listOf(VoceErroreApp(messaggio = "a"), VoceErroreApp(messaggio = "b"))))
    }

    @Test
    fun oraBreveNellOraDiChiLegge() {
        assertEquals("19/10 17:04", ErroriApp.oraBreve("2026-10-19T15:04:05.000Z", ZoneId.of("Europe/Rome")))
        assertEquals("rotta", ErroriApp.oraBreve("rotta"))
    }

    @Test
    fun leggeLaRispostaDelPc() {
        val json = Json { ignoreUnknownKeys = true }
        val s = json.decodeFromString<StoricoErroriPc>(
            """{"voci":[{"quando":"q","ultima":"u","dove":"servizio","volte":2,"messaggio":"m","punto":"src/a.ts:3","dettagli":"…"}],"testo":"t","pcSviluppo":"Portatile"}"""
        )
        assertEquals("servizio", s.voci.first().dove)
        assertEquals("Portatile", s.pcSviluppo)
        assertEquals(null, json.decodeFromString<StoricoErroriPc>("""{"voci":[],"testo":""}""").pcSviluppo)
    }
}
