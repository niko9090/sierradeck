package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.dati.CodaFile
import it.ferrariconsulenze.sierradeck.nucleo.EsitoInvio
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class CodaFileTest {
    @Test fun copiaSulTelefonoRipresaConLoStessoIdPoiArrivato() = runBlocking {
        val dir = Files.createTempDirectory("codafile").toFile()
        val visti = mutableListOf<String>()
        var rete = false
        val manda: suspend (CodaFile.Voce, java.io.File, (Long, Long) -> Unit) -> EsitoInvio = { v, f, avanza ->
            visti += v.id
            assertEquals("ciao", f.readText())
            if (rete) { avanza(4, 4); EsitoInvio.Arrivato(v.nome, "consegne/a.txt", null, null) } else EsitoInvio.Rifiutato(0, "spento")
        }
        val c = CodaFile(dir, manda)
        val v = c.metti("pc-finto", "a.txt", 4, null, "autopilota", "a1", "Sito") { "ciao".byteInputStream() }
        c.svuota()
        assertEquals("attesa", c.voci.value.single().stato)
        // Riaperta: la coda e la copia sono ancora lì.
        val c2 = CodaFile(dir, manda)
        rete = true
        c2.svuota()
        assertEquals("arrivato", c2.voci.value.single().stato)
        assertEquals(listOf(v.id, v.id), visti)
        assertFalse(c2.copiaDi(v).exists())
    }

    @Test fun rifiutoVeroNonRiparte() = runBlocking {
        val dir = Files.createTempDirectory("codafile").toFile()
        var n = 0
        val c = CodaFile(dir, { _, _, _ -> n++; EsitoInvio.Rifiutato(413, "troppo grande") })
        c.metti("p", "b.bin", 1, null, "autopilota", "a1", "Sito") { "x".byteInputStream() }
        c.svuota(); c.svuota()
        assertEquals(1, n)
        assertEquals("rifiutato", c.voci.value.single().stato)
        c.togli(c.voci.value.single().id)
        assertTrue(c.voci.value.isEmpty())
    }
}
