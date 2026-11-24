package it.ferrariconsulenze.sierradeck.schermate.comune

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import it.ferrariconsulenze.sierradeck.nucleo.AzioneGiro
import it.ferrariconsulenze.sierradeck.nucleo.EventoGiro
import it.ferrariconsulenze.sierradeck.nucleo.FaseGiro
import it.ferrariconsulenze.sierradeck.nucleo.FraseLetta
import it.ferrariconsulenze.sierradeck.nucleo.Giro
import it.ferrariconsulenze.sierradeck.nucleo.StatoGiro
import it.ferrariconsulenze.sierradeck.nucleo.TestoDaLeggere
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.tema.coloriTastoBordo
import it.ferrariconsulenze.sierradeck.schermate.tema.coloriTastoPieno
import it.ferrariconsulenze.sierradeck.schermate.tema.coloriTastoTesto
import it.ferrariconsulenze.sierradeck.schermate.tema.sopra
import java.util.Locale

/**
 * La voce che legge (TextToSpeech, italiano). Le frasi lunghe vanno a pezzi: la
 * voce si interrompe da sola sui testi molto lunghi. Tutto sul filo principale.
 */
private class VoceChe(contesto: Context, private val suFine: (Int) -> Unit, private val suGuasto: (String) -> Unit) {
    private val principale = Handler(Looper.getMainLooper())
    private var pronta = false
    private var guasta: String? = null
    private var inAttesa: Pair<Int, String>? = null
    private var gettone = 0
    private var restano = 0
    private val tts: TextToSpeech = TextToSpeech(contesto.applicationContext) { esito ->
        principale.post {
            if (esito != TextToSpeech.SUCCESS) { guasta = "Il telefono non ha una voce che legge."; inAttesa?.let { suGuasto(guasta!!) }; inAttesa = null; return@post }
            val l = tts.setLanguage(Locale.ITALIAN)
            if (l == TextToSpeech.LANG_MISSING_DATA || l == TextToSpeech.LANG_NOT_SUPPORTED) {
                guasta = "Manca la voce italiana: si scarica dalle impostazioni di Android, Sintesi vocale."
                inAttesa?.let { suGuasto(guasta!!) }; inAttesa = null; return@post
            }
            pronta = true
            inAttesa?.let { (g, t) -> parla(g, t) }
            inAttesa = null
        }
    }.also {
        it.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) = fine(utteranceId, false)
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) = fine(utteranceId, true)
        })
    }

    private fun fine(id: String?, errore: Boolean) {
        val g = id?.substringBefore(':')?.toIntOrNull() ?: return
        principale.post {
            if (g != gettone) return@post
            if (errore) { gettone++; suGuasto("La voce non è partita."); return@post }
            restano--
            if (restano <= 0) suFine(g)
        }
    }

    /** Legge `testo`; ritorna il gettone che `suFine` restituirà a lettura finita. */
    fun leggi(testo: String): Int {
        gettone++
        val g = gettone
        guasta?.let { principale.post { if (g == gettone) suGuasto(it) }; return g }
        if (!pronta) { inAttesa = g to testo; return g }
        parla(g, testo)
        return g
    }

    private fun parla(g: Int, testo: String) {
        val pezzi = TestoDaLeggere.aPezzi(testo).ifEmpty { listOf(testo) }
        restano = pezzi.size
        pezzi.forEachIndexed { i, p -> tts.speak(p, TextToSpeech.QUEUE_ADD, null, "$g:$i") }
    }

    fun ferma() { gettone++; inAttesa = null; restano = 0; if (pronta) tts.stop() }
    fun chiudi() { gettone++; tts.stop(); tts.shutdown() }
}

/**
 * **La conversazione a voce** (app, 14/11): una barra sopra la casella con un
 * tasto per accendere e spegnere. Le risposte nuove (`novita`) si leggono, poi
 * si ascolta e quello che dici si manda con `onManda` (la stessa coda degli
 * invii della casella). Si ferma col tasto, con «basta» o in sottofondo.
 *
 * `novita` sono tutte le frasi che la chat ha adesso: quelle già presenti
 * quando si accende non si leggono.
 */
