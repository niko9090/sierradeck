package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'app con computer più vecchi (0.43.0, app 2.46.0).
 *
 * Le risposte in `src/test/resources/pc/<versione>/` sono **vere**: generate
 * dal codice di quelle versioni nel git (worktree sul tag, le rotte di allora
 * chiamate con le dipendenze del loro stesso test vitest). Per ogni rotta c'è
 * il corpo (`.json`) e lo stato HTTP (`.stato`).
 */
class CompatibilitaPcTest {
    private fun leggi(versione: String, rotta: String): String =
        javaClass.classLoader!!.getResource("pc/$versione/$rotta.json")!!.readText()
    private fun stato(versione: String, rotta: String): Int =
        javaClass.classLoader!!.getResource("pc/$versione/$rotta.stato")!!.readText().trim().toInt()

    /** Come l'app riceverebbe la risposta: i dati, o l'errore che lancia `Api`. */
    private fun errore(versione: String, rotta: String): Api.Errore? {
        val s = stato(versione, rotta)
        return if (s in 200..299) null else Api.Errore(s, leggi(versione, rotta))
    }

    private val versioni = listOf("0.36.0", "0.38.0", "0.42.0")

    @Test
    fun `le risposte dei PC vecchi si leggono tutte senza errori`() {
        for (v in versioni) {
            val s = Api.json.decodeFromString(Stato.serializer(), leggi(v, "stato"))
            assertTrue("chat dal PC $v", s.chat.isNotEmpty())
            Api.json.decodeFromString(Domande.serializer(), leggi(v, "domande"))
            val a = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), leggi(v, "autopilota"))
            assertEquals("ap-1", a.id)
            Api.json.decodeFromString(AppScaricabile.serializer(), leggi(v, "app"))
            assertEquals(v, Api.json.decodeFromString(Ciao.serializer(), leggi(v, "ciao")).versione)
        }
    }

    @Test
    fun `la versione dal saluto decide quali funzioni sono accese`() {
        val accese = versioni.associateWith { v ->
            val pc = Api.json.decodeFromString(Ciao.serializer(), leggi(v, "ciao")).versione
            FunzionePc.entries.filter { FunzioniPc.disponibile(it, pc) == true }.toSet()
        }
        assertEquals(setOf(FunzionePc.DIALOGO_AUTOPILOTA, FunzionePc.DOMANDE), accese["0.36.0"])
        assertEquals(setOf(FunzionePc.DIALOGO_AUTOPILOTA, FunzionePc.DOMANDE, FunzionePc.FILE_AUTOPILOTA), accese["0.38.0"])
        assertEquals(FunzionePc.entries.filter { !Aggiornamenti.piuNuova("0.42.0", it.minima) }.toSet(), accese["0.42.0"])
        assertFalse(FunzionePc.SALUTE in accese["0.42.0"]!!)
    }

    @Test
    fun `una funzione che il PC non ha si spegne con arriva aggiornando il PC`() {
        // 0.36: niente Istruzioni e niente File (404 della rotta sconosciuta).
        val istr36 = errore("0.36.0", "istruzioni")!!
        assertTrue(FunzioniPc.mancaSulPc(istr36))
        assertEquals("La linguetta Istruzioni arriva aggiornando il PC alla 0.41.0.", FunzioniPc.spiega(istr36, FunzionePc.ISTRUZIONI))
        assertEquals("La linguetta File arriva aggiornando il PC alla 0.38.0.", FunzioniPc.spiega(errore("0.36.0", "file")!!, FunzionePc.FILE_AUTOPILOTA))
        // 0.38: le Istruzioni ancora no.
        assertTrue(FunzioniPc.mancaSulPc(errore("0.38.0", "istruzioni")!!))
        // Un 404 con un altro motivo non è «manca sul PC».
        assertFalse(FunzioniPc.mancaSulPc(Api.Errore(404, """{"errore":"autopilota inesistente"}""")))
        assertFalse(FunzioniPc.mancaSulPc(Api.Errore(500, "guasto")))
    }

    @Test
    fun `senza la versione si prova, e un nome strano non accende niente`() {
        assertNull(FunzioniPc.disponibile(FunzionePc.ISTRUZIONI, null))
        assertNull(FunzioniPc.disponibile(FunzionePc.ISTRUZIONI, "sviluppo"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.ISTRUZIONI, "0.41.0"))
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.ISTRUZIONI, "0.40.9"))
    }

    @Test
    fun `dalla 0_43_0 il PC dice la sua versione anche in stato, e un campo in piu non rompe niente`() {
        val s = Api.json.decodeFromString(Stato.serializer(), """{"chat":[],"computer":{"nome":"PC-Fisso","versione":"0.43.0","futuro":true},"campoNuovo":[1,2]}""")
        assertEquals("0.43.0", s.computer?.versione)
        assertNull(Api.json.decodeFromString(Stato.serializer(), leggi("0.42.0", "stato")).computer?.versione)
    }

    @Test
    fun `le opzioni di un autopilota come stringhe (PC 0_36-0_42) non rompono le Domande`() {
        val vecchio = """{"voci":[{"tipo":"autopilota","id":"d-1","testo":"Quale chiave?","opzioni":["id_rsa","id_ed25519"]},{"tipo":"scelta","chat":"p-2","opzioni":[{"numero":1,"testo":"Sì","scelta":true}]}]}"""
        val d = Api.json.decodeFromString(Domande.serializer(), vecchio)
        assertEquals(listOf("id_rsa", "id_ed25519"), d.voci[0].opzioni.map { it.testo })
        assertEquals(1, d.voci[1].opzioni[0].numero)
        assertTrue(d.voci[1].opzioni[0].scelta)
    }
}
