package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
    fun `il riassunto della rimozione e le cartelle in recupero`() {
        assertEquals("attesa-conferma", p.rimozione.stati.single().fase)
        assertEquals("C:\\Progetti\\Vecchio", p.rimozione.inRecupero.single().percorsoOriginale)
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
    fun `il cambio di residente di un progetto porta anche lo stato voluto`() {
        val s = PannelloDriveRegole.sessioniProgetto(p, "prog-g")
        assertTrue(s.contains("progetto:prog-g"))
        assertFalse(s.isEmpty())
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
        assertTrue(Scheda.entries.indexOf(Scheda.PROGETTI) < Scheda.entries.indexOf(Scheda.COMPUTER))
    }
}
