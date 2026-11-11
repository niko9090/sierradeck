package it.ferrariconsulenze.sierradeck.schermate.altro

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import it.ferrariconsulenze.sierradeck.BuildConfig
import it.ferrariconsulenze.sierradeck.nucleo.PcCorrente
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Collegamenti
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.Nota
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco

/**
 * **Aiuto** (app 11/11): le due versioni in due righe, «Copia i dettagli» per
 * chiedere aiuto, gli errori, «Scollega questo telefono». Prima era la
 * sezione Info di una volta, con gli errori ripetuti due volte.
 */
@Composable
fun SchermataAiuto(api: Api, onScollega: suspend (Boolean) -> String?) {
    val contesto = LocalContext.current
    var versionePc by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { versionePc = try { api.ciao().versione } catch (_: Exception) { null } }
    CorpoAiuto(
        app = BuildConfig.VERSION_NAME,
        pc = versionePc,
        onCopia = {
            val testo = Dettagli.testo(BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE, PcCorrente.nome, versionePc, Collegamenti.di(Collegamenti.ACCOPPIATO), System.currentTimeMillis())
            (contesto.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("SierraDeck", testo))
            Nota.mostra("Dettagli copiati: niente chiavi né password.")
        },
        errori = { SezioneErroriApp(api) },
        scollega = { Scollega(onScollega) }
    )
}

/** Il corpo, senza rete: per le foto e per i test. */
@Composable
fun CorpoAiuto(app: String, pc: String?, onCopia: () -> Unit, errori: @Composable () -> Unit, scollega: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Riga("Questa app", app)
            Riga("Il computer", pc ?: "non ancora letta")
            Text("SierraDeck è di Ferrari Consulenze.", style = MaterialTheme.typography.bodySmall, color = Banco.testoQuieto)
        }
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onCopia, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Copia i dettagli") }
            Aiuto("Versioni e stato del collegamento in un testo solo, da incollare dove chiedi aiuto. Non ci sono chiavi né password.", di = "Copia i dettagli")
        }
        HorizontalDivider(color = Banco.incisione, modifier = Modifier.padding(vertical = 12.dp))
        errori()
        HorizontalDivider(color = Banco.incisione, modifier = Modifier.padding(top = 12.dp))
        scollega()
    }
}

@Composable
private fun Riga(cosa: String, valore: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(cosa, style = MaterialTheme.typography.bodyLarge, color = Banco.testoQuieto, modifier = Modifier.weight(1f))
        Text(valore, style = MaterialTheme.typography.titleMedium, color = Banco.testo)
    }
}
