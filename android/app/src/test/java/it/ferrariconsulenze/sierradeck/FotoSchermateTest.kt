package it.ferrariconsulenze.sierradeck

import android.app.Application
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onLast
import com.github.takahirom.roborazzi.captureRoboImage
import it.ferrariconsulenze.sierradeck.nucleo.AdessoTelefono
import it.ferrariconsulenze.sierradeck.nucleo.AutopilotaBreve
import it.ferrariconsulenze.sierradeck.nucleo.AvanzamentoTelefono
import it.ferrariconsulenze.sierradeck.nucleo.Battuta
import it.ferrariconsulenze.sierradeck.nucleo.Chat
import it.ferrariconsulenze.sierradeck.nucleo.ComponiLavoro
import it.ferrariconsulenze.sierradeck.nucleo.ComponiWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.Conversazione
import it.ferrariconsulenze.sierradeck.nucleo.Decisa
import it.ferrariconsulenze.sierradeck.nucleo.DomandaBolla
import it.ferrariconsulenze.sierradeck.nucleo.RichiestaCoda
import it.ferrariconsulenze.sierradeck.nucleo.RuoloTelefono
import it.ferrariconsulenze.sierradeck.nucleo.SceltaScheda
import it.ferrariconsulenze.sierradeck.nucleo.SchedaDomanda
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.nucleo.TestaWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.Tono
import it.ferrariconsulenze.sierradeck.nucleo.ViaRisposta
import it.ferrariconsulenze.sierradeck.nucleo.VistaAttesa
import it.ferrariconsulenze.sierradeck.nucleo.VistaCoda
import it.ferrariconsulenze.sierradeck.nucleo.VoceAttesa
import it.ferrariconsulenze.sierradeck.schermate.altro.ElencoAltro
import it.ferrariconsulenze.sierradeck.schermate.altro.CorpoAiuto
import it.ferrariconsulenze.sierradeck.schermate.altro.Scollega
import it.ferrariconsulenze.sierradeck.schermate.altro.TutteLeChat
import it.ferrariconsulenze.sierradeck.schermate.lavoro.CorpoLavoro
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.tema.TemaSierraDeck
import it.ferrariconsulenze.sierradeck.schermate.workspace.ChatDelWorkspace
import it.ferrariconsulenze.sierradeck.schermate.workspace.CorpoWorkspace
import it.ferrariconsulenze.sierradeck.schermate.radice.RigaInAlto
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import it.ferrariconsulenze.sierradeck.schermate.radice.Parola
import it.ferrariconsulenze.sierradeck.schermate.radice.BarraTre
import it.ferrariconsulenze.sierradeck.schermate.radice.VoceBarra
import it.ferrariconsulenze.sierradeck.nucleo.RigheChat
import it.ferrariconsulenze.sierradeck.nucleo.Storia
import it.ferrariconsulenze.sierradeck.nucleo.Scelte
import it.ferrariconsulenze.sierradeck.nucleo.Opzione
import it.ferrariconsulenze.sierradeck.schermate.chat.SchermataDettaglioChat
import androidx.compose.material3.Scaffold
import androidx.compose.foundation.layout.Box
import it.ferrariconsulenze.sierradeck.schermate.file.CorpoFile
import it.ferrariconsulenze.sierradeck.dati.CodaFile
import it.ferrariconsulenze.sierradeck.sottofondo.Ricevuto
import it.ferrariconsulenze.sierradeck.schermate.altro.CorpoDialogoApp
import it.ferrariconsulenze.sierradeck.schermate.altro.FaseApp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.Instant

