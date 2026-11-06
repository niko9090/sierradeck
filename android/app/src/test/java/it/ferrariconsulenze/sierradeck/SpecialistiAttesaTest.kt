package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpecialistiAttesaTest {
    private val adesso = java.time.Instant.parse("2026-01-01T12:00:00Z").toEpochMilli()

    private val json = """{"posti":{"usati":3,"tetto":4},
      "alLavoro":[{"posto":1,"id":"a","workspace":"C:\\lavoro\\demo","compito":"k-1","descrizione":"prova","tipo":"general","dal":"2026-01-01T11:50:00Z"}],
      "inFila":[
        {"id":"x","posizione":1,"workspace":"demo","compito":"k-2","descrizione":"uno","tipo":"general","dal":"2026-01-01T11:00:00Z","priorita":0,"prenotata":true,"prenotataFino":"2026-01-01T12:04:10Z"},
        {"id":"y","posizione":2,"workspace":"demo","descrizione":"due","tipo":"general","dal":"2026-01-01T11:59:50Z","priorita":-2,"prenotata":false}
      ],"extra":1}"""

    @Test
    fun `legge la risposta e fa le righe`() {
        val s = SpecialistiAttesa.schermata(Api.json.decodeFromString(VistaAttesaApp.serializer(), json), adesso)
        assertFalse(s.vecchio)
        assertEquals("3 di 4 posti occupati", s.posti)
        assertEquals("Posto 1", s.alLavoro[0].etichetta)
        assertEquals("demo · general · lavora da 10 min", s.alLavoro[0].dettaglio)
        val f = s.inFila
        assertEquals("k-2 uno", SpecialistiAttesa.titolo(f[0]))
        assertEquals("demo · general · aspetta da 1 h · priorità normale · tocca a lui (ancora 5 min)", f[0].dettaglio)
        assertTrue(f[0].toccaALui)
        assertEquals("due", SpecialistiAttesa.titolo(f[1]))
        assertEquals("demo · general · aspetta da meno di 1 min · priorità bassa 2", f[1].dettaglio)
        assertEquals(listOf(false, true), f.map { it.puoSalire })
        assertEquals(listOf(true, false), f.map { it.puoScendere })
    }

    @Test
    fun `lista vuota e servizio vecchio`() {
        val vuota = SpecialistiAttesa.schermata(VistaAttesaApp(posti = PostiAttesa(0, 2)), adesso)
        assertFalse(vuota.vecchio)
        assertEquals("0 di 2 posti occupati", vuota.posti)
        assertTrue(vuota.inFila.isEmpty() && vuota.alLavoro.isEmpty())
        assertTrue(SpecialistiAttesa.schermata(VistaAttesaApp(), adesso).vecchio)
    }

    @Test
    fun `i testi dei tempi`() {
        assertEquals("2 h 10 min", SpecialistiAttesa.daQuanto("2026-01-01T09:50:00Z", adesso))
        assertEquals("3 giorni", SpecialistiAttesa.daQuanto("2025-12-29T12:00:00Z", adesso))
        assertEquals("", SpecialistiAttesa.daQuanto("boh", adesso))
        assertEquals("30 s", SpecialistiAttesa.quantoManca("2026-01-01T12:00:30Z", adesso))
        assertEquals("scaduta", SpecialistiAttesa.quantoManca("2026-01-01T11:59:00Z", adesso))
        assertEquals("", SpecialistiAttesa.quantoManca(null, adesso))
        assertEquals("1 di 1 posto occupato", SpecialistiAttesa.postiTesto(1, 1))
        assertEquals("alta 3", SpecialistiAttesa.prioritaTesto(3))
        assertEquals("demo", SpecialistiAttesa.nomeWorkspace("C:\\x\\demo\\"))
        assertEquals("senza nome", SpecialistiAttesa.nomeWorkspace(""))
    }
}
