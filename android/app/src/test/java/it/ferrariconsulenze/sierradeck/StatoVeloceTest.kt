package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import it.ferrariconsulenze.sierradeck.dati.ChiaviElenco
import it.ferrariconsulenze.sierradeck.dati.CopiaStato
import it.ferrariconsulenze.sierradeck.dati.PolsoApp
import it.ferrariconsulenze.sierradeck.dati.StatoSoloSeCambia
import it.ferrariconsulenze.sierradeck.nucleo.Adesso
import it.ferrariconsulenze.sierradeck.nucleo.Battuta
import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.nucleo.Domanda
import it.ferrariconsulenze.sierradeck.nucleo.MessaggioConversazione
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Linea
import it.ferrariconsulenze.sierradeck.schermate.vecchie.DomandeAdesso

/**
 * La velocità della 0.83.0, seconda parte: la copia dell'ultimo stato
 * all'apertura (a), lo stato decodificato solo se cambia (b), le chiavi
 * stabili delle liste (c) e le attese del Drive ferme con l'app dietro (d).
 * Indirizzi d'esempio (192.0.2.x, riservati alla documentazione).
 */
class StatoVeloceTest {

    private fun statoJson(vararg chat: String, domande: Int = 0) =
        """{"chat":[${chat.joinToString(",") { """{"id":"$it","titolo":"Prova $it"}""" }}],"domandeInAttesa":$domande}"""

    @After fun rimetti() = Davanti.imposta(true)

    // ─── (a) la copia dell'ultimo stato ───

    @Test fun `a - la copia salvata si rilegge, una per computer`() {
        val cartella = Files.createTempDirectory("copia-stato").toFile()
        assertNull("niente copia: niente stato", CopiaStato.leggi(cartella, "192.0.2.1:47600"))
        assertTrue(CopiaStato.salva(cartella, "192.0.2.1:47600", statoJson("a", "b")))
        assertTrue(CopiaStato.salva(cartella, "192.0.2.2:47600", statoJson("z")))
        assertEquals(listOf("a", "b"), CopiaStato.leggi(cartella, "192.0.2.1:47600")!!.chat.map { it.id })
        assertEquals(listOf("z"), CopiaStato.leggi(cartella, "192.0.2.2:47600")!!.chat.map { it.id })
        // Si riscrive sopra la vecchia, senza lasciare file a metà.
        assertTrue(CopiaStato.salva(cartella, "192.0.2.1:47600", statoJson("c")))
        assertEquals(listOf("c"), CopiaStato.leggi(cartella, "192.0.2.1:47600")!!.chat.map { it.id })
        assertTrue(cartella.listFiles()!!.none { it.name.endsWith(".tmp") })
        // L'indirizzo non finisce nel nome del file.
        assertTrue(cartella.listFiles()!!.none { it.name.contains("192") })
        // Dimenticato il computer, la sua copia sparisce; l'altra resta.
        CopiaStato.dimentica(cartella, "192.0.2.1:47600")
        assertNull(CopiaStato.leggi(cartella, "192.0.2.1:47600"))
        assertNotNull(CopiaStato.leggi(cartella, "192.0.2.2:47600"))
    }

    @Test fun `a - una copia rovinata non si mostra`() {
        val cartella = Files.createTempDirectory("copia-rovinata").toFile()
        CopiaStato.file(cartella, "192.0.2.3:47600").writeText("{\"chat\":[{\"id\":")
        assertNull(CopiaStato.leggi(cartella, "192.0.2.3:47600"))
    }

    // ─── (b) solo quello che cambia ───

    @Test fun `b - lo stesso testo non si decodifica di nuovo e torna lo stesso oggetto`() {
        val s = StatoSoloSeCambia { Api.json.decodeFromString<Stato>(it) }
        val (primo, cambiato1) = s.leggi(statoJson("a", "b"))
        assertTrue(cambiato1)
        val (secondo, cambiato2) = s.leggi(statoJson("a", "b"))
        assertFalse(cambiato2)
        assertSame(primo, secondo)
        assertEquals(1, s.decodifiche)
    }

