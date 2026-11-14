package it.ferrariconsulenze.sierradeck

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import it.ferrariconsulenze.sierradeck.nucleo.AzioneGiro
import it.ferrariconsulenze.sierradeck.nucleo.ComandoVoce
import it.ferrariconsulenze.sierradeck.nucleo.EventoGiro
import it.ferrariconsulenze.sierradeck.nucleo.FaseGiro
import it.ferrariconsulenze.sierradeck.nucleo.FraseLetta
import it.ferrariconsulenze.sierradeck.nucleo.Giro
import it.ferrariconsulenze.sierradeck.nucleo.NovitaDaLeggere
import it.ferrariconsulenze.sierradeck.nucleo.NovitaDelTerminale
import it.ferrariconsulenze.sierradeck.nucleo.RegolaDettatura
import it.ferrariconsulenze.sierradeck.nucleo.RigaChat
import it.ferrariconsulenze.sierradeck.nucleo.SceltaLavoro
import it.ferrariconsulenze.sierradeck.nucleo.StatoGiro
import it.ferrariconsulenze.sierradeck.nucleo.TestoDaLeggere
import it.ferrariconsulenze.sierradeck.nucleo.comandoDetto
import it.ferrariconsulenze.sierradeck.schermate.comune.RigaConversazione
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.tema.TemaSierraDeck
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** La conversazione a voce: il giro leggi, ascolta, invia e il testo pulito prima di leggerlo. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], application = Application::class, qualifiers = "w400dp-h860dp-xhdpi")
class ConversazioneVoceTest {
    @get:Rule val regola = createComposeRule()

    private fun f(id: String, t: String = "Testo $id.") = FraseLetta(id, t)
    private fun passa(s: StatoGiro, vararg e: EventoGiro): StatoGiro = e.fold(s) { st, ev -> Giro.passo(st, ev).stato }

    // ---------------------------------------------------------- il testo

    @Test fun togliIlMarkdownECodice() {
        val t = TestoDaLeggere.pulisci("## Fatto\n- ho **aggiunto** la pagina\n```kotlin\nval x = 1\n```\nVedi https://esempio.it/a e src/pagina/dolci.html")
        assertFalse(t.contains("#")); assertFalse(t.contains("*")); assertFalse(t.contains("```")); assertFalse(t.contains("val x"))
        assertFalse(t.contains("https")); assertFalse(t.contains("src/"))
        assertTrue(t.contains("ho aggiunto la pagina")); assertTrue(t.contains("un link"))
        assertTrue(t.contains("codice"))
    }

    @Test fun soloCodiceDiceDoveLoTrovi() {
        assertEquals("Ti ha scritto del codice: lo trovi nella chat.", TestoDaLeggere.pulisci("```\nval a = 1\n```"))
    }

    @Test fun percorsiSigleEImpronteNonSiLeggono() {
        val t = TestoDaLeggere.pulisci("Unito k-12 con c0ffee1234 in C:\\Cartella\\dati\\a.json e App.kt")
        assertFalse(t.contains("k-12")); assertFalse(t.contains("c0ffee1234")); assertFalse(t.contains("C:\\")); assertFalse(t.contains("App.kt"))
        assertTrue(t.startsWith("Unito"))
    }

    @Test fun untestoLungoSiAccorciaSulleFrasi() {
        val lungo = (1..40).joinToString(" ") { "Questa è la frase numero $it." }
        val t = TestoDaLeggere.pulisci(lungo)
        assertTrue(t.endsWith("Il resto è nella chat."))
        assertTrue(t.length < TestoDaLeggere.MASSIMO + 40)
        assertTrue(TestoDaLeggere.aPezzi(lungo).all { it.length <= 260 })
    }

    @Test fun comandiDetti() {
        assertEquals(ComandoVoce.ZITTO, comandoDetto("Basta!"))
        assertEquals(ComandoVoce.ZITTO, comandoDetto("ok, stop per favore"))
        assertEquals(ComandoVoce.RIPETI, comandoDetto("ripeti"))
        assertNull(comandoDetto("fermati e basta con questo lavoro per oggi"))
        assertNull(comandoDetto("unisci il lavoro"))
    }

    @Test fun soloLeSueRisposteSiLeggono() {
        val righe = listOf(
            RigaChat.Bolla("b-0", true, "Aggiungi i dolci", "q1"),
            RigaChat.Bolla("b-1", false, "Fatto, **ecco** la pagina.", "q2"),
            RigaChat.Successo("s-2", listOf("letto il codice")),
            RigaChat.Domanda("d-3", "Le foto in alto o a lato?", "q9", listOf(SceltaLavoro("In alto", "In alto"), SceltaLavoro("A lato", "A lato")), null, false)
        )
        val n = NovitaDaLeggere.dalleRighe(righe)
        assertEquals(2, n.size)
        assertEquals("Fatto, ecco la pagina.", n[0].testo)
        assertTrue(n[1].testo.startsWith("Ha una domanda per te."))
        assertTrue(n[1].testo.contains("In alto, oppure A lato"))
    }

