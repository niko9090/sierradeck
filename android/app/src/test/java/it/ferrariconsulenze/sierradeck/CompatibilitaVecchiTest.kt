package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'app 2.56 con PC alla 0.50 e alla 0.54 (app 2.56.2). Le risposte in
 * `resources/pc/0.50.0/` e `0.54.0/` sono **vere**: le rotte di quei tag
 * chiamate con le richieste nuove della 0.55/0.56 (lo script è nel quaderno).
 * Nessun errore muto: ogni rifiuto diventa «arriva aggiornando NOME alla X»
 * con la versione giusta, e la fascia in cima offre «Installa là».
 */
class CompatibilitaVecchiTest {
    private fun corpo(v: String, r: String): String = javaClass.classLoader!!.getResource("pc/$v/$r.json")!!.readText()
    private fun stato(v: String, r: String): Int = javaClass.classLoader!!.getResource("pc/$v/$r.stato")!!.readText().trim().toInt()
    private fun errore(v: String, r: String): Api.Errore = Api.Errore(stato(v, r), corpo(v, r))

    @Test
    fun `le azioni nuove su un PC vecchio dicono quale versione serve, mai un errore secco`() {
        for (v in listOf("0.50.0", "0.54.0")) {
            for ((rotta, f) in listOf("chat-dormi" to FunzionePc.GESTIONE, "chat-sposta" to FunzionePc.GESTIONE, "workspace-rinomina" to FunzionePc.GESTIONE,
                "pin-proteggi" to FunzionePc.PARITA, "chat-ospite" to FunzionePc.PARITA, "autopilota-archivia" to FunzionePc.PARITA)) {
                assertEquals("$v $rotta", 404, stato(v, rotta))
                val t = spiegaGestione(errore(v, rotta), "farlo", "PC-ESEMPIO", f)
                assertTrue("$v $rotta: $t", t.startsWith(f.nome) && t.contains("alla ${f.minima}") && t.contains("Installa là"))
            }
        }
    }

    @Test
    fun `la chat nuova e l'autopilota su un PC vecchio passano, ma i campi nuovi no - per questo l'app avvisa`() {
        for (v in listOf("0.50.0", "0.54.0")) {
            assertEquals(200, stato(v, "apri-nuova"))
            assertEquals(200, stato(v, "autopilota-crea"))
            // Il PC vecchio non sa né nome, né workspace, né modello, né partenza: l'app lo dice.
            assertEquals(false, FunzioniPc.disponibile(FunzionePc.PARITA, v))
            assertEquals(false, FunzioniPc.disponibile(FunzionePc.GESTIONE, v))
        }
    }

    @Test
    fun `i modelli, Installa là - se il PC accoppiato non li ha, si dice`() {
        for (v in listOf("0.50.0", "0.54.0")) {
            assertEquals(404, stato(v, "modelli"))
            assertEquals(404, stato(v, "installa-la"))
            assertTrue(FunzioniPc.mancaSulPc(errore(v, "installa-la")))
        }
    }

    @Test
    fun `la fascia del PC indietro - cosa manca e Installa là, solo quando serve`() {
        val t = PcIndietro.testo("PC-ESEMPIO", "0.50.0", "0.56.2")!!
        assertTrue(t, t.startsWith("PC-ESEMPIO ha la versione 0.50.0, il PC a cui è collegato il telefono la 0.56.2."))
        assertTrue(t, t.contains("la sezione File e i file dal PC al telefono"))
        assertTrue(t, t.contains("Installa là"))
        assertTrue(PcIndietro.testo("PC-ESEMPIO", "0.54.0", "0.56.2")!!.contains("il PIN, l'ospite"))
        assertNull(PcIndietro.testo("PC-ESEMPIO", "0.56.2", "0.56.2"))
        assertNull(PcIndietro.testo("PC-ESEMPIO", null, "0.56.2"))
    }
}