/**
 * **Le foto delle schermate nuove** (app 11/11), con dati finti e nomi
 * inventati: in `android/app/build/foto-schermate/`. Non confrontano niente:
 * servono a guardarle senza un telefono.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], application = Application::class, qualifiers = "w400dp-h860dp-xhdpi")
class FotoSchermateTest {
    @get:Rule val regola = createComposeRule()

    private val ora = Instant.parse("2026-11-11T10:00:00Z").toEpochMilli()

    private fun foto(nome: String, dialogo: Boolean = false, cosa: @Composable () -> Unit) {
        regola.setContent { TemaSierraDeck { Surface(Modifier.fillMaxSize(), color = Banco.fondo) { cosa() } } }
        // Un dialogo è una finestra a sé: si fotografa quella.
        if (dialogo) regola.onAllNodes(androidx.compose.ui.test.isRoot()).onLast().captureRoboImage("build/foto-schermate/$nome.png")
        else regola.onRoot().captureRoboImage("build/foto-schermate/$nome.png")
    }

    private val autopiloti = listOf(
        AutopilotaBreve(id = "a1", workspace = "Sito delle ricette", adesso = AdessoTelefono("Al lavoro: la pagina dei dolci", "lavora"),
            avanzamento = AvanzamentoTelefono(62, 25), ruoli = listOf(RuoloTelefono("Sviluppo", "#4aa3ff"), RuoloTelefono("Collaudo", "#3cc8c0"))),
        AutopilotaBreve(id = "a2", workspace = "App del meteo", adesso = AdessoTelefono("Fermo: aspetta una tua risposta", "aspetta"), avanzamento = AvanzamentoTelefono(80, null), domande = 1),
        AutopilotaBreve(id = "a3", workspace = "Diario di viaggio", adesso = AdessoTelefono("A riposo: tutto fatto", "riposo"), avanzamento = AvanzamentoTelefono(100, null))
    )

    private fun domanda(chiave: String, testo: String, scelte: List<SceltaScheda>, scade: String? = null, rischiosa: Boolean? = null) = Conversazione(
        chiave = chiave, tipo = "autopilota", titolo = "App del meteo", chiede = true,
        risposta = ViaRisposta(via = "rispondi", domanda = "q-$chiave"),
        scheda = SchedaDomanda(chi = "App del meteo", domanda = testo, scelte = scelte, scadeIl = scade, rischiosa = rischiosa)
    )

    @Test fun lavoroConDomanda() = foto("lavoro-domanda") {
        val c = domanda("d1", "Pubblico la versione nuova dell’app del meteo?",
            listOf(SceltaScheda("Sì, pubblica", consigliata = true), SceltaScheda("Aspetta"), SceltaScheda("Scrivo io", libera = true)), scade = "2026-11-11T10:40:00Z")
        CorpoLavoro(ComponiLavoro.componi(Stato(autopiloti = autopiloti), ora, false, listOf(c), emptyMap(), ora))
    }

    @Test fun lavoroConsenso() = foto("lavoro-consenso") {
        val c = domanda("d2", "Posso superare il limite di oggi per finire i collaudi?",
            listOf(SceltaScheda("No"), SceltaScheda("Sì, questa volta", consigliata = true), SceltaScheda("Sì, sempre")), rischiosa = true)
        CorpoLavoro(ComponiLavoro.componi(Stato(autopiloti = autopiloti), ora, false, listOf(c), emptyMap(), ora))
    }

    @Test fun lavoroVuoto() = foto("lavoro-vuoto") {
        CorpoLavoro(ComponiLavoro.componi(Stato(), ora, false, emptyList(), emptyMap(), ora))
    }

    @Test fun lavoroScollegato() = foto("lavoro-scollegato") {
        CorpoLavoro(ComponiLavoro.componi(Stato(autopiloti = autopiloti), ora - 42 * 60_000, true, emptyList(), emptyMap(), ora))
    }

    @Test fun lavoroMiCollego() = foto("lavoro-mi-collego") {
        CorpoLavoro(ComponiLavoro.componi(null, 0, true, emptyList(), emptyMap(), ora))
    }

    private val testa = TestaWorkspace("Sito delle ricette", "Al lavoro: la pagina dei dolci", Tono.LAVORA, 62, 25, "aggiunta la richiesta della ricerca")

    @Test fun workspaceChat() = foto("workspace-chat") {
        val b = listOf(
            Battuta(da = "tu", testo = "Aggiungi una pagina per i dolci, con le foto grandi."),
            Battuta(da = "lui", testo = "Va bene: la preparo e te la faccio vedere prima di pubblicarla."),
            Battuta(da = "nota", testo = "letto il codice delle pagine"),
            Battuta(da = "nota", testo = "provate le foto su telefono"),
            Battuta(da = "nota", testo = "Fatto: la pagina dei dolci", tono = "fine"),
            Battuta(da = "lui", testo = "Unisco il lavoro della pagina?", decisa = Decisa("programma", "Sì, unisci", "")),
            Battuta(da = "lui", testo = "Le foto le metto in alto o a lato?", domanda = DomandaBolla("q9", listOf("In alto", "A lato"), consigliata = "In alto", scadeIl = "2026-11-11T11:00:00Z"))
        )
        CorpoWorkspace("pc-finto", "a1", testa, ComponiWorkspace.chat(b, ora), true, emptyList(), emptyList(), listOf(ChatDelWorkspace("c1", "Pagina dei dolci")))
    }

    @Test fun workspaceChiLavora() = foto("workspace-chi-lavora") {
        val attesa = VistaAttesa(
            alLavoro = listOf(
                VoceAttesa(id = "s1", workspace = "Sito delle ricette", titoloParole = "La pagina dei dolci", ruoloParole = "Sviluppo", colore = "#4aa3ff", percentuale = 70, minutiStimati = 12.0),
                VoceAttesa(id = "s2", workspace = "Sito delle ricette", titoloParole = "Prova delle foto", ruoloParole = "Collaudo", colore = "#3cc8c0", percentuale = 30, minutiStimati = 8.0)
            ),
            inFila = listOf(VoceAttesa(id = "s3", workspace = "Sito delle ricette", titoloParole = "Rivedere i testi", ruoloParole = "Revisione", colore = "#f283c0", posizione = 1))
        )
        val coda = VistaCoda(richieste = listOf(
            RichiestaCoda("r1", titoloParole = "Pagina dei dolci", stato = "in-corso", percento = 62.0),
            RichiestaCoda("r2", titoloParole = "Ricerca per ingredienti", stato = "in-coda", percento = 0.0)
        ))
        CorpoWorkspace("pc-finto", "a1", testa, emptyList(), true, ComponiWorkspace.chiLavora("Sito delle ricette", attesa, null), ComponiWorkspace.richieste(coda), emptyList(), linguettaIniziale = 1)
    }

    /** La radice intera, come la vede Nicholas: la riga in alto, Lavoro, la barra in basso. */
    @Test fun radiceIntera() = foto("radice-lavoro") {
        Scaffold(
            containerColor = Banco.fondo,
            topBar = { RigaInAlto(PcNoto("pc-finto", "PC dello studio", "x"), Parola("in WiFi", Parola.Tono.BENE), emptyList(), {}, {}, {}) },
            bottomBar = { BarraTre(VoceBarra.LAVORO, 1) {} }
        ) { spazi ->
            Box(Modifier.padding(spazi)) {
                val c = domanda("d1", "Pubblico la versione nuova dell’app del meteo?",
                    listOf(SceltaScheda("Sì, pubblica", consigliata = true), SceltaScheda("Aspetta")), scade = "2026-11-11T10:40:00Z")
                CorpoLavoro(ComponiLavoro.componi(Stato(autopiloti = autopiloti), ora, false, listOf(c), emptyMap(), ora))
            }
        }
    }

    @Test fun dettaglioChat() = foto("chat") {
        val righe = listOf(
            "> Aggiungi la pagina dei dolci",
            "",
            "● Leggo le pagine che ci sono già.",
            "  ⎿  Lette 4 pagine",
            "",
            "● Preparo la pagina con le foto grandi.",
            "  ⎿  Scritta pagine/dolci.html (120 righe)",
            "",
            "Vuoi che la pubblichi adesso?"
        )
        val r = RigheChat().unisci(Storia(da = 40, righe = righe))
        val scelte = Scelte(listOf(Opzione(1, "Sì"), Opzione(2, "No, aspetta")))
        SchermataDettaglioChat(
            "pc-finto", Chat(id = "c1", titolo = "Pagina dei dolci", chiede = true), "c1",
            { Storia(da = 48, righe = listOf("Vuoi che la pubblichi adesso?"), scelte = scelte) }, null, {}, iniziali = r, scelteIniziali = scelte
        )
    }

    @Test fun file() = foto("file") {
        CorpoFile(
            inViaggio = listOf(
                CodaFile.Voce("v1", "pc-finto", "foto-torta.jpg", 2_400_000, null, "autopilota", "a1", "Sito delle ricette", 0, stato = "invio", fatti = 1_500_000),
                CodaFile.Voce("v2", "pc-finto", "menu.pdf", 300_000, null, "autopilota", "a2", "App del meteo", 0, stato = "attesa", messaggio = "spento")
            ),
            ricevuti = listOf(
                Ricevuto("r1", "elenco-ingredienti.txt", "/finto/elenco.txt", 2_048, "PC dello studio", ora, nota = "Quello di ieri"),
                Ricevuto("r2", "copertina.png", "/finto/copertina.png", 820_000, "PC dello studio", ora - 3_600_000, salvatoIn = "Download/SierraDeck")
            )
        )
    }

    @Test fun lavoroSalvaliEUnisci() = foto("lavoro-salvali-e-unisci") {
        val c = domanda("d3", "La chat «Prove del meteo» ha lavoro non salvato. Che faccio?",
            listOf(SceltaScheda("Salvali e unisci", consigliata = true), SceltaScheda("Lascia stare")))
        CorpoLavoro(ComponiLavoro.componi(Stato(autopiloti = autopiloti.take(1)), ora, false, listOf(c), emptyMap(), ora))
    }

    @Test fun aggiornaAppDopoAndroid() = foto("aggiorna-app", dialogo = true) {
        CorpoDialogoApp("2.101.0", FaseApp.ANDROID, 100, null)
    }

    @Test fun altroElenco() = foto("altro") { ElencoAltro {} }

    @Test fun altroAiuto() = foto("altro-aiuto") {
        CorpoAiuto("2.101.0", "0.101.0", onCopia = {}, errori = { androidx.compose.material3.Text("Errori · nessuno negli ultimi giorni", modifier = androidx.compose.ui.Modifier.padding(horizontal = 16.dp)) }, scollega = { Scollega { null } })
    }

    @Test fun altroTutteLeChat() = foto("altro-tutte-le-chat") {
        TutteLeChat(null, listOf(
            Chat(id = "c1", titolo = "Pagina dei dolci", governata = true),
            Chat(id = "c2", titolo = "Prove del meteo", chiede = true),
            Chat(id = "c3", titolo = "Note di viaggio", aspetta = true)
        )) {}
    }

    @Test fun altroScollega() = foto("altro-scollega") { Scollega { null } }
}
