package it.ferrariconsulenze.sierradeck

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 2.84.1 (PC 0.84.1): le domande delle chat degli altri PC. Le opzioni fisse
 * di Claude Code arrivano dal PC con `etichetta` in italiano («Scrivo io la
 * risposta», «Ne parlo nella chat»), al tocco si manda `testo`; se il testo
 * della domanda manca, la scheda ha `apri` e il tasto porta alla chat su quel PC.
 */
class DomandeAltriPcTest {
    @After
    fun pulisci() {
        SuPc.corrente = null
        Apertura.sessioneRichiesta = null
        Apertura.schedaRichiesta = null
    }

    @Test
    fun `la scheda del PC si legge con le etichette e il tasto per aprire la chat`() {
        val json = """{"chi":"chat «Prova» · Esempio · su PC-ESEMPIO","domanda":"Ti chiede di scegliere","scelte":[
            {"testo":"Rosso","numero":1},
            {"testo":"Type something.","numero":4,"libera":true,"etichetta":"Scrivo io la risposta"},
            {"testo":"Chat about this","numero":5,"etichetta":"Ne parlo nella chat"}],
            "dettagli":[],"segnaposto":"Oppure scrivile tu",
            "apri":{"pcId":"pc-b","pc":"PC-ESEMPIO","sessione":"s-prova","cwd":"C:\\x","titolo":"Prova"}}"""
        val s = Api.json.decodeFromString(SchedaDomanda.serializer(), json)
        assertEquals(listOf("Rosso", "Scrivo io la risposta", "Ne parlo nella chat"), s.scelte.map { etichettaScelta(it) })
        assertEquals(listOf("Rosso", "Type something.", "Chat about this"), s.scelte.map { it.testo })
        assertEquals("PC-ESEMPIO", s.apri?.pc)
    }

    @Test
    fun `una scheda di un PC più vecchio, senza etichetta né apri, resta com'era`() {
        val s = Api.json.decodeFromString(SchedaDomanda.serializer(), """{"chi":"x","domanda":"y","scelte":[{"testo":"Sì"}]}""")
        assertEquals("Sì", etichettaScelta(s.scelte[0]))
        assertNull(s.apri)
    }

    @Test
    fun `«Apri la chat su PC» porta alle chat di quel PC, dentro quella conversazione`() {
        Apertura.apriChatSu(ApriChatAltrove(pcId = "pc-b", pc = "PC-ESEMPIO", sessione = "s-prova", cwd = "C:\\x", titolo = "Prova"))
        assertEquals(PcPonte("pc-b", "PC-ESEMPIO"), SuPc.corrente)
        assertEquals("s-prova", Apertura.sessioneRichiesta)
        assertEquals(Scheda.CHAT, Apertura.schedaRichiesta)
    }

    @Test
    fun `l'opzione del messaggio mostra l'italiano del PC`() {
        val o = Opzione(numero = 5, testo = "Chat about this", etichetta = "Ne parlo nella chat")
        assertEquals("Ne parlo nella chat", SceltaVista.etichetta(o).testo)
        assertEquals("Chat about this", SceltaVista.etichetta(Opzione(numero = 5, testo = "Chat about this")).testo)
    }
}
