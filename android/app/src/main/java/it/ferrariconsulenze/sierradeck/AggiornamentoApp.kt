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
