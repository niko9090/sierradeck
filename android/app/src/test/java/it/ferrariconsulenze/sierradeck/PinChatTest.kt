package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il PIN delle chat nell'app (PC 0.49.0, app 2.49.0). Le risposte sono nella
 * forma esatta del computer: 423 con `{"errore":…,"pin":"chiusa"}` per una
 * chat chiusa, 403/429 per il PIN sbagliato e le attese, e nell'elenco la
 * chat senza `ultimaRiga` con `pin: "chiusa"`.
 */
class PinChatTest {
    @Test
    fun `il 423 vuol dire chiusa dal PIN, gli altri errori no`() {
        assertTrue(PinChat.chiusa(Api.Errore(423, """{"errore":"«Clienti» è protetta dal PIN: inseriscilo per vederla e scriverle.","pin":"chiusa"}""")))
        assertFalse(PinChat.chiusa(Api.Errore(404, """{"errore":"chat non trovata"}""")))
        assertFalse(PinChat.chiusa(RuntimeException("rete")))
    }

    @Test
    fun `il PIN da 4 a 8 cifre e il campo tiene solo le cifre`() {
        assertTrue(PinChat.pinValido("4821"))
        assertTrue(PinChat.pinValido("12345678"))
        assertFalse(PinChat.pinValido("123"))
        assertFalse(PinChat.pinValido("12a4"))
        assertEquals("12345678", PinChat.pulisci("12 34-5678 9"))
    }

    @Test
    fun `i rifiuti del computer si dicono con le sue parole`() {
        assertEquals("PIN sbagliato.", PinChat.messaggio(Api.Errore(403, """{"errore":"PIN sbagliato."}""")))
        assertEquals("Troppi tentativi sbagliati: riprova fra 30 secondi.", PinChat.messaggio(Api.Errore(429, """{"errore":"Troppi tentativi sbagliati: riprova fra 30 secondi.","fraMs":30000}""")))
        assertTrue(PinChat.messaggio(Api.Errore(404, """{"errore":""}""")).contains("0.49.0"))
    }

    @Test
    fun `nell'elenco la chat chiusa arriva senza ultima riga e con il lucchetto`() {
        val stato = Api.json.decodeFromString(Stato.serializer(), """
            {"chat":[
              {"id":"p-1","titolo":"Clienti","cwd":"C:\\clienti","sessione":"s-clienti","aspetta":true,"chiede":false,"pin":"chiusa"},
              {"id":"p-2","titolo":"Libera","cwd":"C:\\libera","ultimaRiga":"ok","chiede":false}
            ]}
        """.trimIndent())
        val chiusa = stato.chat.first { it.id == "p-1" }
        assertEquals("chiusa", chiusa.pin)
        assertNull(chiusa.ultimaRiga)
        assertNull(stato.chat.first { it.id == "p-2" }.pin)
    }

    @Test
    fun `il PIN passa anche dal ponte verso un altro PC`() {
        assertTrue("/api/pin/sblocca" in Ponte.ROTTE)
    }
}