    @Test fun ilTerminaleSenzaCornici() {
        val righe = listOf(5 to "> scrivi la pagina", 6 to "● Preparo la pagina con le foto.", 7 to "╭────────╮", 8 to "", 9 to "Vuoi che la pubblichi?")
        val fr = NovitaDelTerminale.frase(righe, 5)!!
        assertTrue(fr.testo.contains("Preparo la pagina")); assertTrue(fr.testo.contains("pubblichi")); assertFalse(fr.testo.contains("╭"))
        assertNull(NovitaDelTerminale.frase(righe, 9))
    }

    // ---------------------------------------------------------- il giro

    @Test fun accendereAscoltaSubitoELaStoriaVecchiaNonSiLegge() {
        val p = Giro.passo(StatoGiro(), EventoGiro.Accendi(setOf("vecchia")))
        assertEquals(FaseGiro.ASCOLTO, p.stato.fase)
        assertEquals(AzioneGiro.Ascolta, p.azione)
        val q = Giro.passo(p.stato, EventoGiro.Novita(listOf(f("vecchia"))))
        assertEquals(AzioneGiro.Niente, q.azione)
        assertTrue(q.stato.fila.isEmpty())
    }

    @Test fun ilGiroLeggiAscoltaInvia() {
        var s = Giro.passo(StatoGiro(), EventoGiro.Accendi(emptySet())).stato
        // Parli, si manda, si aspetta.
        var p = Giro.passo(s, EventoGiro.Sentito("  unisci il lavoro  "))
        assertEquals(AzioneGiro.Manda("unisci il lavoro"), p.azione)
        assertEquals(FaseGiro.ASPETTO, p.stato.fase)
        // Arriva la risposta: si legge.
        p = Giro.passo(p.stato, EventoGiro.Novita(listOf(f("r1", "Fatto, unito."))))
        assertEquals(AzioneGiro.Leggi(f("r1", "Fatto, unito.")), p.azione)
        assertEquals(FaseGiro.LEGGO, p.stato.fase)
        // Finita la lettura, si ascolta di nuovo.
        p = Giro.passo(p.stato, EventoGiro.LetturaFinita)
        assertEquals(AzioneGiro.Ascolta, p.azione)
        assertEquals(FaseGiro.ASCOLTO, p.stato.fase)
        s = p.stato
        assertEquals("r1", s.ultima?.id)
    }

    @Test fun piuRisposteSiLeggonoInFilaPoiSiAscolta() {
        var p = Giro.passo(StatoGiro(), EventoGiro.Accendi(emptySet()))
        p = Giro.passo(Giro.passo(p.stato, EventoGiro.Sentito("ciao")).stato, EventoGiro.Novita(listOf(f("a"), f("b"))))
        assertEquals(AzioneGiro.Leggi(f("a")), p.azione)
        p = Giro.passo(p.stato, EventoGiro.LetturaFinita)
        assertEquals(AzioneGiro.Leggi(f("b")), p.azione)
        p = Giro.passo(p.stato, EventoGiro.LetturaFinita)
        assertEquals(AzioneGiro.Ascolta, p.azione)
    }

    @Test fun cheArrivaMentreParliAspettaFinoAllaFineDellAscolto() {
        val ascolto = Giro.passo(StatoGiro(), EventoGiro.Accendi(emptySet())).stato
        val p = Giro.passo(ascolto, EventoGiro.Novita(listOf(f("x"))))
        assertEquals(AzioneGiro.Niente, p.azione)
        assertEquals(1, p.stato.fila.size)
        // Se non dici niente, dopo il silenzio si legge quello che è arrivato.
        val q = Giro.passo(p.stato, EventoGiro.NienteSentito)
        assertEquals(AzioneGiro.Leggi(f("x")), q.azione)
    }

    @Test fun unaFraseGiaVistaNonSiRilegge() {
        var p = Giro.passo(StatoGiro(), EventoGiro.Accendi(emptySet()))
        p = Giro.passo(Giro.passo(p.stato, EventoGiro.Sentito("ciao")).stato, EventoGiro.Novita(listOf(f("a"))))
        p = Giro.passo(p.stato, EventoGiro.Novita(listOf(f("a"))))
        assertEquals(AzioneGiro.Niente, p.azione)
        assertTrue(p.stato.fila.isEmpty())
    }

