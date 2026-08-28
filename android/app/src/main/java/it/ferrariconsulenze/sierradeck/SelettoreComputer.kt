package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * La pillola in cima: **con quale computer stai parlando**, e come cambiarlo.
 *
 * Con un computer solo era un'informazione inutile e infatti non c'era. Con tre
 * in casa è la prima cosa da sapere: una chat aperta sul portatile e una sul
 * fisso si somigliano moltissimo, e accorgersi di stare guardando il computer
 * sbagliato dopo aver scritto un comando è un errore che si paga.
 *
 * Sta sopra ogni schermata e non dentro «Computer», perché cambiare macchina è
 * un gesto che si fa **mentre** si sta facendo altro — si guarda una chat, ci si
 * accorge che è dell'altro banco, si cambia e si continua.
 */
@Composable
fun PillolaComputer(nome: String, connesso: Boolean, onApri: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Banco.chassis)
            .clickable(onClick = onApri)
            .padding(horizontal = 14.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (connesso) Banco.verde else Banco.rosso)
        )
        Spacer(Modifier.width(9.dp))
        Text(
            nome,
            color = Banco.testo,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            modifier = Modifier.weight(1f)
        )
        Text("cambia  ▾", color = Banco.testoQuieto, fontSize = 12.sp)
    }
}

/**
 * L'elenco dei computer, da cui si passa dall'uno all'altro con un tocco.
 *
 * Scegliere una postazione **non** rifà l'accoppiamento: la chiave di ogni
 * computer è sempre stata salvata per indirizzo, quindi tornare a uno con cui
 * hai già parlato è istantaneo e non chiede nessun codice. Solo un computer mai
 * visto porta alla schermata del QR.
 *
 * La spunta «tienila» è la richiesta più concreta che ci sia: le postazioni
 * spuntate non si dimenticano mai, le altre sono di passaggio e si potano da
 * sole. Senza quella distinzione l'elenco diventa una discarica di indirizzi
 * provati una volta.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun SelettoreComputer(
    correnteIndirizzo: String,
    onScegli: (String) -> Unit,
    onAggiungi: () -> Unit,
    onChiudi: () -> Unit
) {
    val contesto = LocalContext.current
    var elenco by remember { mutableStateOf(Postazioni.elenca(contesto)) }
    var daRinominare by remember { mutableStateOf<Postazioni.Postazione?>(null) }
    var daDimenticare by remember { mutableStateOf<Postazioni.Postazione?>(null) }
    val stato = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onChiudi,
        sheetState = stato,
        containerColor = Banco.fondo
    ) {
        Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
            Text(
                "I tuoi computer",
                color = Banco.testo,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 6.dp)
            )
            Text(
                "Passare dall'uno all'altro non richiede un nuovo codice: la chiave di ognuno resta salvata.",
                color = Banco.testoQuieto,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 18.dp)
            )
            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = Banco.incisione)

            for (p in elenco) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { if (p.indirizzo != correnteIndirizzo) onScegli(p.indirizzo) }
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
                        if (p.indirizzo == correnteIndirizzo) {
                            Icon(Icons.Filled.Check, "In uso", tint = Banco.accento, modifier = Modifier.size(18.dp))
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            p.nome,
                            color = if (p.indirizzo == correnteIndirizzo) Banco.accento else Banco.testo,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                        Text(
                            Postazioni.hostDi(p.indirizzo),
                            color = Banco.testoQuieto,
                            fontSize = 12.sp,
                            maxLines = 1
                        )
                    }
                    // La spunta: tenuta vuol dire «non dimenticarla mai».
                    Checkbox(
                        checked = p.tenuta,
                        onCheckedChange = {
                            Postazioni.commutaTenuta(contesto, p.indirizzo, it)
                            elenco = Postazioni.elenca(contesto)
                        }
                    )
                    IconButton(onClick = { daRinominare = p }, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Filled.Edit, "Rinomina", tint = Banco.testoQuieto, modifier = Modifier.size(17.dp))
                    }
                    IconButton(onClick = { daDimenticare = p }, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Filled.Delete, "Dimentica", tint = Banco.testoQuieto, modifier = Modifier.size(17.dp))
                    }
                }
                HorizontalDivider(color = Banco.incisione)
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onAggiungi)
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.Add, null, tint = Banco.accento, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(10.dp))
                Text("Aggiungi un computer", color = Banco.accento, fontSize = 14.sp)
            }

            Text(
                "La spunta tiene una postazione per sempre. Quelle senza spunta sono di passaggio: " +
                    "restano le cinque più recenti e poi si tolgono di mezzo da sole.",
                color = Banco.testoQuieto,
                fontSize = 11.sp,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 4.dp)
            )
        }
    }

    daRinominare?.let { p ->
        var nome by remember(p.indirizzo) { mutableStateOf(p.nome) }
        AlertDialog(
            onDismissRequest = { daRinominare = null },
            title = { Text("Come si chiama") },
            text = {
                OutlinedTextField(
                    value = nome,
                    onValueChange = { nome = it.take(30) },
                    singleLine = true,
                    label = { Text("Nome") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    Postazioni.rinomina(contesto, p.indirizzo, nome)
                    elenco = Postazioni.elenca(contesto)
                    daRinominare = null
                }) { Text("Salva") }
            },
            dismissButton = { TextButton(onClick = { daRinominare = null }) { Text("Annulla") } }
        )
    }

    daDimenticare?.let { p ->
        AlertDialog(
            onDismissRequest = { daDimenticare = null },
            title = { Text("Dimentico «${p.nome}»?") },
            text = {
                Text(
                    "Toglie la postazione e la sua chiave: per tornarci servirà un nuovo codice dal suo schermo.",
                    color = Banco.testoQuieto,
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    Postazioni.dimentica(contesto, p.indirizzo)
                    elenco = Postazioni.elenca(contesto)
                    daDimenticare = null
                    if (p.indirizzo == correnteIndirizzo) onScegli("")
                }) { Text("Dimentica") }
            },
            dismissButton = { TextButton(onClick = { daDimenticare = null }) { Text("Annulla") } }
        )
    }
}
