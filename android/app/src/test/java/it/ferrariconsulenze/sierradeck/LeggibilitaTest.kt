package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Leggibilità della 0.83.0: contrasto AA anche nel tema scuro, caratteri di
 * almeno 12 sp (che crescono con la dimensione scelta nel telefono), tocchi di
 * almeno 48 dp, colori degli stati dalla tabella del PC.
 */
class LeggibilitaTest {
    private val sorgenti = File("src/main/java/it/ferrariconsulenze/sierradeck")
    private fun kt() = sorgenti.walk().filter { it.extension == "kt" }.toList()

    // Il banco scuro di partenza (Tema.kt).
    private val fondo = 0xFF0B0C0EL
    private val chassis = 0xFF1D2023L
    private val chassisAlto = 0xFF262A2EL
    private val testo = 0xFFDFE3E7L

    @Test
    fun rapportoComeWcag() {
        assertEquals(21.0, Contrasto.rapporto(0xFFFFFFFFL, 0xFF000000L), 0.01)
        assertEquals(1.0, Contrasto.rapporto(0xFF4AA3FFL, 0xFF4AA3FFL), 0.001)
    }

    @Test
    fun testoSuiTastiPieniAlmenoAA() {
        // Accento, ambra, verde, rosso del banco e tutti i colori della tabella:
        // il testo scelto sopra si legge (prima il bianco fisso dava 2,2-2,6:1).
        val pieni = listOf(0xFF4AA3FFL, 0xFFE0A33CL, 0xFF54C07AL, 0xFFDC5F5FL) + TabellaAttivita.colori.values
        for (p in pieni) {
            val sopra = Contrasto.migliore(p, fondo, testo)
            assertTrue("su %08X: %.2f".format(p, Contrasto.rapporto(sopra, p)), Contrasto.rapporto(sopra, p) >= 4.5)
        }
    }

    @Test
    fun coloriDegliStatiLeggibiliSuiFondiScuri() {
        for ((nome, c) in TabellaAttivita.colori) for (f in listOf(fondo, chassis, chassisAlto)) {
            assertTrue("$nome su %08X".format(f), Contrasto.rapporto(c, f) >= 4.5)
        }
    }

    @Test
    fun nessunCarattereSotto12sp() {
        // Il terminale ha la sua dimensione (A− A+): qui solo i numeri scritti.
        val piccoli = kt().flatMap { f ->
            f.readLines().mapIndexedNotNull { i, r ->
                Regex("""fontSize = (\d+)\.sp""").findAll(r).map { it.groupValues[1].toInt() }
                    .firstOrNull { it < 12 }?.let { "${f.name}:${i + 1}" }
            }
        }
        assertEquals(emptyList<String>(), piccoli)
    }

    @Test
    fun tocchiSempreDaAlmeno48dp() {
        // `tocco` (Componenti.kt) al posto di `clickable`: aggiunge il minimo di 48 dp.
        val fatti = kt().filter { it.name != "Componenti.kt" }.flatMap { f ->
            f.readLines().mapIndexedNotNull { i, r -> if (Regex("""\.clickable\s*[({]""").containsMatchIn(r)) "${f.name}:${i + 1}" else null }
        }
        assertEquals(emptyList<String>(), fatti)
        // Un IconButton o un tocco con una misura fissa sotto i 48 dp.
        val piccoli = kt().flatMap { f ->
            f.readLines().mapIndexedNotNull { i, r ->
                val n = Regex("""IconButton\([^)]*Modifier\.size\((\d+)\.dp\)""").find(r)?.groupValues?.get(1)?.toInt()
                    ?: Regex("""size\((\d+)\.dp\)[^\n]*\.tocco""").find(r)?.groupValues?.get(1)?.toInt()
                if (n != null && n < 48) "${f.name}:${i + 1}" else null
            }
        }
        assertEquals(emptyList<String>(), piccoli)
    }

    @Test
    fun aiutoEdLegendaGrandiDaToccare() {
        assertTrue(File(sorgenti, "Aiuto.kt").readText().contains(".size(48.dp)"))
        assertTrue(File(sorgenti, "Attivita.kt").readText().contains("modifier.size(48.dp).tocco"))
    }

    @Test
    fun statiDallaTabellaDelPc() {
        // Le mappe degli stati non prendono più verde, ambra e rosso dal banco.
        val mappe = mapOf(
            "Lavori.kt" to listOf("fun coloreStato(", "fun coloreLed("),
            "Chat.kt" to listOf("fun coloreTono("),
            "Salute.kt" to listOf("fun coloreTonoSalute("),
            "PannelloDrive.kt" to listOf("fun coloreVista("),
            "Negozio.kt" to listOf("fun coloreTono(")
        )
        for ((f, funzioni) in mappe) {
            val s = File(sorgenti, f).readText()
            for (fn in funzioni) {
                val corpo = s.substring(s.indexOf(fn)).substringBefore("\n}")
                assertTrue("$f $fn", corpo.contains("ColoreStato."))
                assertTrue("$f $fn", !Regex("""Banco\.(verde|ambra|rosso)""").containsMatchIn(corpo))
            }
        }
        // E nessun colore scritto a mano fuori dalle tavolozze.
        val ammessi = setOf("Tema.kt", "ColoriAttivita.kt", "Ansi.kt", "Ponte.kt", "DriveScollegato.kt")
        val aMano = kt().filter { it.name !in ammessi }.flatMap { f ->
            f.readLines().mapIndexedNotNull { i, r -> if (r.contains("Color(0x")) "${f.name}:${i + 1}" else null }
        }
        assertEquals(emptyList<String>(), aMano)
    }
}
