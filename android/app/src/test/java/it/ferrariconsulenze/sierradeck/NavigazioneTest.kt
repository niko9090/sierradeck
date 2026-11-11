package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.radice.Dettaglio
import it.ferrariconsulenze.sierradeck.schermate.radice.Navigazione
import it.ferrariconsulenze.sierradeck.schermate.radice.Richiesta
import it.ferrariconsulenze.sierradeck.schermate.radice.SezioneAltro
import it.ferrariconsulenze.sierradeck.schermate.radice.VoceBarra
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Scheda
import it.ferrariconsulenze.sierradeck.schermate.vecchie.sezioniAutopilota

/**
 * Le tre voci (Lavoro · File · Altro) e «indietro»: la regola è in
 * `Navigazione`, pura, e si prova qui senza Compose.
 */
class NavigazioneTest {
    private val telefono = Api.json.parseToJsonElement(File("src/main/assets/menu.json").readText()).jsonObject["telefono"]!!.jsonArray.map { it.jsonObject }

    @Test
    fun `tre voci, si apre su Lavoro e da Lavoro indietro esce`() {
        assertEquals(listOf("Lavoro", "File", "Altro"), VoceBarra.entries.map { it.nome })
        assertEquals(VoceBarra.LAVORO, Navigazione.INIZIO.voce)
        assertNull(Navigazione.indietro(Navigazione.INIZIO))
    }

    @Test
    fun `ogni voce di prima del PC ha un posto nelle tre`() {
        for (v in telefono) {
            val id = v["id"]!!.jsonPrimitive.content
            assertNotNull("la voce «$id» di menu.json non ha più casa", VoceBarra.daVoceDiPrima(id))
        }
    }

    @Test
    fun `indietro chiude i dettagli uno alla volta, poi torna a Lavoro`() {
        var p = Navigazione.apri(Navigazione.INIZIO, Dettaglio.Sezione(SezioneAltro.CHAT))
        assertEquals(VoceBarra.ALTRO, p.voce)
        p = Navigazione.apri(p, Dettaglio.Sezione(SezioneAltro.INFO))
        p = Navigazione.indietro(p)!!
        assertEquals(Dettaglio.Sezione(SezioneAltro.CHAT), p.dettaglio)
        p = Navigazione.indietro(p)!!
        assertNull(p.dettaglio)
        assertEquals(VoceBarra.ALTRO, p.voce)
        assertEquals(VoceBarra.LAVORO, Navigazione.indietro(p)!!.voce)
    }

    @Test
    fun `ogni voce ricorda i suoi dettagli, il secondo tocco torna all inizio`() {
        var p = Navigazione.apri(Navigazione.INIZIO, Dettaglio.Chat("c1"))
        p = Navigazione.tocca(p, VoceBarra.FILE)
        assertNull(p.dettaglio)
        p = Navigazione.tocca(p, VoceBarra.LAVORO)
        assertEquals(Dettaglio.Chat("c1"), p.dettaglio)
        p = Navigazione.tocca(p, VoceBarra.LAVORO)
        assertNull(p.dettaglio)
    }

    @Test
    fun `lo stesso dettaglio due volte non si impila`() {
        var p = Navigazione.apri(Navigazione.INIZIO, Dettaglio.Chat("c1"))
        p = Navigazione.apri(p, Dettaglio.Chat("c1"))
        assertEquals(1, p.pila.size)
    }

    @Test
    fun `le notifiche e le destinazioni di prima portano al posto giusto`() {
        val da = Navigazione.apri(Navigazione.INIZIO, Dettaglio.Sezione(SezioneAltro.INFO))
        Navigazione.verso(da, Richiesta.Domanda("d1")).let { assertEquals(VoceBarra.LAVORO, it.voce); assertEquals(Dettaglio.Domanda("d1"), it.dettaglio) }
        Navigazione.verso(da, Richiesta.Chat("c")).let { assertEquals(listOf(Dettaglio.Chat("c")), it.pila) }
        Navigazione.verso(da, Richiesta.Cartella("p", "a/b")).let { assertEquals(VoceBarra.FILE, it.voce) }
        Navigazione.verso(da, Richiesta.Aggiornamenti).let { assertEquals(Dettaglio.Sezione(SezioneAltro.AGGIORNAMENTI), it.dettaglio) }
        for (s in listOf(Scheda.DOMANDE, Scheda.AUTOPILOTI, Scheda.CHAT, Scheda.PROGETTI)) assertEquals(VoceBarra.LAVORO, Navigazione.verso(da, s).voce)
        assertEquals(VoceBarra.FILE, Navigazione.verso(da, Scheda.FILE).voce)
        assertEquals(Dettaglio.Sezione(SezioneAltro.SALUTE), Navigazione.verso(da, Scheda.SALUTE).dettaglio)
        Navigazione.verso(da, Scheda.IMPOSTAZIONI).let { assertEquals(VoceBarra.ALTRO, it.voce); assertNull(it.dettaglio) }
    }

    @Test
    fun `il posto si salva e si riprende uguale`() {
        var p = Navigazione.apri(Navigazione.INIZIO, Dettaglio.Chat("c|1"))
        p = Navigazione.apri(p, Dettaglio.Cartella("prog", "a|b/c"))
        p = Navigazione.apri(p, Dettaglio.Sezione(SezioneAltro.DRIVE))
        val ripreso = Navigazione.riprendi(Navigazione.salva(p))
        assertEquals(p.voce, ripreso.voce)
        assertEquals(p.pile, ripreso.pile)
        assertEquals(p.pile[VoceBarra.ALTRO], ripreso.pile[VoceBarra.ALTRO])
        assertEquals(Navigazione.INIZIO, Navigazione.riprendi(null))
        assertEquals(Navigazione.INIZIO, Navigazione.riprendi(listOf("robaccia", "voce|nessuna")))
    }

    @Test
    fun `le impostazioni trovate con Cerca aprono la sezione giusta`() {
        for (s in SezioneAltro.entries) s.impostazione?.let { assertEquals(it, s, SezioneAltro.diImpostazione(it)) }
        assertEquals(SezioneAltro.DRIVE, SezioneAltro.diImpostazione("chat", "quaderno-personale"))
        assertEquals(SezioneAltro.INFO, SezioneAltro.diImpostazione("sconosciuta"))
    }

    @Test
    fun `le parti dell autopilota stanno in una pagina, le domande per prime`() {
        assertEquals("domande", sezioniAutopilota(1).first())
        assertFalse("domande" in sezioniAutopilota(0))
        assertEquals(listOf("avanzamento", "file"), sezioniAutopilota(0))
    }

    @Test fun richiestaFileEWorkspace() {
        assertEquals(VoceBarra.FILE, Navigazione.verso(Navigazione.INIZIO, Richiesta.File).voce)
        assertEquals(Dettaglio.Autopilota("a1"), Navigazione.verso(Navigazione.INIZIO, Richiesta.Autopilota("a1")).dettaglio)
    }
}
