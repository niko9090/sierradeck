package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/**
 * PC 0.74.1: la trasformazione dei workspace del computer nel modo nuovo
 * (vista a elenco, un autopilota fermo per workspace). Dall'app si vede
 * com'è andata e si torna come prima, come sul PC e sulla pagina.
 */
@Serializable
data class DormienteApp(val workspace: String = "", val cwd: String? = null, val chat: Int = 0)

@Serializable
data class StatoMigrazioneApp(val stato: String = "", val motivo: String? = null, val dormienti: List<DormienteApp> = emptyList())

@Serializable
data class RispostaMigrazione(val stato: StatoMigrazioneApp? = null)

@Serializable
data class EsitoMigrazioneApp(val ok: Boolean = false, val messaggio: String = "")

/** La spiegazione dietro il «?», come `AIUTO_MIGRAZIONE` del PC. */
const val AIUTO_MIGRAZIONE = "Ogni workspace del computer ha la Panoramica, con il suo autopilota. Quelli nuovi stanno fermi finché non gli scrivi. Le chat non sono state toccate. «Torna come prima» rimette tutto com’era."

/** Il testo della sezione, puro: lo stesso della pagina e del PC. */
fun testoMigrazione(s: StatoMigrazioneApp): String = when (s.stato) {
    // 0.80.0: il numero sono gli autopiloti nuovi (prima «Tutti i workspace (0)…»); la spiegazione nel «?».
    "fatta" -> when (s.dormienti.size) {
        0 -> "Fatta: ogni workspace aveva già il suo autopilota."
        1 -> "Fatta: 1 autopilota nuovo, fermo finché non gli scrivi."
        else -> "Fatta: ${s.dormienti.size} autopiloti nuovi, fermi finché non gli scrivi."
    }
    "annullata" -> "Workspace tornati come prima."
    "fallita" -> "La trasformazione non è riuscita, tutto è com’era: ${s.motivo ?: ""}"
    else -> "Trasformazione a metà: si completa al prossimo avvio del computer."
}

@Composable
fun SezioneMigrazione(api: Api) {
    var stato by remember { mutableStateOf<StatoMigrazioneApp?>(null) }
    var nota by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { stato = try { api.migrazione().stato } catch (_: Exception) { null } }
    val s = stato ?: return
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Panoramica in tutti i workspace", color = Banco.testo, fontSize = 14.sp)
            Aiuto(AIUTO_MIGRAZIONE, di = "migrazione")
        }
        Text(nota ?: testoMigrazione(s), color = Banco.testoQuieto, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        val torna = s.stato == "fatta"
        OutlinedButton(onClick = {
            scope.launch {
                nota = try { (if (torna) api.tornaMigrazione() else api.rifaiMigrazione()).messaggio } catch (e: Exception) { e.message ?: "non riuscito" }
                stato = try { api.migrazione().stato } catch (_: Exception) { stato }
            }
        }) { Text(if (torna) "Torna come prima" else "Trasforma tutti", fontSize = 12.sp) }
    }
}
