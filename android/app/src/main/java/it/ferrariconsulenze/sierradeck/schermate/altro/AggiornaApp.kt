package it.ferrariconsulenze.sierradeck.schermate.altro

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import it.ferrariconsulenze.sierradeck.BuildConfig
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.sottofondo.Scaricamento

/**
 * «Più tardi» per l'app nuova (app 11/11): un giorno di silenzio per quella
 * versione. Prima «Più tardi» chiudeva l'avviso e basta: tornava al primo
 * controllo, cioè subito.
 */
object PiuTardi {
    const val UN_GIORNO = 24L * 60 * 60 * 1000
    private fun prefs(c: Context) = c.getSharedPreferences("sierradeck-piu-tardi", Context.MODE_PRIVATE)

    /** La regola, pura: si vede di nuovo quando il giorno è passato. */
    fun nascosta(fino: Long, ora: Long): Boolean = ora < fino

    fun rimanda(c: Context, versione: String, ora: Long = System.currentTimeMillis()) { prefs(c).edit().putLong(versione, ora + UN_GIORNO).apply() }
    fun nascosta(c: Context, versione: String, ora: Long = System.currentTimeMillis()): Boolean = nascosta(prefs(c).getLong(versione, 0L), ora)
}

/** Le fasi del dialogo: scegli, scarico, Android chiede, errore. */
enum class FaseApp { SCEGLI, SCARICO, ANDROID, ERRORE }

/**
 * L'app nuova: «Aggiorna» la scarica (con la barra), poi Android apre la sua
 * installazione. Se lì si annulla, il dialogo non resta su «Scarico…»: torna
 * da solo a «Aggiorna» quando l'app torna davanti.
 */
@Composable
fun DialogoAggiornaApp(nome: String, apk: String, onPiuTardi: () -> Unit, onChiudi: () -> Unit) {
    val contesto = LocalContext.current
    var fase by remember { mutableStateOf(FaseApp.SCEGLI) }
    var percento by remember { mutableStateOf(0) }
    var errore by remember { mutableStateOf<String?>(null) }
    val principale = remember { Handler(Looper.getMainLooper()) }
    // Tornati dall'installazione di Android (fatta o annullata): non si resta appesi.
    val ciclo = LocalLifecycleOwner.current
    DisposableEffect(ciclo) {
        val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME && fase == FaseApp.ANDROID) fase = FaseApp.SCEGLI }
        ciclo.lifecycle.addObserver(o)
        onDispose { ciclo.lifecycle.removeObserver(o) }
    }
    CorpoDialogoApp(nome, fase, percento, errore,
        onAggiorna = {
            fase = FaseApp.SCARICO; percento = 0; errore = null
            Scaricamento.apk(contesto, apk,
                avanzamento = { p -> principale.post { percento = p } },
                guasto = { m -> principale.post { errore = m; fase = FaseApp.ERRORE } },
                pronto = { principale.post { fase = FaseApp.ANDROID } })
        },
        onPiuTardi = onPiuTardi, onChiudi = onChiudi)
}

@Composable
fun CorpoDialogoApp(nome: String, fase: FaseApp, percento: Int, errore: String?, onAggiorna: () -> Unit = {}, onPiuTardi: () -> Unit = {}, onChiudi: () -> Unit = {}) {
    AlertDialog(
        onDismissRequest = { if (fase != FaseApp.SCARICO) onChiudi() },
        title = { Text("C’è SierraDeck $nome") },
        text = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Hai la ${BuildConfig.VERSION_NAME}.", modifier = Modifier.weight(1f))
                    Aiuto("La scarico qui; poi Android apre la sua schermata e sei tu a confermare. I dati dell’app restano.", di = "l’aggiornamento")
                }
                when (fase) {
                    FaseApp.SCARICO -> {
                        Spacer(Modifier.height(8.dp))
                        Text("Scarico… $percento%", color = Banco.testoQuieto)
                        Spacer(Modifier.height(8.dp))
                        LinearProgressIndicator(progress = { percento / 100f }, color = Banco.accento, trackColor = Banco.incisione, modifier = Modifier.fillMaxWidth().height(6.dp))
                    }
                    FaseApp.ANDROID -> Text("Conferma nella schermata di Android.", color = Banco.testoQuieto, modifier = Modifier.padding(top = 8.dp))
                    FaseApp.ERRORE -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Non sono riuscito a scaricarla.", color = Banco.rosso, modifier = Modifier.weight(1f))
                        errore?.let { Aiuto(it, di = "l’errore") }
                    }
                    FaseApp.SCEGLI -> {}
                }
            }
        },
        confirmButton = {
            Button(enabled = fase != FaseApp.SCARICO, onClick = onAggiorna) {
                Text(when (fase) { FaseApp.SCARICO -> "Scarico…"; FaseApp.ERRORE, FaseApp.ANDROID -> "Riprova"; FaseApp.SCEGLI -> "Aggiorna" })
            }
        },
        dismissButton = { TextButton(enabled = fase != FaseApp.SCARICO, onClick = onPiuTardi) { Text("Più tardi") } }
    )
}

/** La striscia in alto «C'è l'app nuova»: Aggiorna, o la croce (= Più tardi, un giorno). */
@Composable
fun BandaAppNuova(nome: String, onAggiorna: () -> Unit, onPiuTardi: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Banco.accento.copy(alpha = 0.14f)).padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("C’è SierraDeck $nome per il telefono", color = Banco.accento, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(6.dp))
        TextButton(onClick = onAggiorna) { Text("Aggiorna") }
        IconButton(onClick = onPiuTardi) { Icon(Icons.Filled.Close, contentDescription = "Più tardi", tint = Banco.testoQuieto) }
    }
}
