package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le chat in sottofondo (app 2.58.4, PC 0.58.4): il campo dice sempre cosa
 * succede, con le stesse parole del PC, e un rifiuto ha il suo perché.
 */
class SottofondoTest {
    @Test
    fun `il campo dice cosa succede, mai muto`() {
        assertEquals(
            "La sto avviando su PORTATILE-ESEMPIO, in sottofondo (là non si apre nessuna finestra)… Il tuo messaggio parte appena è pronta.",
            Sottofondo.testoAvvio("avvio", "PORTATILE-ESEMPIO", true)
        )
        for (f in listOf("chiedo", "avvio", "lenta", "consegna", "pronta", "lavora", "aspetta", "scelta", "chiusa", "errore")) {
            assertTrue(f, Sottofondo.testoAvvio(f, "X", false).isNotBlank())
        }
    }

    @Test
    fun `la risposta del PC si legge e il testo risulta consegnato`() {
        val st = Api.json.decodeFromString(
            StatoSottofondo.serializer(),
            """{"sessione":"s-1","chat":"sf-s-1","fase":"lavora","messaggio":"testo consegnato (a-1): la chat lavora","inCoda":0,"consegnati":["a-1"],"perChi":{"id":"tel:x","nome":"il telefono"},"titolo":"Prova","cwd":"C:\\Prove","dal":"2026-10-10T20:00:00.000Z","campoNuovo":1}"""
        )
        assertTrue(Sottofondo.consegnato(st, "a-1"))
        assertTrue(Sottofondo.finito(st, "a-1"))
        assertFalse(Sottofondo.finito(st.copy(consegnati = emptyList(), fase = "avvio"), "a-1"))
        assertTrue(Sottofondo.finito(st.copy(consegnati = emptyList(), fase = "pronta"), null))
    }

    @Test
    fun `un PC vecchio non è un errore secco - si dice di aggiornarlo`() {
        assertTrue(Sottofondo.perche(404, "{}", "PORTATILE-ESEMPIO").contains("va aggiornato alla 0.58.4"))
        assertTrue(Sottofondo.perche(403, "{\"errore\":\"«/api/sottofondo/avvia» no.\"}", "PORTATILE-ESEMPIO").contains("0.58.4"))
        assertEquals("la casa di questa chat è PC-ESEMPIO, non questo PC: avviala là", Sottofondo.perche(409, "{\"errore\":\"la casa di questa chat è PC-ESEMPIO, non questo PC: avviala là\"}", "X"))
        assertTrue(Sottofondo.perche(423, "{}", "X").contains("PIN"))
    }

    @Test
    fun `le rotte passano dal ponte, come sul PC`() {
        assertTrue("/api/sottofondo/avvia" in Ponte.ROTTE)
        assertTrue("/api/sottofondo/stato" in Ponte.ROTTE)
    }
}
