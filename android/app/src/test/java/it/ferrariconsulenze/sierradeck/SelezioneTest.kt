package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La scelta del computer dal selettore in alto (app 2.52.2). Nicholas (07/10):
 * «Io seleziono un altro pc e il programma va sempre in errore e mi dice che
 * sta provando a connettersi a quello che è già connesso». Solo indirizzi di esempio.
 */
class SelezioneTest {
    private val a = "http://192.168.1.20:7420"
    private val b = "http://100.101.102.103:7420"

    @Test
    fun `da A a B si collega solo a B, con i soli indirizzi di B`() {
        val (s, m) = Selezione.tocca(Selezione.iniziale(a), b)
        assertEquals(b, s.scelto)
        assertEquals("provo", s.esito)
        m as MossaSelezione.Collegati
        assertEquals(b, m.indirizzo)
        assertEquals(listOf(b), m.indirizzi)
        assertTrue(a !in m.indirizzi)
        assertEquals(s.gen, m.gen)
    }

    @Test
    fun `cambi rapidi A, B, A - i tentativi vecchi non contano piu`() {
        var s = Selezione.iniziale(a)
        val (s1, m1) = Selezione.tocca(s, b); s = s1
        val (s2, m2) = Selezione.tocca(s, a); s = s2
        m1 as MossaSelezione.Collegati; m2 as MossaSelezione.Collegati
        assertEquals(a, s.scelto)
        assertTrue(m2.gen > m1.gen)
        // Il tentativo verso B arriva tardi: non cambia niente.
        assertEquals(s, Selezione.esito(s, m1.gen, b, true))
        assertEquals("provo", Selezione.esito(s, m1.gen, b, false).esito)
        // Quello verso A conta.
        assertEquals("collegato", Selezione.esito(s, m2.gen, a, true).esito)
    }

    @Test
    fun `tocco sul computer gia scelto - non succede niente`() {
        val s = Selezione.iniziale(a)
        val (dopo, m) = Selezione.tocca(s, a)
        assertEquals(MossaSelezione.Niente, m)
        assertEquals(s, dopo)
    }

    @Test
    fun `B che fallisce resta su B, con Riprova verso B`() {
        val (s1, m1) = Selezione.tocca(Selezione.iniziale(a), b)
        m1 as MossaSelezione.Collegati
        val fallito = Selezione.esito(s1, m1.gen, b, false)
        assertEquals(b, fallito.scelto)
        assertEquals("fallito", fallito.esito)
        val (s2, m2) = Selezione.riprova(fallito)
        m2 as MossaSelezione.Collegati
        assertEquals(b, s2.scelto)
        assertEquals(listOf(b), m2.indirizzi)
        // Nessun indirizzo per una postazione vuota: niente ripieghi.
        assertEquals(emptyList<String>(), Selezione.indirizziDi(""))
    }
}
