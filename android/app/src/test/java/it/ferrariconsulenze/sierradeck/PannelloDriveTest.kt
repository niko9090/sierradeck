package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il pannello delle chat e dei progetti del Drive (app 2.58.0) sulla risposta
 * di un PC alla 0.58.0 fatta dalle funzioni vere su dati d'esempio
 * (`tests/shared/pannello-drive-app.test.ts` controlla che sia la stessa).
 */
class PannelloDriveTest {
    private val p: PannelloDrive = Api.json.decodeFromString(
        PannelloDrive.serializer(),
        javaClass.classLoader!!.getResource("pannello-drive/pannello-0.58.json")!!.readText()
    )

    @Test
    fun `la risposta del PC si legge, con le azioni e i testi del PC`() {
        val g = p.progetti.single()
        assertEquals("Gestionale", g.nome)
        assertEquals("PORTATILE-ESEMPIO", g.residente?.nome)
        assertTrue(g.voluto)
        assertTrue(g.cartellaQui)
        assertEquals(listOf("apri", "residente-qui", "solo-cloud-qui"), g.azioni.map { it.id })
        assertTrue(g.azioni.first { it.id == "solo-cloud-qui" }.testo.contains("cartella di recupero"))
        assertEquals(listOf("PC-VECCHIO"), p.pcDaAggiornare)
    }

    @Test
    fun `le cartelle in recupero si leggono (gli stati della rimozione non ci sono più, PC 0_88)`() {
        assertEquals("C:\\Progetti\\Vecchio", p.rimozione.inRecupero.single().percorsoOriginale)
    }

    @Test
    fun `un PC alla 0_88 - un PC per progetto, Apri su e Sposta su questo PC fra le azioni`() {
        val n = Api.json.decodeFromString(PannelloDrive.serializer(), javaClass.classLoader!!.getResource("pannello-drive/pannello-0.88.json")!!.readText())
        val g = n.progetti.first { it.id == "prog-g" }
        assertEquals(listOf("apri-remoto", "sposta-qui"), g.azioni.map { it.id })
        assertEquals("Apri su PORTATILE-ESEMPIO", g.azioni.first().titolo)
        assertEquals(listOf("apri"), n.progetti.first { it.id == "prog-s" }.azioni.map { it.id })
    }

    @Test
    fun `i filtri sono quelli del PC`() {
        assertEquals(1, PannelloDriveRegole.progetti(p, "tutti").size)
        assertEquals(0, PannelloDriveRegole.progetti(p, "questo-pc").size)
        assertEquals(0, PannelloDriveRegole.progetti(p, "solo-cloud").size)
        val sbagliate = PannelloDriveRegole.chat(p, "sbagliati")
        assertTrue(sbagliate.all { it.problemi.isNotEmpty() })
        assertTrue(PannelloDriveRegole.chat(p, "tutti").size >= 2)
    }

    @Test
    fun `un PC vecchio - la funzione è spenta, non un errore secco`() {
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.PANNELLO_DRIVE, "0.57.3"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.PANNELLO_DRIVE, "0.58.0"))
        val letto = Api.json.decodeFromString(PannelloDrive.serializer(), "{\"io\":{\"id\":\"a\",\"nome\":\"A\"},\"campoNuovo\":1}")
        assertTrue(letto.progetti.isEmpty())
    }

    @Test
    fun `Progetti è una voce propria della barra in basso`() {
        assertTrue(Scheda.entries.contains(Scheda.PROGETTI))
        // 0.61.0: Progetti è la prima voce del menu principale.
        assertTrue(Scheda.entries.indexOf(Scheda.PROGETTI) == 0)
    }

    @Test
    fun `lo spazio sul Drive di un progetto, con i file grandi come avviso (PC 0_69)`() {
        val r = Api.json.decodeFromString(RigaProgettoDrive.serializer(),
            """{"id":"p1","nome":"Video","spazioDrive":{"file":2,"byte":31457380,"grandi":[{"percorso":"video.mp4","byte":31457280}]}}""")
        assertEquals(" · sul Drive 30 MB · ⚠ 1 file grande: video.mp4", PannelloDriveRegole.spazio(r))
        assertEquals("", PannelloDriveRegole.spazio(RigaProgettoDrive(id = "p2")))
    }
}
