package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * App 2.75.0: il microfono. Nicholas: «voglio poterti parlare direttamente
 * con il microfono». La logica di stato: ascolto, parziale, finale, errore,
 * permesso negato. Il testo va nel campo; nessun passo manda niente.
 */
class DettaturaTest {
    private fun giro(vararg eventi: EventoDettatura): Pair<StatoDettatura, String?> {
        var s: StatoDettatura = StatoDettatura.Fermo
        var campo: String? = null
        for (e in eventi) { val p = RegolaDettatura.passo(s, e); s = p.stato; p.campo?.let { campo = it } }
        return s to campo
    }

    @Test
    fun `con il permesso ascolta, i parziali compaiono dal vivo dopo il testo che c'era, il finale si ferma`() {
        var s: StatoDettatura = StatoDettatura.Fermo
        var p = RegolaDettatura.passo(s, EventoDettatura.Tasto("Già scritto ", haPermesso = true)); s = p.stato
        assertTrue(s is StatoDettatura.Ascolto)
        p = RegolaDettatura.passo(s, EventoDettatura.Parziale("fermati dopo")); s = p.stato
        assertEquals("Già scritto fermati dopo", p.campo)
        p = RegolaDettatura.passo(s, EventoDettatura.Parziale("fermati dopo i test")); s = p.stato
        assertEquals("Già scritto fermati dopo i test", p.campo)
        p = RegolaDettatura.passo(s, EventoDettatura.Finale("fermati dopo i test")); s = p.stato
        assertEquals(StatoDettatura.Fermo, s)
        assertEquals("Già scritto fermati dopo i test", p.campo)
    }

    @Test
    fun `la prima volta chiede il permesso con il motivo, poi ascolta`() {
        val (s, _) = giro(EventoDettatura.Tasto("", haPermesso = false))
        assertTrue(s is StatoDettatura.ChiedoPermesso)
        assertTrue(RegolaDettatura.MOTIVO_PERMESSO.contains("non registra e non salva l'audio"))
        val (s2, _) = giro(EventoDettatura.Tasto("ciao", haPermesso = false), EventoDettatura.PermessoDato)
        assertEquals(StatoDettatura.Ascolto("ciao"), s2)
    }

    @Test
    fun `permesso negato, e il campo non si tocca`() {
        val (s, campo) = giro(EventoDettatura.Tasto("testo mio", haPermesso = false), EventoDettatura.PermessoNegato)
        assertEquals(StatoDettatura.PermessoNegato, s)
        assertNull(campo)
    }

    @Test
    fun `gli errori diventano parole, il silenzio non cancella il testo`() {
        val (s, campo) = giro(EventoDettatura.Tasto("x", true), EventoDettatura.Errore(RegolaDettatura.ERRORE_NIENTE))
        assertEquals(StatoDettatura.Errore("Non ho sentito niente: riprova."), s)
        assertNull(campo)
        assertEquals(StatoDettatura.PermessoNegato, giro(EventoDettatura.Tasto("x", true), EventoDettatura.Errore(RegolaDettatura.ERRORE_PERMESSI)).first)
        assertTrue(RegolaDettatura.messaggio(RegolaDettatura.ERRORE_RETE).contains("rete"))
    }

    @Test
    fun `il tasto durante l'ascolto ferma, e dopo un errore si riparte`() {
        val (s, _) = giro(EventoDettatura.Tasto("", true), EventoDettatura.Parziale("ciao"), EventoDettatura.Tasto("ciao", true))
        assertEquals(StatoDettatura.Fermo, s)
        val (s2, _) = giro(EventoDettatura.Tasto("", true), EventoDettatura.Errore(RegolaDettatura.ERRORE_SILENZIO), EventoDettatura.Tasto("", true))
        assertTrue(s2 is StatoDettatura.Ascolto)
    }

    @Test
    fun `il testo nel campo unisce senza doppi spazi`() {
        assertEquals("a b c", RegolaDettatura.testoNelCampo("a  ", "  b   c "))
        assertEquals("solo", RegolaDettatura.testoNelCampo("", "solo"))
        assertEquals("prima", RegolaDettatura.testoNelCampo("prima", ""))
    }
}
