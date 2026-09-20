package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Il taglio delle sequenze del terminale, senza Compose e senza telefono.
 *
 * Nicholas (20/09/2026): «visualizzazione della chat con caratteri che si
 * vedono male». Le cause stavano tutte nel vecchio taglio, che cercava la
 * prima «m» dopo `ESC[` e non conosceva niente altro.
 */
class AnsiTest {
    private val esc = Char(27).toString()
    private val bel = Char(7).toString()

    @Test
    fun `una CSI che non e SGR non mangia il testo fino alla prima m`() {
        // ESC[2K (cancella riga) seguito da «ciao mondo»: prima spariva «ciao »
        assertEquals("ciao mondo", senzaSequenze("${esc}[2Kciao mondo"))
        // ESC[?25l (cursore nascosto): il finale e' «l», non «m»
        assertEquals("prompt", senzaSequenze("${esc}[?25lprompt"))
        assertEquals("abc", senzaSequenze("a${esc}[1Ab${esc}[3;5Hc"))
    }

    @Test
    fun `una OSC della shell si scarta per intero, con BEL o con ESC backslash`() {
        assertEquals("dopo", senzaSequenze("${esc}]633;A${bel}dopo"))
        assertEquals("dopo", senzaSequenze("${esc}]0;titolo${esc}\\dopo"))
    }

    @Test
    fun `un ESC seguito da una lettera sola non blocca il ciclo`() {
        // Prima: indice fermo, ciclo infinito, app bloccata.
        assertEquals("x", senzaSequenze("${esc}(Bx"))
        assertEquals("x", senzaSequenze("${esc}=x"))
        assertEquals("x", senzaSequenze("${esc}7x${esc}8"))
        assertEquals("", senzaSequenze(esc))
        assertEquals("", senzaSequenze("${esc}["))
    }

    @Test
    fun `gli SGR restano, come numeri, e il testo resta testo`() {
        val pezzi = spezzaAnsi("${esc}[1;32mok${esc}[0m fine")
        assertEquals(
            listOf(PezzoAnsi.Sgr(listOf(1, 32)), PezzoAnsi.Testo("ok"), PezzoAnsi.Sgr(listOf(0)), PezzoAnsi.Testo(" fine")),
            pezzi
        )
    }

    @Test
    fun `un SGR vuoto vale zero, e i due punti separano come il punto e virgola`() {
        assertEquals(listOf(PezzoAnsi.Sgr(listOf(0))), spezzaAnsi("${esc}[m"))
        assertEquals(listOf(PezzoAnsi.Sgr(listOf(38, 2, 1, 2, 3))), spezzaAnsi("${esc}[38:2:1:2:3m"))
    }

    @Test
    fun `i caratteri di controllo non si mostrano, il tab si`() {
        assertEquals("a\tb", senzaSequenze("a\tb${bel}\r"))
    }

    @Test
    fun `una riga senza sequenze e un pezzo solo`() {
        assertEquals(listOf(PezzoAnsi.Testo("│ ciao ●")), spezzaAnsi("│ ciao ●"))
    }
}
