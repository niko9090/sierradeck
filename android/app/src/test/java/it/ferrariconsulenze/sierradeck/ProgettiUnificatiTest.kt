package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * App 2.60.0 sulla risposta di un PC alla 0.60.0 (`pannello-0.60.json`, scritta
 * da `tests/shared/pannello-drive-app.test.ts` con le funzioni vere del PC su
 * dati d'esempio): stesso nome = stesso progetto, «Rendi residente» con il
 * riassunto da confermare, le unioni annullabili, le chat senza nome nascoste.
 */
class ProgettiUnificatiTest {
    private val p: PannelloDrive = Api.json.decodeFromString(
        PannelloDrive.serializer(),
        javaClass.classLoader!!.getResource("pannello-drive/pannello-0.60.json")!!.readText()
    )

    @Test
    fun `due voci del registro con lo stesso nome sono un progetto solo`() {
        val g = p.progetti.single()
        assertEquals("Gestionale", g.nome)
        assertEquals(listOf("prog-g", "prog-g2"), g.ids)
        assertEquals(listOf("Gestionale", "gestionale (2)"), g.workspace)
        assertTrue(g.problemi.any { it.tipo == "progetto-doppio" })
        val doppi = PannelloDriveRegole.doppi(g)
        assertNotNull(doppi)
        assertTrue(doppi!!.contains("2 voci nel registro del Drive"))
        assertTrue(doppi.contains("«gestionale (2)»"))
    }

    @Test
    fun `Rendi residente qui e' il trasloco, con il testo del PC (0_65)`() {
        val a = p.progetti.single().azioni.first { it.id == "residente-qui" }
        assertEquals("Conferma: trasloca qui", a.conferma)
        assertTrue(a.testo.contains("solo alla fine le copie vecchie vanno nel recupero"))
        assertTrue(a.testo.contains("Niente si cancella"))
    }

    @Test
    fun `il riassunto da confermare si legge e si mostra per esteso`() {
        val st = PannelloDriveRegole.residenza(p, "prog-g")
        assertNotNull(st)
        assertEquals("attesa-conferma", st!!.fase)
        assertEquals("Riassunto: cosa unisco, cosa tengo, cosa va in recupero", PannelloDriveRegole.titoloResidenza(st.fase))
        val righe = st.riassunto!!.righe
        assertTrue(righe.any { it.contains("«gestionale (2)» entra in «Gestionale»") })
        assertTrue(righe.any { it.contains("nessun file cancellato") })
        assertFalse(PannelloDriveRegole.lavora(p))
    }

    @Test
    fun `le unioni fatte si annullano`() {
        val u = p.unioni.single()
        assertEquals("Sito", u.nome)
        assertEquals("prog-s", u.progetto)
    }

    @Test
    fun `le chat senza nome sono nascoste, contate nel progetto, e la casella le rimette`() {
        assertEquals(1, PannelloDriveRegole.nascoste(p))
        assertEquals(1, p.progetti.single().chatSenzaNome)
        assertFalse(PannelloDriveRegole.chat(p, "tutti").any { it.senzaNome })
        assertTrue(PannelloDriveRegole.chat(p, "tutti", senzaNome = true).any { it.senzaNome })
        assertEquals("☐ mostra anche le chat senza nome (3, nascoste: non sono cancellate)", ChatSenzaNome.testo(false, 3))
        val s = Api.json.decodeFromString(Sessioni.serializer(), "{\"sessioni\":[{\"id\":\"a\",\"titolo\":\"Fatture\"}],\"nascoste\":2}")
        assertEquals(2, s.nascoste)
        // Un PC prima della 0.60 non manda `nascoste`: zero, niente casella.
        assertEquals(0, Api.json.decodeFromString(Sessioni.serializer(), "{\"sessioni\":[]}").nascoste)
    }

    @Test
    fun `un PC alla 0_58 si legge ancora - nessun gruppo, nessun riassunto`() {
        val vecchio = Api.json.decodeFromString(PannelloDrive.serializer(), javaClass.classLoader!!.getResource("pannello-drive/pannello-0.58.json")!!.readText())
        assertTrue(vecchio.residenza.isEmpty())
        assertTrue(vecchio.progetti.single().ids.isEmpty())
        assertNull(PannelloDriveRegole.doppi(vecchio.progetti.single()))
    }

    @Test
    fun `il pannello del Drive aspetta a lungo - anche attraverso il ponte (PC 0_60_2)`() {
        // Collaudo dell'11/10: il pannello ci mette 15 secondi sul PC, quanto
        // l'attesa di sempre dell'app; attraverso il ponte non arrivava mai.
        assertTrue("/api/drive/pannello" in Api.ROTTE_LENTE)
        assertTrue("/api/drive/azione" in Api.ROTTE_LENTE)
        assertTrue("/api/drive/pannello" in Ponte.ROTTE)
        assertTrue(Api.LENTE_SECONDI >= 60)
    }
}
