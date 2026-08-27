package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Prove su cosa si mostra in «Adatta».
 *
 * Il computer manda lo schermo largo cento colonne, cornice compresa. Qui si
 * decide cosa di quello sta su un telefono: la regola è che si butta la grafica
 * fatta con le lettere e si tiene il testo.
 */
class TerminaleTest {

    @Test
    fun `una riga di sola cornice non ha niente da leggere`() {
        assertTrue(soloCornice("╭──────────────────────╮"))
        assertTrue(soloCornice("│                      │"))
        assertTrue(soloCornice("  ────  ────  "))
    }

    @Test
    fun `una riga con del testo dentro la cornice si tiene`() {
        assertFalse(soloCornice("│ Sto lavorando…       │"))
        assertFalse(soloCornice("── Passo 3 ──"))
    }

    @Test
    fun `una riga vuota non e cornice`() {
        // Il vuoto in mezzo è composizione, e si tiene: toglierlo appiccica fra
        // loro cose che sullo schermo sono separate.
        assertFalse(soloCornice(""))
        assertFalse(soloCornice("    "))
    }

    @Test
    fun `gli estremi tagliano cornice e spazi ai due bordi`() {
        val riga = "│  Sto lavorando…   │"
        val (inizio, fine) = estremiDelTesto(riga)
        assertEquals("Sto lavorando…", riga.substring(inizio, fine))
    }

    @Test
    fun `una riga senza cornice resta intera`() {
        val riga = "npm test"
        val (inizio, fine) = estremiDelTesto(riga)
        assertEquals("npm test", riga.substring(inizio, fine))
    }

    @Test
    fun `di una riga tutta cornice non resta niente`() {
        val riga = "╰────╯"
        val (inizio, fine) = estremiDelTesto(riga)
        assertTrue(inizio >= fine)
    }

    @Test
    fun `il trattino dentro una parola non si tocca`() {
        // Il trattino da tastiera non è un carattere di cornice: «ben-fatto» non
        // deve diventare «ben-fatto» tagliato, né perdere pezzi.
        val riga = "esito: ben-fatto"
        val (inizio, fine) = estremiDelTesto(riga)
        assertEquals("esito: ben-fatto", riga.substring(inizio, fine))
    }
}
