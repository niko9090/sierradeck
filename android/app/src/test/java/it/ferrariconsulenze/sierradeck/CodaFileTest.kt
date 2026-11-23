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

    @Test fun erroreImprevistoRimetteInAttesaENonLasciaInvio() = runBlocking {
        val dir = Files.createTempDirectory("codafile").toFile()
        var rompi = true
        val c = CodaFile(dir, { v, _, _ -> if (rompi) throw java.io.IOException("disco") else EsitoInvio.Arrivato(v.nome, "x", null, null) })
        c.metti("p", "a.txt", 1, null, "autopilota", "a1", "Sito") { "x".byteInputStream() }
        c.svuota()
        val v = c.voci.value.single()
        assertEquals("attesa", v.stato)
        assertEquals("disco", v.messaggio)
        rompi = false
        c.svuota()
        assertEquals("arrivato", c.voci.value.single().stato)
    }

    @Test fun invioFermatoACanaleTornaInAttesa() = runBlocking {
        val dir = Files.createTempDirectory("codafile").toFile()
        val c = CodaFile(dir, { _, _, _ -> throw kotlinx.coroutines.CancellationException("fermato") })
        c.metti("p", "a.txt", 1, null, "autopilota", "a1", "Sito") { "x".byteInputStream() }
        try { c.svuota() } catch (_: kotlinx.coroutines.CancellationException) { }
        assertEquals("attesa", c.voci.value.single().stato)
    }

    @Test fun copiaSpezzataNonRestaSulTelefono() {
        val dir = Files.createTempDirectory("codafile").toFile()
        val c = CodaFile(dir, { _, _, _ -> EsitoInvio.Rifiutato(0, "no") })
        try {
            c.metti("p", "a.txt", 1, null, "autopilota", "a1", "Sito") {
                object : java.io.InputStream() { override fun read(): Int = throw java.io.IOException("letto male") }
            }
        } catch (_: java.io.IOException) { }
        assertTrue(c.voci.value.isEmpty())
        assertEquals(0, java.io.File(dir, "in-uscita").listFiles()?.size ?: 0)
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
