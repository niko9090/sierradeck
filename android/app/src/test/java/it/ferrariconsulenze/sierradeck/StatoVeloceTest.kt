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

/**
 * La velocità della 0.83.0, seconda parte: la copia dell'ultimo stato
 * all'apertura (a), lo stato decodificato solo se cambia (b), le chiavi
 * stabili delle liste (c) e le attese del Drive ferme con l'app dietro (d).
 * Indirizzi d'esempio (192.0.2.x, riservati alla documentazione).
 */
class StatoVeloceTest {
    private val cartellaSorgenti = File("src/main/java/it/ferrariconsulenze/sierradeck")
    private fun sorgente(nome: String) = File(cartellaSorgenti, nome).readText()

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

    @Test fun `a - all'apertura la copia si legge fuori dal thread dello schermo, e il primo stato vero la sostituisce`() {
        val app = sorgente("App.kt")
        assertTrue(app.contains("withContext(Dispatchers.IO) { CopiaStato.leggi(contesto.filesDir, indirizzo) }"))
        assertTrue(app.contains("if (stato == null && copia != null) { stato = copia; daCopia = true"))
        assertTrue(app.contains("if (cambiato || daCopia) { stato = letto; daCopia = false }"))
        assertTrue(app.contains("launch(Dispatchers.IO) { CopiaStato.salva(contesto.filesDir, indirizzo, grezzo) }"))
        assertTrue(sorgente("Postazioni.kt").contains("CopiaStato.dimentica(contesto.filesDir, indirizzo)"))
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

    // ─── (c) chiavi stabili ───

    @Test fun `c - chiavi uniche anche per righe uguali, e stabili aggiungendo in fondo`() {
        val m = listOf(MessaggioConversazione(da = "tu", testo = "ok"), MessaggioConversazione(da = "tu", testo = "ok"))
        val chiavi = ChiaviElenco.di(m, ChiaviElenco::messaggio)
        assertEquals(2, chiavi.toSet().size)
        val dopo = ChiaviElenco.di(m + MessaggioConversazione(da = "lui", testo = "fatto"), ChiaviElenco::messaggio)
        assertEquals(chiavi, dopo.take(2))
        // Una battuta che si ripete cambia `volte`, non la chiave.
        assertEquals(ChiaviElenco.battuta(Battuta("10:00", "lui", "provo", volte = 1)), ChiaviElenco.battuta(Battuta("10:00", "lui", "provo", volte = 3)))
        for (f in listOf("Conversazioni.kt", "DettaglioAutopilota.kt")) {
            assertFalse("$f: una lista senza chiave", Regex("""\bitems\((?![^)]*key\s*=)""").containsMatchIn(sorgente(f)))
        }
    }

    // ─── (d) il Drive con l'app dietro ───

    @Test fun `d - le attese del Drive si fermano con l'app dietro e ripartono davanti`() = runBlocking {
        // Il ciclo com'è in Drive.kt: chiede, poi Davanti.pausa.
        var chieste = 0
        Davanti.imposta(true)
        val ciclo = launch { while (true) { chieste += 1; Davanti.pausa(10) } }
        delay(100)
        Davanti.imposta(false)
        delay(40)
        val ferme = chieste
        delay(200)
        assertEquals("dietro: nessuna chiamata in più", ferme, chieste)
        Davanti.imposta(true)
        withTimeout(2000) { while (chieste == ferme) delay(5) }
        ciclo.cancel()
        // E nei file: nessuna attesa semplice nei cicli del Drive.
        val drive = sorgente("Drive.kt")
        assertTrue(drive.contains("Davanti.pausa(500)") && drive.contains("Davanti.pausa(2000)"))
        assertFalse(Regex("""\bdelay\(""").containsMatchIn(drive))
        val pannello = sorgente("PannelloDrive.kt")
        assertTrue(pannello.contains("Davanti.pausa(2500); leggi()") && pannello.contains("Davanti.pausa(4000); leggi()"))
        assertFalse(pannello.contains("coroutines.delay("))
    }
}
