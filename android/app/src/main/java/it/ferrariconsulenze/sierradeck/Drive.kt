package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Il Drive dal telefono: il magazzino comune dei PC, da sfogliare e da cui
 * portare qualcosa sul computer a cui si e' collegati.
 *
 * Nicholas (2026-09-10): «nella parte apk non vedo la parte drive». E' la
 * stessa scheda «Drive» del computer, letta dalle sue rotte: per progetto o
 * per workspace, con lo stato di ogni voce rispetto a QUEL computer, «Porta
 * qui» che fa lavorare il computer (cartella, chat, workspace) e il lavoro
 * che si vede avanzare con la barra. Alla fine, se sono arrivate chat, il
 * computer si riavvia da solo per mostrarle; da qui lo si puo' chiedere
 * subito con «Riavvia ora».
 */
@Composable
fun SezioneDrive(api: Api) {
    val scope = rememberCoroutineScope()
    var aperto by remember { mutableStateOf(false) }
    var catalogo by remember { mutableStateOf<Catalogo?>(null) }
    var messaggio by remember { mutableStateOf<String?>(null) }
    var leggo by remember { mutableStateOf(false) }
    var vista by remember { mutableStateOf("progetti") }
    var lavoro by remember { mutableStateOf<StatoLavoro?>(null) }
    var inCorso by remember { mutableStateOf<String?>(null) }
    var espansi by remember { mutableStateOf<Set<String>>(emptySet()) }
    var riavviato by remember { mutableStateOf(false) }

    suspend fun leggi() {
        leggo = true
        try {
            val r = api.driveCatalogo()
            if (!r.disponibile) messaggio = "Questo computer non sa ancora mostrare il Drive: aggiornalo."
            else if (r.ok && r.catalogo != null) { catalogo = r.catalogo; messaggio = null }
            else messaggio = r.messaggio ?: "Non riesco a leggere il Drive."
        } catch (e: Exception) {
            messaggio = "Non riesco a leggere il Drive: ${e.message ?: "il computer non risponde"}"
        }
        leggo = false
    }

    // Finche' la sezione e' aperta: il lavoro in corso ogni due secondi, e
    // quando finisce si rilegge il catalogo (e' cambiato).
    LaunchedEffect(aperto) {
        if (!aperto) return@LaunchedEffect
        leggi()
        var eraInCorso = false
        while (isActive) {
            try {
                val l = api.driveLavoro()
                lavoro = l
                val adesso = l.inCorso != null
                if (eraInCorso && !adesso) { inCorso = null; leggi() }
                eraInCorso = adesso
            } catch (_: Exception) {}
            delay(2000)
        }
    }

    Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Drive · il magazzino dei tuoi PC", color = Banco.testo, fontWeight = FontWeight.Bold)
                    Text(
                        if (catalogo == null) "Cosa c'è sul Drive, e cosa il computer ha già. Da qui gli fai portare progetti e workspace."
                        else "${catalogo!!.totali.progetti} progetti · ${catalogo!!.totali.chat} chat · ${catalogo!!.totali.daPortare} da portare sul computer",
                        color = Banco.testoQuieto, fontSize = 12.sp
                    )
                }
                OutlinedButton(onClick = { aperto = !aperto }) { Text(if (aperto) "Chiudi" else "Apri") }
            }
            if (!aperto) return@Column
            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = Banco.incisione)
            Spacer(Modifier.height(10.dp))
            Text(
                "Un progetto è la cartella in cui le chat lavorano; un workspace è una fascia a schermo con dentro delle chat, anche di progetti diversi. «Porta qui» fa scaricare al computer la cartella se viaggia con le chat, le chat che gli mancano, e le mette nel loro workspace; poi il computer si riavvia da solo per mostrarle. Niente viene mai cancellato.",
                color = Banco.testoQuieto, fontSize = 12.sp
            )
            Spacer(Modifier.height(8.dp))

            // Il lavoro in corso sul computer, con la barra.
            val l = lavoro
            val inc = l?.inCorso
            if (inc != null) {
                val perc = if ((inc.totale ?: 0) > 0) ((inc.fatto ?: 0) * 100 / (inc.totale ?: 1)) else 0
                Text(
                    etichettaLavoro(inc.tipo) + (if ((inc.totale ?: 0) > 0) " — ${inc.fatto ?: 0} di ${inc.totale} file ($perc%)" else " — preparo…") +
                        (if (inc.annullamento) " · mi fermo…" else ""),
                    color = Banco.ambra, fontSize = 13.sp, fontWeight = FontWeight.Bold
                )
                if (inc.dettaglio != null) Text((if (inc.verso == "giu") "↓ " else "↑ ") + inc.dettaglio, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { perc / 100f },
                    color = Banco.accento, trackColor = Banco.incisione,
                    modifier = Modifier.fillMaxWidth().height(8.dp)
                )
                Spacer(Modifier.height(6.dp))
                Row {
                    Spacer(Modifier.weight(1f))
                    TextButton(enabled = !inc.annullamento, onClick = { scope.launch { try { api.driveAnnulla() } catch (_: Exception) {} } }) {
                        Text(if (inc.annullamento) "Mi fermo…" else "Annulla")
                    }
                }
                Spacer(Modifier.height(6.dp))
            } else if (l?.ultimo != null && l.ultimo.tipo != "salvataggio") {
                val u = l.ultimo
                Text(
                    etichettaLavoro(u.tipo) + ": " + when (u.esito) { "ok" -> "fatto"; "annullato" -> "annullato"; else -> "non riuscito" } +
                        (if (u.messaggio.isNotBlank()) " — ${u.messaggio}" else ""),
                    color = if (u.esito == "errore") Banco.rosso else Banco.testoQuieto, fontSize = 12.sp
                )
                if (u.riavvioConsigliato == true && !riavviato) {
                    Spacer(Modifier.height(6.dp))
                    Text("Sono arrivate chat o cartelle: il computer si riavvia da solo fra pochi secondi per mostrarle nei workspace. Se non lo fa (per esempio se la sua finestra è chiusa), chiediglielo da qui.", color = Banco.testoQuieto, fontSize = 12.sp)
                    Spacer(Modifier.height(4.dp))
                    Button(shape = MaterialTheme.shapes.small, onClick = {
                        scope.launch {
                            try { val r = api.driveRiavvia(); riavviato = r.ok; if (!r.ok) messaggio = r.messaggio ?: "Non riavviato." } catch (e: Exception) { messaggio = "Non riesco a chiedere il riavvio: ${e.message ?: "il computer non risponde"}" }
                        }
                    }) { Text("Riavvia il computer ora") }
                }
                Spacer(Modifier.height(6.dp))
            }

            if (messaggio != null) { Text(messaggio!!, color = Banco.ambra, fontSize = 12.sp); Spacer(Modifier.height(6.dp)) }

            val c = catalogo
            if (c == null) {
                Text(if (leggo) "Leggo il Drive…" else "Niente da mostrare.", color = Banco.testoQuieto, fontSize = 13.sp)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FilterChip(selected = vista == "progetti", onClick = { vista = "progetti" }, label = { Text("Per progetto") })
                    Spacer(Modifier.width(6.dp))
                    FilterChip(selected = vista == "workspace", onClick = { vista = "workspace" }, label = { Text("Per workspace (${c.workspace.size})") })
                    Spacer(Modifier.weight(1f))
                    TextButton(enabled = !leggo, onClick = { scope.launch { leggi() } }) { Text(if (leggo) "Leggo…" else "Aggiorna") }
                }
                Spacer(Modifier.height(6.dp))
                val occupato = inCorso != null || inc != null
                if (vista == "progetti") {
                    if (c.progetti.isEmpty()) Text("Sul Drive non c'è ancora niente.", color = Banco.testoQuieto, fontSize = 13.sp)
                    for (g in c.progetti) {
                        val daPortare = g.conti.soloDrive + g.conti.indietro + g.file.soloDrive + g.file.indietro
                        val chiave = "p:" + g.chiave
                        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(g.nome, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1)
                                    Text(
                                        "${g.chat.size} chat" + (if (g.cartellaSulDrive) " · cartella sul Drive" else "") +
                                            " · " + when (g.origine) { "qui" -> "di questo PC"; "altrove" -> "nata su un altro PC"; else -> "di più PC" },
                                        color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1
                                    )
                                    Text(statoProgetto(g), color = coloreStato(g.stato), fontSize = 11.sp, maxLines = 1)
                                }
                                if (daPortare > 0) {
                                    Button(
                                        enabled = !occupato,
                                        shape = MaterialTheme.shapes.small,
                                        onClick = {
                                            inCorso = chiave; messaggio = null
                                            scope.launch {
                                                try {
                                                    val r = api.drivePorta(g.chiave)
                                                    if (!r.ok) { messaggio = r.messaggio ?: "Non riuscito."; inCorso = null }
                                                } catch (e: Exception) { messaggio = "Non riuscito: ${e.message ?: "il computer non risponde"}"; inCorso = null }
                                            }
                                        }
                                    ) { Text(if (inCorso == chiave) "Porto…" else if (g.stato == "daAggiornare") "Aggiorna ($daPortare)" else "Porta qui ($daPortare)") }
                                }
                            }
                            TextButton(onClick = { espansi = if (chiave in espansi) espansi - chiave else espansi + chiave }) {
                                Text(if (chiave in espansi) "Nascondi le chat" else "Vedi le ${g.chat.size} chat", fontSize = 12.sp)
                            }
                            if (chiave in espansi) for (ch in g.chat) {
                                Row(Modifier.padding(start = 8.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(ch.titolo, color = Banco.testo, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
                                    Spacer(Modifier.width(6.dp))
                                    Text(statoChat(ch), color = coloreStatoChat(ch.stato), fontSize = 10.sp, maxLines = 1)
                                }
                            }
                        }
                        HorizontalDivider(color = Banco.incisione)
                    }
                } else {
                    if (c.workspace.isEmpty()) Text("Sul Drive non ci sono workspace salvati.", color = Banco.testoQuieto, fontSize = 13.sp)
                    for (w in c.workspace) {
                        val chiave = "w:" + w.nome
                        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(w.nome, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1)
                                    Text("${w.chat.size} chat in ${w.progetti.size} " + (if (w.progetti.size == 1) "progetto" else "progetti") + (if (w.quiEsiste) " · esiste già sul computer" else " · non esiste ancora sul computer"), color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                                    Text(
                                        if (w.daPortare > 0) "${w.daPortare} chat da portare sul computer" else if (w.quiEsiste) "allineato" else "chat già sul computer: manca solo il workspace",
                                        color = if (w.daPortare > 0 || !w.quiEsiste) Banco.ambra else Banco.verde, fontSize = 11.sp
                                    )
                                }
                                if (w.daPortare > 0 || !w.quiEsiste) {
                                    Button(
                                        enabled = !occupato,
                                        shape = MaterialTheme.shapes.small,
                                        onClick = {
                                            inCorso = chiave; messaggio = null
                                            scope.launch {
                                                try {
                                                    val r = api.drivePortaWorkspace(w.nome)
                                                    if (!r.ok) { messaggio = r.messaggio ?: "Non riuscito."; inCorso = null }
                                                } catch (e: Exception) { messaggio = "Non riuscito: ${e.message ?: "il computer non risponde"}"; inCorso = null }
                                            }
                                        }
                                    ) { Text(if (inCorso == chiave) "Porto…" else if (w.daPortare > 0) "Porta qui (${w.daPortare})" else "Crea qui") }
                                }
                            }
                            TextButton(onClick = { espansi = if (chiave in espansi) espansi - chiave else espansi + chiave }) {
                                Text(if (chiave in espansi) "Nascondi le chat" else "Vedi le ${w.chat.size} chat", fontSize = 12.sp)
                            }
                            if (chiave in espansi) for (ch in w.chat) {
                                Row(Modifier.padding(start = 8.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(ch.titolo, color = Banco.testo, fontSize = 12.sp, maxLines = 1)
                                        Text(ch.progetto ?: "", color = Banco.testoQuieto, fontSize = 10.sp, maxLines = 1)
                                    }
                                    Spacer(Modifier.width(6.dp))
                                    Text(statoChat(ch), color = coloreStatoChat(ch.stato), fontSize = 10.sp, maxLines = 1)
                                }
                            }
                        }
                        HorizontalDivider(color = Banco.incisione)
                    }
                }
            }
        }
    }
}