    @Test fun duePerSilenzioPoiAspettaIlTasto() {
        var s = Giro.passo(StatoGiro(), EventoGiro.Accendi(emptySet())).stato
        var p = Giro.passo(s, EventoGiro.ErroreAscolto(RegolaDettatura.ERRORE_SILENZIO))
        assertEquals(AzioneGiro.Ascolta, p.azione)
        p = Giro.passo(p.stato, EventoGiro.NienteSentito)
        assertEquals(FaseGiro.ASPETTO, p.stato.fase)
        assertEquals(AzioneGiro.Niente, p.azione)
        assertTrue(Giro.frase(p.stato).contains("microfono"))
        // Il tasto del microfono riapre l'ascolto.
        p = Giro.passo(p.stato, EventoGiro.Parla)
        assertEquals(AzioneGiro.Ascolta, p.azione)
    }

    @Test fun bastaSpegneERipetiRilegge() {
        val inAscolto = passa(StatoGiro(), EventoGiro.Accendi(emptySet()), EventoGiro.Sentito("x"), EventoGiro.Novita(listOf(f("a", "Prima risposta."))), EventoGiro.LetturaFinita)
        assertEquals(FaseGiro.ASCOLTO, inAscolto.fase)
        val rip = Giro.passo(inAscolto, EventoGiro.Sentito("ripeti"))
        assertEquals(AzioneGiro.Leggi(f("a", "Prima risposta.")), rip.azione)
        val zitto = Giro.passo(inAscolto, EventoGiro.Sentito("basta"))
        assertEquals(FaseGiro.SPENTO, zitto.stato.fase)
        assertEquals(AzioneGiro.Ferma, zitto.azione)
    }

    @Test fun sottofondoETastoFermanoTutto() {
        val s = Giro.passo(StatoGiro(), EventoGiro.Accendi(emptySet())).stato
        for (e in listOf(EventoGiro.Spegni, EventoGiro.Sottofondo)) {
            val p = Giro.passo(s, e)
            assertEquals(FaseGiro.SPENTO, p.stato.fase); assertEquals(AzioneGiro.Ferma, p.azione); assertTrue(p.stato.fila.isEmpty())
        }
        // Da spento le novità non fanno niente.
        assertEquals(AzioneGiro.Niente, Giro.passo(StatoGiro(), EventoGiro.Novita(listOf(f("a")))).azione)
    }

    @Test fun errorePermessoESenzaVoceSpengonoConUnMessaggio() {
        val s = Giro.passo(StatoGiro(), EventoGiro.Accendi(emptySet())).stato
        val perm = Giro.passo(s, EventoGiro.ErroreAscolto(RegolaDettatura.ERRORE_PERMESSI))
        assertEquals(FaseGiro.ERRORE, perm.stato.fase); assertEquals(AzioneGiro.Ferma, perm.azione)
        val leggendo = passa(s, EventoGiro.Sentito("x"), EventoGiro.Novita(listOf(f("a"))))
        val guasto = Giro.passo(leggendo, EventoGiro.LetturaFallita("Manca la voce italiana"))
        assertEquals(FaseGiro.ERRORE, guasto.stato.fase)
        assertEquals("Manca la voce italiana", Giro.frase(guasto.stato))
        // Da errore si può riaccendere.
        assertEquals(FaseGiro.ASCOLTO, Giro.passo(guasto.stato, EventoGiro.Accendi(emptySet())).stato.fase)
    }

    @Test fun inviatoNonPresoDiceDiScriverlo() {
        val s = passa(StatoGiro(), EventoGiro.Accendi(emptySet()), EventoGiro.Sentito("ciao"))
        val p = Giro.passo(s, EventoGiro.ManoNonPresa)
        assertTrue(Giro.frase(p.stato).contains("casella"))
    }

    @Test fun oltreIlTettoLeVecchieDiventanoAltreNovita() {
        var fila = emptyList<FraseLetta>()
        for (i in 1..7) fila = Giro.accoda(fila, f("n$i"))
        assertEquals(Giro.FILA_MAX, fila.size)
        assertTrue(fila.first().testo.startsWith("Ci sono altre"))
        assertEquals("n7", fila.last().id)
    }

    // ---------------------------------------------------------- la foto

    private fun foto(nome: String, vararg righe: Pair<StatoGiro, Boolean>) {
        regola.setContent {
            TemaSierraDeck {
                Surface(Modifier.fillMaxSize(), color = Banco.fondo) {
                    Column { for ((s, nega) in righe) RigaConversazione(s, true, nega, {}, {}, {}) }
                }
            }
        }
        regola.onRoot().captureRoboImage("build/foto-schermate/$nome.png")
    }

    @Test fun fotoBarra() = foto(
        "conversazione-voce",
        StatoGiro() to false,
        StatoGiro(fase = FaseGiro.LEGGO) to false,
        StatoGiro(fase = FaseGiro.ASCOLTO) to false,
        StatoGiro(fase = FaseGiro.ASPETTO) to false,
        StatoGiro(fase = FaseGiro.ERRORE, messaggio = "Manca la voce italiana: si scarica dalle impostazioni di Android, Sintesi vocale.") to false,
        StatoGiro() to true
    )
}
