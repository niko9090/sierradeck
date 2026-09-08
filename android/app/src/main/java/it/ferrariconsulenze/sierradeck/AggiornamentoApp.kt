package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * L'avviso che c'è una versione nuova **dell'app**, e l'aggiornamento senza
 * uscire. (È altra cosa dall'aggiornamento del *computer*, che sta in «Computer».)
 *
 * Il file arriva dentro l'app con la percentuale che avanza; alla fine Android
 * apre la **sua** schermata di installazione — a installare è il sistema, sei tu
 * a confermare. Il download non lo si può chiudere a metà per sbaglio: mentre
 * scarica, i tasti aspettano.
 */
@Composable
fun DialogoAggiornamentoApp(
    nome: String,
    apk: String,
    avviaScarico: (apk: String, onProgresso: (Int) -> Unit, onGuasto: (String) -> Unit) -> Unit,
    onChiudi: () -> Unit
) {
    var scaricando by remember { mutableStateOf(false) }
    var percento by remember { mutableIntStateOf(0) }
    var errore by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!scaricando) onChiudi() },
        title = { Text("C’è SierraDeck $nome") },
        text = {
            Column {
                Text("La scarico e la installo da qui. A confermare l’installazione sarà Android.")
                if (scaricando) {
                    Spacer(Modifier.height(10.dp))
                    Text("Scarico… $percento%", color = Banco.testoQuieto)
                    Spacer(Modifier.height(8.dp))
                    // La barra e non il solo numero: mentre scarica si guarda
                    // lo schermo per due secondi, e una percentuale va letta
                    // mentre un avanzamento si vede.
                    LinearProgressIndicator(
                        progress = { percento / 100f },
                        color = Banco.accento,
                        trackColor = Banco.incisione,
                        modifier = Modifier.fillMaxWidth().height(6.dp)
                    )
                }
                if (errore != null) {
                    Spacer(Modifier.height(10.dp))
                    Text("Non ce l’ho fatta: ${errore}", color = Banco.rosso)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !scaricando,
                onClick = {
                    scaricando = true; errore = null
                    avviaScarico(apk, { p -> percento = p }, { m -> errore = m; scaricando = false })
                }
            ) { Text(if (scaricando) "Scarico…" else "Aggiorna") }
        },
        dismissButton = {
            TextButton(enabled = !scaricando, onClick = onChiudi) { Text("Più tardi") }
        }
    )
}

/**
 * La striscia «c'e' un'app nuova», in alto, che si chiude con una croce.
 *
 * Prima l'avviso era una finestra in faccia all'apertura: o la si accettava o
 * la si mandava via, e mandata via non tornava piu' fino al riavvio — e in
 * mezzo, se la ricerca falliva, non si vedeva niente. Questa resta finche'
 * non la chiudi, non copre quello che stai guardando, e chiusa non torna
 * finche' non esce una versione ancora piu' nuova.
 */
@Composable
fun BandaAggiornamentoApp(nome: String, onAggiorna: () -> Unit, onChiudi: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Banco.accento.copy(alpha = 0.14f))
            .padding(start = 14.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text("C’è SierraDeck $nome per il telefono", color = Banco.accento, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("Hai la ${BuildConfig.VERSION_NAME}. Si scarica da qui, installa Android.", color = Banco.testoQuieto, fontSize = 12.sp)
        }
        Spacer(Modifier.width(6.dp))
        TextButton(onClick = onAggiorna) { Text("Aggiorna") }
        IconButton(onClick = onChiudi, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Filled.Close, contentDescription = "Chiudi l’avviso", tint = Banco.testoQuieto)
        }
    }
}
