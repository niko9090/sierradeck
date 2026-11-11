package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.dati.CodaInvii
import it.ferrariconsulenze.sierradeck.rete.Esito
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class CodaInviiTest {
    private fun cartella(): File = Files.createTempDirectory("coda").toFile()

    @Test fun restaSuFileSeLaReteNonCEERipartConLoStessoId() = runBlocking {
        val f = File(cartella(), "coda.json")
        val visti = mutableListOf<String>()
        var rete = false
        val manda: suspend (CodaInvii.Invio) -> Esito<String> = { visti += it.id; if (rete) Esito.Riuscito("{}") else Esito.Rete("spento") }
        val c = CodaInvii(f, manda)
        val i = c.metti("pc-finto", "/api/scrivi", "{}", "ap:a1", "ciao")
        c.svuota()
        assertEquals(1, c.invii.value.size)
        // L'app si riapre: la coda è ancora lì.
        val c2 = CodaInvii(f, manda)
        assertEquals(i.id, c2.invii.value.single().id)
        rete = true
        c2.svuota()
        assertTrue(c2.invii.value.isEmpty())
        assertEquals(listOf(i.id, i.id), visti)
    }

    @Test fun rifiutoRestaConIlMotivoENonRiparte() = runBlocking {
        val c = CodaInvii(File(cartella(), "c.json"), { Esito.Rifiuto(400, "testo vuoto") })
        c.metti("pc-finto", "/api/scrivi", "{}", "ap:a1", "x")
        c.svuota()
        assertEquals("testo vuoto", c.invii.value.single().rifiutato)
        c.svuota()
        assertEquals(1, c.invii.value.single().tentativi)
    }

    @Test fun laReteFermaGliAltriPerTenereLOrdine() = runBlocking {
        var n = 0
        val c = CodaInvii(File(cartella(), "c.json"), { n++; Esito.Rete("no") })
        c.metti("p", "/r", "{}", "a", "1"); c.metti("p", "/r", "{}", "a", "2")
        c.svuota()
        assertEquals(1, n)
    }

    @Test fun bozzaTenutaEToltaAlInvio() {
        val f = File(cartella(), "c.json")
        val c = CodaInvii(f, { Esito.Riuscito("") })
        c.bozza("ap:a1", "metà fras")
        assertEquals("metà fras", CodaInvii(f, { Esito.Riuscito("") }).bozze.value["ap:a1"])
        c.metti("p", "/r", "{}", "ap:a1", "metà frase")
        assertNull(c.bozze.value["ap:a1"])
    }
}
