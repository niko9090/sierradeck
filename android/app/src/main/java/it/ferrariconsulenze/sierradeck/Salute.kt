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
    val azioni: List<AzioneSalute> = emptyList(),
    /** PC 0.70: la parola con il colore e il titolo corto. */
    val stato: StatoVistaDrive? = null,
    val breve: String? = null
)

/** I gruppi della Salute (PC 0.70), come sul PC e nella pagina. */
val GRUPPI_SALUTE_VISTA = listOf("sistemare" to "Da sistemare", "computer" to "Computer", "drive" to "Drive", "errori" to "Errori", "tutto" to "Tutto")

object SaluteVista {
    fun gruppi(v: VoceSalute): List<String> = listOfNotNull(
        "sistemare".takeIf { v.tono != "ok" }, "computer".takeIf { v.gruppo == "pc" }, "drive".takeIf { v.gruppo == "drive" },
        "errori".takeIf { v.gruppo == "errori" || v.gruppo == "consegne" || v.gruppo == "aggiornamento" }
    )
    fun conti(voci: List<VoceSalute>): Map<String, Int> = GRUPPI_SALUTE_VISTA.associate { (g, _) -> g to if (g == "tutto") voci.size else voci.count { g in gruppi(it) } }
    fun iniziale(voci: List<VoceSalute>): String = if (voci.any { it.tono != "ok" }) "sistemare" else "computer"
    /** La parola: dal PC 0.70, o dal tono con un PC di prima. */
    fun parola(v: VoceSalute): Pair<String, String> = v.stato?.let { it.parola to it.colore }
        ?: when (v.tono) { "ok" -> "a posto" to "verde"; "attenzione" -> "da guardare" to "ambra"; else -> "da sistemare" to "rosso" }
}

@Serializable
data class Salute(val scritto: String = "", val tono: String = "ok", val riassunto: String = "", val voci: List<VoceSalute> = emptyList(), val mappa: MappaPc? = null)

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

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SezioneSalute(api: Api) {
    var salute by remember { mutableStateOf<Salute?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    var gruppoScelto by remember { mutableStateOf<String?>(null) }
    var mappa by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val contesto = LocalContext.current
    val spenta = FunzioniPc.disponibile(FunzionePc.SALUTE, PcCorrente.versione) == false
    suspend fun leggi() {
        try { salute = api.salute(); guasto = null } catch (e: Exception) { guasto = FunzioniPc.spiega(e, FunzionePc.SALUTE) }
    }
    LaunchedEffect(spenta) { if (!spenta) leggi() }
    RigaConAiuto("Com’è messo il computer.", "Com'è messo il computer: il Drive, gli altri PC (ultimo segno, strada, versione), un aggiornamento non riuscito, gli errori delle ultime ore, le istruzioni degli autopiloti non partite. Ogni voce dice cosa vuol dire e cosa fare.")
    if (spenta) { Text(FunzioniPc.testoMancante(FunzionePc.SALUTE), color = Banco.ambra, fontSize = 13.sp); return }
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val s = salute
    if (s == null && guasto == null) Text("Guardo…", color = Banco.testoQuieto, fontSize = 13.sp)
    if (s != null) {
        Text(s.riassunto, color = coloreTonoSalute(s.tono), fontWeight = FontWeight.Bold, fontSize = 13.sp)
        // PC 0.70: i gruppi come sul PC, una riga per voce con la sua parola; il perché dietro il «?».
        val conti = SaluteVista.conti(s.voci)
        val g = gruppoScelto ?: SaluteVista.iniziale(s.voci)
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp)) {
            for ((id, nome) in GRUPPI_SALUTE_VISTA) {
                androidx.compose.material3.FilterChip(selected = g == id, onClick = { gruppoScelto = id },
                    label = { Text("$nome ${conti[id] ?: 0}", color = if (id == "sistemare" && (conti[id] ?: 0) > 0) Banco.ambra else Banco.testo) })
            }
        }
        val voci = s.voci.filter { g == "tutto" || g in SaluteVista.gruppi(it) }
        if (voci.isEmpty()) Text(if (g == "sistemare") "Tutto a posto" else "Niente in questo gruppo.", color = if (g == "sistemare") Banco.verde else Banco.testoQuieto, fontSize = 13.sp)
        run {
            for (v in voci) {
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    val (parola, colore) = SaluteVista.parola(v)
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text(parola, color = coloreVista(colore), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(" · ${v.breve ?: v.titolo}", color = Banco.testo, fontSize = 13.sp, modifier = Modifier.weight(1f, fill = false))
                        Aiuto(listOfNotNull(v.titolo, v.spiegazione.takeIf { it.isNotBlank() }, v.cosaFare?.let { "Cosa fare: $it" }).joinToString("\n\n"), di = v.breve ?: v.titolo)
                    }
                    Row {
                        for (a in v.azioni) {
                            val t = azioneDalTelefono(a) ?: continue
                            OutlinedButton(onClick = {
                                when (a.id) {
                                    "scarica-a-mano" -> a.url?.let { try { contesto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } catch (_: Exception) {} }
                                    "riprova-pc" -> scope.launch { leggi() }
                                    "apri-autopilota" -> Apertura.schedaRichiesta = Scheda.AUTOPILOTI
                                }
                            }) { Text(t, fontSize = 12.sp) }
                            Spacer(Modifier.width(6.dp))
                        }
                    }
                }
            }
        }
        // La mappa dei PC (PC 0.51.0): in fondo, a richiesta (PC 0.70).
        s.mappa?.takeIf { it.nodi.size > 1 }?.let { m ->
            androidx.compose.material3.TextButton(onClick = { mappa = !mappa }) { Text(if (mappa) "Nascondi la mappa" else "Mappa dei PC") }
            if (mappa) MappaPcVista(m)
        }
        Spacer(Modifier.height(6.dp))
        OutlinedButton(onClick = { scope.launch { leggi() } }) { Text("Aggiorna") }
    }
}