private fun etichettaLavoro(tipo: String): String = when (tipo) {
    "fusione" -> "Fondo con il Drive"
    "ripristino" -> "Ripristino dal Drive"
    "salvataggio" -> "Salvo sul Drive"
    else -> tipo
}

private fun statoProgetto(g: ProgettoCatalogo): String = when (g.stato) {
    "allineato" -> "allineato: il computer ha già tutto"
    "daPortare" -> "${g.conti.soloDrive + g.file.soloDrive} da portare sul computer"
    "daAggiornare" -> "${g.conti.indietro + g.file.indietro} da aggiornare sul computer"
    "soloQui" -> "solo sul computer: sale al prossimo salvataggio"
    else -> "${g.conti.soloDrive + g.conti.indietro + g.file.soloDrive + g.file.indietro} da portare · ${g.conti.soloQui + g.conti.avanti + g.file.soloQui + g.file.avanti} da mandare su"
}

private fun coloreStato(stato: String): Color = when (stato) {
    "allineato", "soloQui" -> Banco.verde
    else -> Banco.ambra
}

private fun statoChat(c: ChatCatalogo): String = when {
    c.altroveQui != null -> "già sul computer"
    c.stato == "uguale" -> "uguale"
    c.stato == "indietro" -> "da aggiornare"
    c.stato == "avanti" -> "più avanti sul computer"
    c.stato == "soloDrive" -> "solo sul Drive"
    else -> "solo sul computer"
}

private fun coloreStatoChat(stato: String): Color = when (stato) {
    "indietro", "soloDrive" -> Banco.ambra
    else -> Banco.verde
}
