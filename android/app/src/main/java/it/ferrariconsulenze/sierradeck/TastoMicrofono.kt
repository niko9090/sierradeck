package it.ferrariconsulenze.sierradeck

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat

/**
 * Il tasto 🎤 accanto a un campo (app 2.75.0): riconoscimento di Android in
 * italiano, i risultati parziali dal vivo nel campo, il permesso del microfono
 * alla prima volta con il motivo in una riga. Non manda mai niente.
 */
@Composable
fun TastoMicrofono(testo: String, onTesto: (String) -> Unit) {
    val contesto = LocalContext.current
    val disponibile = remember { SpeechRecognizer.isRecognitionAvailable(contesto) }
    var stato by remember { mutableStateOf<StatoDettatura>(StatoDettatura.Fermo) }
    val testoAttuale by rememberUpdatedState(testo)
    val scrivi by rememberUpdatedState(onTesto)
    var riconoscitore by remember { mutableStateOf<SpeechRecognizer?>(null) }

    fun applica(e: EventoDettatura) {
        val p = RegolaDettatura.passo(stato, e)
        stato = p.stato
        p.campo?.let { scrivi(it) }
    }

    fun ascolta() {
        val r = riconoscitore ?: SpeechRecognizer.createSpeechRecognizer(contesto).also { riconoscitore = it }
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onError(error: Int) = applica(EventoDettatura.Errore(error))
            override fun onPartialResults(partialResults: Bundle?) {
                partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { applica(EventoDettatura.Parziale(it)) }
            }
            override fun onResults(results: Bundle?) {
                applica(EventoDettatura.Finale(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""))
            }
        })
        r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "it-IT")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        })
    }

    val permesso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { dato ->
        applica(if (dato) EventoDettatura.PermessoDato else EventoDettatura.PermessoNegato)
        if (dato) ascolta()
    }
    DisposableEffect(Unit) { onDispose { riconoscitore?.destroy() } }

    if (!disponibile) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🎤 dettatura non disponibile su questo telefono", color = Banco.testoQuieto, fontSize = 11.sp)
            Aiuto("Il telefono non ha un servizio di riconoscimento vocale (di solito è «Google» o «Riconoscimento vocale di Android»). Si attiva dalle impostazioni di Android, alla voce Lingue e input → Riconoscimento vocale. " + RegolaDettatura.SPIEGA, di = "dettatura non disponibile")
        }
        return
    }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = {
                val ha = ContextCompat.checkSelfPermission(contesto, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                val prima = stato
                applica(EventoDettatura.Tasto(testoAttuale, ha))
                when (stato) {
                    is StatoDettatura.Ascolto -> ascolta()
                    is StatoDettatura.ChiedoPermesso -> permesso.launch(Manifest.permission.RECORD_AUDIO)
                    else -> if (prima is StatoDettatura.Ascolto) riconoscitore?.stopListening()
                }
            }) { Text(if (stato is StatoDettatura.Ascolto) "■ ferma" else "🎤", fontSize = 14.sp) }
            Aiuto(RegolaDettatura.SPIEGA, di = "la dettatura con il microfono")
        }
        when (val s = stato) {
            is StatoDettatura.ChiedoPermesso -> Text(RegolaDettatura.MOTIVO_PERMESSO, color = Banco.testoQuieto, fontSize = 11.sp)
            is StatoDettatura.Ascolto -> Text("Ascolto… parla in italiano", color = Banco.verde, fontSize = 11.sp)
            is StatoDettatura.Errore -> Text(s.messaggio, color = Banco.ambra, fontSize = 11.sp)
            StatoDettatura.PermessoNegato -> Text("Senza il permesso del microfono non posso dettare: lo dai dalle impostazioni di Android → App → SierraDeck → Autorizzazioni.", color = Banco.ambra, fontSize = 11.sp)
            StatoDettatura.Fermo -> {}
        }
    }
}