@Composable
fun BarraConversazione(novita: List<FraseLetta>, onManda: (String) -> Boolean, modifier: Modifier = Modifier) {
    val contesto = LocalContext.current
    val disponibile = remember { SpeechRecognizer.isRecognitionAvailable(contesto) }
    val principale = remember { Handler(Looper.getMainLooper()) }
    var stato by remember { mutableStateOf(StatoGiro()) }
    var nega by remember { mutableStateOf(false) }
    val novitaOra by rememberUpdatedState(novita)
    val mandaOra by rememberUpdatedState(onManda)
    var voce by remember { mutableStateOf<VoceChe?>(null) }
    var riconoscitore by remember { mutableStateOf<SpeechRecognizer?>(null) }
    // Ogni ascolto ha il suo numero: un risultato di un ascolto vecchio non conta.
    var ascolto by remember { mutableStateOf(0) }
    var gettoneLettura by remember { mutableStateOf(0) }

    lateinit var applica: (EventoGiro) -> Unit

    fun avviaAscolto() {
        ascolto++
        val mio = ascolto
        val r = riconoscitore ?: SpeechRecognizer.createSpeechRecognizer(contesto).also { riconoscitore = it }
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onError(error: Int) { if (mio == ascolto) applica(EventoGiro.ErroreAscolto(error)) }
            override fun onResults(results: Bundle?) {
                if (mio == ascolto) applica(EventoGiro.Sentito(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()))
            }
        })
        // Un attimo di pausa: il microfono non deve raccogliere la coda della voce.
        principale.postDelayed({
            if (mio != ascolto || stato.fase != FaseGiro.ASCOLTO) return@postDelayed
            r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "it-IT")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            })
        }, 450)
    }

    fun esegui(a: AzioneGiro) {
        when (a) {
            AzioneGiro.Niente -> {}
            is AzioneGiro.Leggi -> {
                val v = voce ?: VoceChe(contesto, suFine = { g -> if (g == gettoneLettura) applica(EventoGiro.LetturaFinita) }, suGuasto = { applica(EventoGiro.LetturaFallita(it)) }).also { voce = it }
                riconoscitore?.cancel()
                ascolto++
                gettoneLettura = v.leggi(a.frase.testo)
            }
            AzioneGiro.Ascolta -> { voce?.ferma(); avviaAscolto() }
            is AzioneGiro.Manda -> if (!mandaOra(a.testo)) applica(EventoGiro.ManoNonPresa)
            AzioneGiro.Ferma -> { ascolto++; gettoneLettura = -1; voce?.ferma(); riconoscitore?.cancel() }
        }
    }
    applica = { e ->
        val p = Giro.passo(stato, e)
        stato = p.stato
        esegui(p.azione)
    }

    val permesso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { dato ->
        if (dato) { nega = false; applica(EventoGiro.Accendi(novitaOra.map { it.id }.toSet())) } else nega = true
    }
    fun accendi() {
        if (ContextCompat.checkSelfPermission(contesto, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            nega = false
            applica(EventoGiro.Accendi(novitaOra.map { it.id }.toSet()))
        } else permesso.launch(Manifest.permission.RECORD_AUDIO)
    }

    LaunchedEffect(novita) { applica(EventoGiro.Novita(novita)) }
    val ciclo = LocalLifecycleOwner.current
    DisposableEffect(ciclo) {
        val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) applica(EventoGiro.Sottofondo) }
        ciclo.lifecycle.addObserver(o)
        onDispose {
            ciclo.lifecycle.removeObserver(o)
            ascolto++
            principale.removeCallbacksAndMessages(null)
            voce?.chiudi()
            riconoscitore?.destroy()
        }
    }

    RigaConversazione(stato, disponibile, nega, { accendi() }, { applica(EventoGiro.Spegni) }, { applica(EventoGiro.Parla) }, modifier)
}

/** Solo la veste della barra: lo stato lo dà [BarraConversazione] (e le foto). */
@Composable
fun RigaConversazione(stato: StatoGiro, disponibile: Boolean, nega: Boolean, onAccendi: () -> Unit, onSpegni: () -> Unit, onParla: () -> Unit, modifier: Modifier = Modifier) {
    val acceso = stato.fase != FaseGiro.SPENTO && stato.fase != FaseGiro.ERRORE
    val applicaSpegni = onSpegni
    Row(modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        if (!disponibile) {
            Text("🔇 A voce: non disponibile su questo telefono", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f).padding(vertical = 8.dp))
            Aiuto("Il telefono non ha un servizio di riconoscimento vocale (di solito «Google» o «Riconoscimento vocale di Android»). Si attiva dalle impostazioni di Android, Lingue e input. " + Giro.SPIEGA, di = "la conversazione a voce")
            return@Row
        }
        if (acceso) Button(
            onClick = applicaSpegni, modifier = Modifier.heightIn(min = 48.dp),
            colors = coloriTastoPieno().copy(containerColor = Banco.accento, contentColor = sopra(Banco.accento))
        ) { Text("🔊 A voce · ferma", fontSize = 14.sp) }
        // Spenta, la barra è sottile (k-and5): niente frase fissa, la spiegazione sta dietro il «?».
        else OutlinedButton(onClick = onAccendi, modifier = Modifier.heightIn(min = 36.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp), colors = coloriTastoBordo()) { Text("🔇 A voce", color = Banco.testo, fontSize = 13.sp) }
        val riga = when {
            nega -> "Serve il permesso del microfono."
            stato.fase == FaseGiro.SPENTO -> ""
            else -> Giro.frase(stato)
        }
        Text(riga, color = if (nega || stato.fase == FaseGiro.ERRORE) Banco.ambra else Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
        if (acceso && stato.fase == FaseGiro.ASPETTO) TextButton(onClick = onParla, colors = coloriTastoTesto()) { Text("🎤", fontSize = 16.sp) }
        Aiuto(Giro.SPIEGA + "\n\n" + Giro.MOTIVO_PERMESSO + " Se l'hai negato, lo dai da Impostazioni di Android, App, SierraDeck, Autorizzazioni.", di = "la conversazione a voce")
    }
}
