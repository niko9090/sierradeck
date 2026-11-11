package it.ferrariconsulenze.sierradeck.schermate.altro

import it.ferrariconsulenze.sierradeck.schermate.altro.*
import it.ferrariconsulenze.sierradeck.schermate.file.*
import it.ferrariconsulenze.sierradeck.schermate.comune.*
import it.ferrariconsulenze.sierradeck.schermate.radice.*
import it.ferrariconsulenze.sierradeck.nucleo.*

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.RigaConAiuto
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.sottofondo.ErroriApp
import it.ferrariconsulenze.sierradeck.sottofondo.StoricoErroriPc

/** La voce «Errori» delle Impostazioni dell'app. */
@Composable
fun SezioneErroriApp(api: Api) {
    val contesto = LocalContext.current
    val scope = rememberCoroutineScope()
    var storico by remember { mutableStateOf<StoricoErroriPc?>(null) }
    var nota by remember { mutableStateOf<String?>(null) }
    var mando by remember { mutableStateOf(false) }
    val leggi: () -> Unit = {
        scope.launch {
            ErroriApp.mandaCoda(contesto, api)
            try { storico = api.storicoErrori(); nota = null } catch (e: Exception) { nota = "Lo storico non si legge adesso: ${e.message ?: "riprova"}" }
        }
    }
    Column(Modifier.padding(horizontal = 16.dp)) {
        RigaConAiuto(
            storico?.let { ErroriApp.conto(it.voci) } ?: "Errori",
            "Gli errori del computer, del servizio degli autopiloti, della pagina e di quest’app: quando, dove, cosa si stava facendo, il messaggio e il punto del codice. Gli stessi errori ripetuti sono una riga sola. Password, chiavi e gettoni sono tolti prima di salvare.",
            "Errori"
        )
        val s = storico
        if (s == null) {
            TextButton(onClick = leggi) { Text("Vedi gli errori") }
        } else {
            for (v in s.voci.take(5)) {
                Text(
                    ErroriApp.oraBreve(v.ultima) + (if (v.volte > 1) " · ${v.volte} volte" else "") + " · " + v.messaggio,
                    color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(vertical = 2.dp)
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = leggi) { Text("Aggiorna") }
                TextButton(enabled = s.voci.isNotEmpty(), onClick = {
                    val cm = contesto.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("SierraDeck", s.testo))
                    nota = "Copiato: incollalo nella chat che deve correggerli."
                }) { Text("Copia") }
                TextButton(enabled = !mando && s.voci.isNotEmpty() && s.pcSviluppo != null, onClick = {
                    mando = true
                    scope.launch {
                        nota = try { api.mandaErrori().messaggio } catch (e: Exception) { "Non mandati: ${e.message ?: "il computer non ha risposto"}" }
                        mando = false
                    }
                }) { Text(if (mando) "Mando…" else "Manda al PC di sviluppo") }
                Aiuto("Il computer manda lo storico al PC di sviluppo, firmato con la chiave di casa. Là arriva nella cartella di SierraDeck, in .sierradeck/errori-arrivati, che non va mai su GitHub.", "Manda al PC di sviluppo")
            }
            Text(
                s.pcSviluppo?.let { "PC di sviluppo: $it" } ?: "Il PC di sviluppo si sceglie sul computer, in Impostazioni → Errori.",
                color = Banco.testoQuieto, fontSize = 12.sp
            )
            // «Errori arrivati» (2.81.0): sul PC di sviluppo, cosa ne sta facendo.
            s.arrivi?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp) }
        }
        nota?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp)) }
    }
}
