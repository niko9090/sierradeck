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
import kotlinx.coroutines.launch
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
fun PillolaComputer(nome: String, connesso: Boolean, linea: StatoLinea? = null, sotto: String? = null, onApri: () -> Unit) {
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
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            Text(
                nome,
                color = Banco.testo,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1
            )
            // L'hostname, piccolo (2.52.4): il nome è quello scelto.
            if (!sotto.isNullOrBlank()) {
                Spacer(Modifier.width(6.dp))
                Text(sotto, color = Banco.testoQuieto, fontSize = 10.sp, maxLines = 1)
            }
        }
        // La qualità del collegamento con questo computer, sempre in vista
        // (0.52.0): strada, tacche e ritardo; toccandola, la storia.
        if (linea != null) {
            IndicatoreLinea(
                linea, nome,
                spiega = "Le cadute, i ritorni e i cambi di questo collegamento, con l'ora e il motivo (gli ultimi trenta). La strada è quella fra questo telefono e $nome: 🏠 rete di casa, 🔐 Tailscale, … quando non si capisce dall'indirizzo. Il ritardo è il giro completo di una lettura (dal telefono al computer e ritorno), misurato ogni due secondi. Le tacche: 4 = sotto 150 ms e niente perso; ne tolgono una le letture perse e il ritardo che sale (400 ms, 1 s). Se il collegamento cade, l'app riprova da sola."
            )
            Spacer(Modifier.width(8.dp))
        }
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
    /** Cambia il nome anche sul computer collegato; false = non c'è riuscito (PC vecchio o spento). */
    onRinominaSulPc: (suspend (String) -> Boolean)? = null,
    onScegli: (String) -> Unit,
    onAggiungi: () -> Unit,
    onChiudi: () -> Unit
) {
    val contesto = LocalContext.current
    var elenco by remember { mutableStateOf(Postazioni.elenca(contesto)) }
    var daRinominare by remember { mutableStateOf<Postazioni.Postazione?>(null) }
    var daDimenticare by remember { mutableStateOf<Postazioni.Postazione?>(null) }
    val stato = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val giro = androidx.compose.runtime.rememberCoroutineScope()
    var notaNome by remember { mutableStateOf<String?>(null) }

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
                            // L'hostname piccolo (2.52.4), poi l'indirizzo.
                            listOfNotNull(NomePc.sottotitolo(p.nome, null, p.host), Postazioni.hostDi(p.indirizzo)).joinToString(" · "),
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

            notaNome?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 18.dp, vertical = 4.dp)) }
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
                Column {
                    OutlinedTextField(
                        value = nome,
                        onValueChange = { nome = it.take(NomePc.MAX) },
                        singleLine = true,
                        label = { Text("Nome") }
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (p.indirizzo == correnteIndirizzo && onRinominaSulPc != null)
                            "È il computer collegato adesso: il nome lo cambio anche là, così lo vedono gli altri PC, la pagina e ogni telefono. " +
                                "Se il computer è spento o ha un SierraDeck più vecchio della 0.52.4, il nome resta solo su questo telefono. " +
                                "Vuoto = si torna al nome del computer." +
                                (p.host.takeIf { it.isNotBlank() }?.let { " Il nome tecnico della macchina ($it) resta scritto piccolo accanto." } ?: "")
                        else
                            "Il nome resta su questo telefono e vince su quello del computer. Per cambiarlo per tutti, collegati a quel computer e rinominalo da qui, " +
                                "oppure dal computer stesso in «Altri computer». Vuoto = si torna al nome del computer.",
                        color = Banco.testoQuieto,
                        fontSize = 12.sp
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val scritto = nome
                    val sulPc = if (p.indirizzo == correnteIndirizzo) onRinominaSulPc else null
                    daRinominare = null
                    if (sulPc == null) {
                        Postazioni.rinomina(contesto, p.indirizzo, scritto)
                        elenco = Postazioni.elenca(contesto)
                    } else {
                        giro.launch {
                            val fatto = sulPc(NomePc.valido(scritto))
                            // Salvato anche sul computer: da qui in poi segue quello che dice lui.
                            Postazioni.rinomina(contesto, p.indirizzo, scritto, aMano = !fatto)
                            elenco = Postazioni.elenca(contesto)
                            notaNome = if (fatto) "Nome cambiato anche sul computer: gli altri PC lo vedono al prossimo battito (al massimo mezzo minuto)."
                            else "Il computer non ha risposto (spento, o SierraDeck più vecchio della 0.52.4): il nome è salvato solo su questo telefono."
                        }
                    }
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
