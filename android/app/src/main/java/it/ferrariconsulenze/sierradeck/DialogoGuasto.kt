package it.ferrariconsulenze.sierradeck

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Cosa è successo l'ultima volta che l'app si è chiusa da sola.
 *
 * `Guasti` la nota la scriveva già, e non la leggeva nessuno: l'app cadeva, e al
 * riavvio si tornava alla schermata iniziale come se niente fosse. Chi la usa
 * poteva solo dire «è crashata», che non basta a nessuno per capire dove.
 *
 * Qui la nota si vede, e si può **copiare**: è l'unico modo, senza collegare il
 * telefono a un computer, per far arrivare a chi ripara la riga che conta.
 * Letta, si archivia — non si ripresenta a ogni apertura.
 */
@Composable
fun DialogoGuasto(nota: String, onChiudi: () -> Unit) {
    val contesto = LocalContext.current
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("L'app si era chiusa da sola") },
        text = {
            Column {
                Text(
                    "È successo l'ultima volta che era aperta. Questo è quello che " +
                        "ha lasciato scritto: copialo e mandalo, è ciò che serve per capire dove.",
                    color = Banco.testoQuieto,
                    fontSize = 13.sp
                )
                Text(
                    text = nota,
                    color = Banco.testo,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    softWrap = false,
                    modifier = Modifier
                        .heightIn(max = 260.dp)
                        .verticalScroll(rememberScrollState())
                        .horizontalScroll(rememberScrollState())
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { copiaNegliAppunti(contesto, nota); onChiudi() }) {
                Text("Copia e chiudi")
            }
        },
        dismissButton = {
            TextButton(onClick = onChiudi) { Text("Chiudi") }
        }
    )
}

private fun copiaNegliAppunti(contesto: Context, testo: String) {
    try {
        val appunti = contesto.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        appunti.setPrimaryClip(ClipData.newPlainText("guasto SierraDeck", testo))
    } catch (e: Exception) {
        // Non poter copiare non è una ragione per tenere aperto l'avviso: la
        // nota resta comunque leggibile a schermo.
    }
}
