package it.ferrariconsulenze.sierradeck

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/*
 * «Salute del sistema» (0.44.0, app 2.47.0): le stesse voci del PC, lette da
 * `/api/salute` — il Drive, gli altri PC (ultimo battito, strada, versione),
 * l'aggiornamento non riuscito, gli errori delle ultime ore, le istruzioni non
 * partite — ognuna con la spiegazione, cosa fare e le azioni che il telefono
 * sa fare. Su un computer più vecchio della 0.44.0 la sezione si spegne e lo
 * dice.
 */

@Serializable
data class AzioneSalute(val id: String = "", val testo: String = "", val url: String? = null, val autopilota: String? = null, val pc: String? = null)

@Serializable
data class VoceSalute(
    val chiave: String = "",
    val gruppo: String = "",
    val tono: String = "ok",
    val titolo: String = "",
    val spiegazione: String = "",
    val cosaFare: String? = null,
    val azioni: List<AzioneSalute> = emptyList()
)

@Serializable
data class Salute(val scritto: String = "", val tono: String = "ok", val riassunto: String = "", val voci: List<VoceSalute> = emptyList())

/** I gruppi, in ordine, con il nome da mostrare. */
val GRUPPI_SALUTE = listOf("drive" to "Drive", "pc" to "Gli altri PC", "aggiornamento" to "Aggiornamento", "errori" to "Errori delle ultime ore", "consegne" to "Istruzioni non partite")

/**
 * Cosa sa fare il telefono per un'azione. «Installa» no: chiude il computer
 * con le chat aperte, e dal telefono si fa nella sezione Aggiornamenti qui
 * sotto, con le sue note e la sua conferma.
 */
fun azioneDalTelefono(a: AzioneSalute): String? = when (a.id) {
    "scarica-a-mano", "riprova-pc", "apri-autopilota" -> a.testo
    else -> null
}

fun coloreTonoSalute(tono: String): Color = when (tono) {
    "ok" -> Banco.verde
    "attenzione" -> Banco.ambra
    else -> Banco.rosso
}

@Composable
fun SezioneSalute(api: Api) {
    var salute by remember { mutableStateOf<Salute?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val contesto = LocalContext.current
    val spenta = FunzioniPc.disponibile(FunzionePc.SALUTE, PcCorrente.versione) == false
    suspend fun leggi() {
        try { salute = api.salute(); guasto = null } catch (e: Exception) { guasto = FunzioniPc.spiega(e, FunzionePc.SALUTE) }
    }
    LaunchedEffect(spenta) { if (!spenta) leggi() }
    Text(
        "Com'è messo il computer: il Drive, gli altri PC (ultimo segno, strada, versione), un aggiornamento non riuscito, gli errori delle ultime ore, le istruzioni degli autopiloti non partite. Ogni voce dice cosa vuol dire e cosa fare.",
        color = Banco.testoQuieto, fontSize = 12.sp
    )
    if (spenta) { Text(FunzioniPc.testoMancante(FunzionePc.SALUTE), color = Banco.ambra, fontSize = 13.sp); return }
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val s = salute
    if (s == null && guasto == null) Text("Guardo…", color = Banco.testoQuieto, fontSize = 13.sp)
    if (s != null) {
        Text(s.riassunto, color = coloreTonoSalute(s.tono), fontWeight = FontWeight.Bold, fontSize = 13.sp)
        for ((g, nome) in GRUPPI_SALUTE) {
            val voci = s.voci.filter { it.gruppo == g }
            if (voci.isEmpty()) continue
            Spacer(Modifier.height(8.dp))
            Text(nome.uppercase(), color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            for (v in voci) {
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(v.titolo, color = coloreTonoSalute(v.tono), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text(v.spiegazione, color = Banco.testo, fontSize = 12.sp)
                    v.cosaFare?.let { Text("Cosa fare: $it", color = Banco.testoQuieto, fontSize = 12.sp) }
                    Row {
                        for (a in v.azioni) {
                            val t = azioneDalTelefono(a) ?: continue
                            OutlinedButton(onClick = {
                                when (a.id) {
                                    "scarica-a-mano" -> a.url?.let { try { contesto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } catch (_: Exception) {} }
                                    "riprova-pc" -> scope.launch { leggi() }
                                    "apri-autopilota" -> Apertura.schedaRichiesta = Scheda.LAVORI
                                }
                            }) { Text(t, fontSize = 12.sp) }
                            Spacer(Modifier.width(6.dp))
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        OutlinedButton(onClick = { scope.launch { leggi() } }) { Text("Aggiorna") }
    }
}
