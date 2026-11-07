package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MenuSpecialistiTest {
    private val adesso = java.time.Instant.parse("2026-01-01T12:00:00Z").toEpochMilli()

    private val json = """{"posti":{"usati":2,"tetto":2},
      "alLavoro":[
        {"posto":1,"id":"a","workspace":"/lavoro/altro","workspaceNome":"altro","compito":"k-1","descrizione":"prova","titolo":"Provare tutto","cosaFa":"scrive i test","tipo":"general","dal":"2026-01-01T11:50:00Z","percentuale":40,"minutiStimati":15,"precedenza":2},
        {"posto":2,"id":"b","workspace":"/lavoro/demo","compito":"k-2","descrizione":"bis","tipo":"general","dal":"2026-01-01T11:00:00Z","percentuale":95,"minutiStimati":5,"inRitardo":true,"fermaRichiesta":true}],
      "inFila":[
        {"id":"x","posizione":1,"workspace":"/lavoro/demo","descrizione":"uno","tipo":"general","dal":"2026-01-01T11:00:00Z","priorita":0,"prenotata":true,"minutiStimati":70},
        {"id":"y","posizione":2,"workspace":"/lavoro/altro","descrizione":"due","tipo":"general","dal":"2026-01-01T11:59:50Z","priorita":0,"prenotata":false,"parcheggiata":true}],
      "totale":{"minuti":95,"compiti":4}}"""

    private fun vista() = Api.json.decodeFromString(VistaAttesaApp.serializer(), json)

    @Test
    fun `il menu mette per primi quelli di questa chat`() {
        val m = MenuSpecialisti.menu(vista(), listOf("\\Lavoro\\Demo\\", ""))
        assertEquals("Specialisti 2 · 2 in fila", m.etichetta)
        assertEquals(listOf("b", "a"), m.lavorano.map { it.id })
        assertTrue(m.lavorano[0].corrente)
        assertEquals("", m.lavorano[0].altroWorkspace)
        assertEquals("altro", m.lavorano[1].altroWorkspace)
        assertEquals("circa 1 h 35 min per finire tutto", m.totale)
    }

    @Test
    fun `percentuale cosa fa e tempo`() {
        val m = MenuSpecialisti.menu(vista(), listOf("demo"))
        val a = m.lavorano.first { it.id == "a" }
        assertEquals("Provare tutto", a.titolo)
        assertEquals(40, a.percentuale)
        assertEquals("scrive i test", a.cosaFa)
        assertEquals("mancano circa 15 min", a.manca)
        val b = m.lavorano.first { it.id == "b" }
        assertEquals("k-2: bis", b.titolo)
        assertTrue(b.inRitardo)
        assertTrue(b.fermaRichiesta)
    }

    @Test
    fun `chi e in fila ha il posto e non la percentuale`() {
        val m = MenuSpecialisti.menu(vista(), listOf("/lavoro/demo"))
        assertEquals(listOf(1, 2), m.inFila.map { it.posizione })
        assertNull(m.inFila[0].percentuale)
        assertEquals("attesa circa 1 h 10 min", m.inFila[0].manca)
        assertTrue(m.inFila[0].prenotata)
        assertTrue(m.inFila[1].parcheggiata)
    }

    @Test
    fun `lista vuota`() {
        val m = MenuSpecialisti.menu(VistaAttesaApp(posti = PostiAttesa(0, 2)), emptyList())
        assertEquals("Specialisti · nessuno", m.etichetta)
        assertEquals("", m.totale)
    }

    @Test
    fun `la schermata ha stima e totale`() {
        val s = SpecialistiAttesa.schermata(vista(), adesso)
        assertEquals("Circa 1 h 35 min per finire tutto · 4 compiti", s.totale)
        val a = s.alLavoro[0]
        assertEquals(40, a.percentuale)
        assertEquals("mancano circa 15 min", a.stima)
        assertTrue(a.puoFermare)
        assertEquals("altro · general · lavora da 10 min · precedenza 2", a.dettaglio)
        assertFalse(s.alLavoro[1].puoFermare)
        assertEquals("mancano circa 5 min · in ritardo", s.alLavoro[1].stima)
        assertTrue(s.inFila[0].dettaglio.contains("circa 1 h 10 min per finire"))
        assertTrue(s.inFila[1].dettaglio.startsWith("altro · fermato, riparte per primo"))
    }

    @Test
    fun `un servizio vecchio senza stime non rompe niente`() {
        val v = Api.json.decodeFromString(VistaAttesaApp.serializer(), """{"posti":{"usati":1,"tetto":2},"alLavoro":[{"posto":1,"id":"a","workspace":"w","descrizione":"d","tipo":"t","dal":"2026-01-01T11:50:00Z"}],"inFila":[]}""")
        val s = SpecialistiAttesa.schermata(v, adesso)
        assertEquals("", s.totale)
        assertNull(s.alLavoro[0].percentuale)
        assertEquals("", s.alLavoro[0].stima)
        assertEquals("Specialisti 1", MenuSpecialisti.menu(v, emptyList()).etichetta)
    }

    @Test
    fun `i testi dei minuti`() {
        assertEquals("meno di 1 min", SpecialistiAttesa.minutiTesto(0.2))
        assertEquals("1 h", SpecialistiAttesa.minutiTesto(60.0))
        assertEquals("Meno di 1 min per finire tutto · 1 compito", SpecialistiAttesa.totaleTesto(0.0, 1))
    }
}
