package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Altro → Specialisti: chi lavora, chi è in fila, e le mosse sulla fila (come sul PC e sulla pagina del telefono). */
@Composable
fun SezioneSpecialisti(api: Api) {
    var vista by remember { mutableStateOf<VistaAttesaApp?>(null) }
    var avviso by remember { mutableStateOf<String?>(null) }
    var adesso by remember { mutableStateOf(System.currentTimeMillis()) }
    var daTogliere by remember { mutableStateOf<RigaAttesa?>(null) }
    var daFermare by remember { mutableStateOf<RigaAttesa?>(null) }
    val scope = rememberCoroutineScope()

    // Si rilegge da sola ogni 5 secondi finché la schermata è aperta.
    LaunchedEffect(Unit) {
        while (isActive) {
            try { vista = api.attesaSpecialisti(); avviso = null } catch (_: Exception) { avviso = SpecialistiAttesa.avvisoRete(false) }
            adesso = System.currentTimeMillis()
            Davanti.pausa(5_000)
        }
    }

    fun mossa(chiamata: suspend () -> VistaAttesaApp) {
        scope.launch {
            try { vista = chiamata(); avviso = null } catch (_: Exception) {
                avviso = SpecialistiAttesa.avvisoRete(true)
                try { vista = api.attesaSpecialisti() } catch (_: Exception) { }
            }
            adesso = System.currentTimeMillis()
        }
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Specialisti", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Aiuto(SpecialistiAttesa.SPIEGAZIONE, di = "Specialisti")
        Aiuto(SpecialistiAttesa.SPIEGA_STIME, di = "le stime")
    }
    val v = vista
    if (v == null) {
        Text(avviso ?: "Leggo la lista…", color = if (avviso != null) Banco.rosso else Banco.testoQuieto, fontSize = 14.sp, modifier = Modifier.padding(vertical = 8.dp))
        return
    }
    val s = SpecialistiAttesa.schermata(v, adesso)
    if (s.vecchio) {
        Text("Serve la versione nuova del servizio sul computer.", color = Banco.testoQuieto, fontSize = 14.sp, modifier = Modifier.padding(vertical = 8.dp))
        avviso?.let { Text(it, color = Banco.rosso, fontSize = 13.sp) }
        return
    }
    Text(s.posti, color = Banco.testo, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(vertical = 6.dp))
    if (s.totale.isNotEmpty()) Text(s.totale, color = Banco.testoQuieto, fontSize = 14.sp, modifier = Modifier.padding(bottom = 6.dp))
    avviso?.let { Text(it, color = Banco.rosso, fontSize = 13.sp, modifier = Modifier.padding(bottom = 6.dp)) }

    Spacer(Modifier.height(8.dp))
    Serigrafia("Al lavoro adesso")
    if (s.alLavoro.isEmpty()) Text("Nessuno al lavoro.", color = Banco.testoQuieto, fontSize = 14.sp, modifier = Modifier.padding(vertical = 6.dp))
    for (r in s.alLavoro) {
        SchedaSpecialista(r) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (r.fermaRichiesta) Text("fermata chiesta…", color = Banco.ambra, fontSize = 13.sp)
                else {
                    OutlinedButton(onClick = { mossa { api.attesaPriorita(r.id, "cima") } }) { Text("↑ Precedenza") }
                    OutlinedButton(onClick = { daFermare = r }) { Text("Ferma") }
                }
            }
        }
    }

    Spacer(Modifier.height(12.dp))
    Serigrafia("In fila")
    if (s.inFila.isEmpty()) Text("Nessuno in fila: i posti bastano per tutti.", color = Banco.testoQuieto, fontSize = 14.sp, modifier = Modifier.padding(vertical = 6.dp))
    for (r in s.inFila) {
        SchedaSpecialista(r) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = { mossa { api.attesaPriorita(r.id, "su") } }, enabled = r.puoSalire) { Text("↑") }
                OutlinedButton(onClick = { mossa { api.attesaPriorita(r.id, "giu") } }, enabled = r.puoScendere) { Text("↓") }
                OutlinedButton(onClick = { mossa { api.attesaPriorita(r.id, "cima") } }, enabled = r.puoSalire) { Text("In cima") }
                OutlinedButton(onClick = { daTogliere = r }) { Text("Togli") }
            }
        }
    }

    daFermare?.let { r ->
        AlertDialog(
            onDismissRequest = { daFermare = null },
            title = { Text("Fermarlo e metterlo in cima alla fila?") },
            text = { Text(SpecialistiAttesa.titolo(r) + "\n\nIl suo lavoro resta salvato.") },
            confirmButton = { TextButton(onClick = { daFermare = null; mossa { api.attesaPriorita(r.id, "ferma") } }) { Text("Sì, ferma") } },
            dismissButton = { TextButton(onClick = { daFermare = null }) { Text("No") } }
        )
    }

    daTogliere?.let { r ->
        AlertDialog(
            onDismissRequest = { daTogliere = null },
            title = { Text("Toglierla dalla fila?") },
            text = { Text(SpecialistiAttesa.titolo(r)) },
            confirmButton = { TextButton(onClick = { daTogliere = null; mossa { api.attesaTogli(r.id) } }) { Text("Sì, togli") } },
            dismissButton = { TextButton(onClick = { daTogliere = null }) { Text("No") } }
        )
    }
}

@Composable
private fun SchedaSpecialista(r: RigaAttesa, tasti: (@Composable () -> Unit)? = null) {
    Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row {
                Text(r.etichetta, color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(end = 8.dp))
                Text(SpecialistiAttesa.titolo(r), color = Banco.testo, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
            }
            if (r.cosaFa.isNotEmpty()) Text(r.cosaFa, color = Banco.testoQuieto, fontSize = 13.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            r.percentuale?.let { p ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                    androidx.compose.material3.LinearProgressIndicator(
                        progress = { p / 100f }, color = Banco.verde, trackColor = Banco.incisione,
                        modifier = Modifier.weight(1f).height(6.dp)
                    )
                    Text("  $p%", color = Banco.testo, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            if (r.stima.isNotEmpty()) Text(r.stima, color = if (r.stima.contains("in ritardo")) Banco.ambra else Banco.testoQuieto, fontSize = 13.sp)
            Text(r.dettaglio, color = if (r.toccaALui) Banco.ambra else Banco.testoQuieto, fontSize = 13.sp)
            if (tasti != null) { Spacer(Modifier.height(8.dp)); tasti() }
        }
    }
}