    @Test fun `b - cambia un numero, le chat restano lo stesso oggetto`() {
        val s = StatoSoloSeCambia { Api.json.decodeFromString<Stato>(it) }
        val (primo, _) = s.leggi(statoJson("a", "b", domande = 0))
        val (secondo, cambiato) = s.leggi(statoJson("a", "b", domande = 2))
        assertTrue(cambiato)
        assertEquals(2, secondo.domandeInAttesa)
        assertSame("le chat uguali non sono una lista nuova", primo.chat, secondo.chat)
        // Cambiano le chat: lista nuova.
        val (terzo, _) = s.leggi(statoJson("a", "c", domande = 2))
        assertFalse(terzo.chat === secondo.chat)
        assertEquals(listOf("a", "c"), terzo.chat.map { it.id })
    }

    @Test fun `b - partendo dalla copia, uno stato vero uguale non ridisegna niente`() {
        val copia = Api.json.decodeFromString<Stato>(statoJson("a"))
        val s = StatoSoloSeCambia { Api.json.decodeFromString<Stato>(it) }
        s.parteDa(copia)
        val (letto, cambiato) = s.leggi(statoJson("a"))
        assertSame(copia, letto)
        assertFalse(cambiato)
    }

    @Test fun `b - Adesso rilegge le domande solo quando lo stato dice che sono cambiate`() {
        val base = Api.json.decodeFromString<Stato>("""{"chat":[{"id":"a","ultimaRiga":"lavoro 1"}],"domandeInAttesa":1,"domande":[{"id":"d1","testo":"Vado?"}]}""")
        // Una chat al lavoro che scrive una riga nuova non è una domanda.
        assertEquals(DomandeAdesso.firma(base), DomandeAdesso.firma(base.copy(chat = listOf(base.chat[0].copy(ultimaRiga = "lavoro 2")))))
        // Una domanda nuova, una chat che si ferma su una scelta: si rilegge.
        assertFalse(DomandeAdesso.firma(base) == DomandeAdesso.firma(base.copy(domande = base.domande + Domanda("d2", testo = "E poi?"))))
        assertFalse(DomandeAdesso.firma(base) == DomandeAdesso.firma(base.copy(chat = listOf(base.chat[0].copy(chiede = true)))))
    }

    @Test fun `b - stato fermo da tre giri, il prossimo fra 5 s, se cambia di nuovo ogni 2 s`() {
        assertEquals(2000L, PolsoApp.davantiOgni(0))
        assertEquals(2000L, PolsoApp.davantiOgni(2))
        assertEquals(5000L, PolsoApp.davantiOgni(3))
        assertTrue("sotto la soglia della linea lenta", PolsoApp.CALMO_OGNI_MS < Linea.LENTA_DOPO_MS)
    }

    // ─── (c) chiavi stabili ───

    @Test fun `c - chiavi uniche anche per righe uguali, e stabili aggiungendo in fondo`() {
        val m = listOf(MessaggioConversazione(da = "tu", testo = "ok"), MessaggioConversazione(da = "tu", testo = "ok"))
        val chiavi = ChiaviElenco.di(m, ChiaviElenco::messaggio)
        assertEquals(2, chiavi.toSet().size)
        val dopo = ChiaviElenco.di(m + MessaggioConversazione(da = "lui", testo = "fatto"), ChiaviElenco::messaggio)
        assertEquals(chiavi, dopo.take(2))
        // Una battuta che si ripete cambia `volte`, non la chiave.
        assertEquals(ChiaviElenco.battuta(Battuta("10:00", "lui", "provo", volte = 1)), ChiaviElenco.battuta(Battuta("10:00", "lui", "provo", volte = 3)))
    }

    // ─── (d) il Drive con l'app dietro ───

}
