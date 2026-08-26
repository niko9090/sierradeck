package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Il colore che riassume lo stato di un autopilota (un punto, non una teoria). */
fun coloreStato(stato: String): Color = when (stato) {
    "lavoro" -> Banco.verde
    "pronto", "attesa" -> Banco.ambra
    "sospeso", "fallito" -> Banco.rosso
    "finito" -> Banco.accento
    else -> Banco.testoQuieto
}

/**
 * «Lavori»: gli autopiloti, con dentro tutto quello che il pannello del computer
 * mostra — dove sono nel percorso, i criteri che si sono dati, cosa hanno deciso.
 */
@Composable
fun Lavori(api: Api, stato: Stato?) {
    var aperto by remember { mutableStateOf<String?>(null) }
    var delega by remember { mutableStateOf(false) }
    val lista = stato?.autopiloti ?: emptyList()

    LaunchedEffect(lista, aperto) {
        if (aperto != null && lista.none { it.id == aperto }) aperto = null
    }

    val breve = lista.firstOrNull { it.id == aperto }
    if (breve != null) {
        BackHandler { aperto = null }
        DettaglioAutopilota(api, breve, onIndietro = { aperto = null })
    } else {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(12.dp)) {
                TextButton(onClick = { delega = true }) { Text("+ Affida un lavoro") }
            }
            HorizontalDivider(color = Banco.incisione)
            if (lista.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Nessun autopilota.", color = Banco.testoQuieto)
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(lista, key = { it.id }) { ap ->
                        Card(
                            onClick = { aperto = ap.id },
                            colors = CardDefaults.cardColors(containerColor = Banco.chassis),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Punto(coloreStato(ap.stato))
                                Spacer(Modifier.size(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(ap.nome, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1)
                                    val riga = ap.motivo.ifBlank { ap.stato }
                                    Text(riga, color = Banco.testoQuieto, fontSize = 13.sp, maxLines = 1)
                                }
                                Text("${ap.fatti}/${ap.criteri}", color = Banco.testoQuieto, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
        if (delega) Delega(api, onChiudi = { delega = false })
    }
}

@Composable
private fun Punto(colore: Color) {
    Box(Modifier.size(10.dp).clip(CircleShape).background(colore))
}

@Composable
private fun DettaglioAutopilota(api: Api, breve: AutopilotaBreve, onIndietro: () -> Unit) {
    var d by remember(breve.id) { mutableStateOf<AutopilotaDettaglio?>(null) }
    var quadernoAperto by remember { mutableStateOf(false) }
    var eliminando by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(breve.id) {
        while (isActive) {
            try { d = api.autopilota(breve.id) } catch (_: Exception) {}
            delay(2000)
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onIndietro) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro", tint = Banco.testo)
            }
            Punto(coloreStato(d?.stato ?: breve.stato))
            Spacer(Modifier.size(8.dp))
            Text(breve.nome, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.weight(1f))
        }
        HorizontalDivider(color = Banco.incisione)

        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
            val det = d
            // ─── azioni contestuali ───
            AzioniAutopilota(api, breve.id, det?.stato ?: breve.stato)

            Spacer(Modifier.height(16.dp))
            // ─── i tre passi ───
            if (det != null && det.passaggi.isNotEmpty()) {
                Passaggi(det.passaggi)
                Spacer(Modifier.height(10.dp))
                Misura(det.misura)
                Spacer(Modifier.height(16.dp))
            }

            // ─── obiettivo ───
            Etichetta("GLI HAI CHIESTO")
            Text(det?.obiettivoTuo ?: det?.obiettivo ?: breve.nome, color = Banco.testo)
            if (det?.obiettivoTuo != null && det.obiettivo.isNotBlank() && det.obiettivo != det.obiettivoTuo) {
                Spacer(Modifier.height(10.dp))
                Etichetta("HA CAPITO COSÌ")
                Text(det.obiettivo, color = Banco.testoQuieto)
            }

            // ─── criteri ───
            if (!det?.criteri.isNullOrEmpty()) {
                Spacer(Modifier.height(16.dp))
                Etichetta("CRITERI")
                for (c in det!!.criteri) Criterio(c)
            }

            // ─── decisioni ───
            if (!det?.decisioni.isNullOrEmpty()) {
                Spacer(Modifier.height(16.dp))
                Etichetta("STA RAGIONANDO COSÌ")
                for (dec in det!!.decisioni.takeLast(6).reversed()) {
                    Text("• ${dec.cosa}", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(vertical = 3.dp))
                }
            }

            // ─── riparti al riavvio + quaderno + elimina ───
            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Riparte al riavvio", color = Banco.testo, modifier = Modifier.weight(1f))
                Switch(
                    checked = det?.riprendiAlRiavvio ?: true,
                    onCheckedChange = { v -> scope.launch { try { api.riavvioAutopilota(breve.id, v) } catch (_: Exception) {} } }
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { quadernoAperto = true }) { Text("Quaderno") }
                TextButton(onClick = { eliminando = true }) { Text("Elimina", color = Banco.rosso) }
            }
        }
    }

    if (quadernoAperto) Quaderno(api, breve.cwd, onChiudi = { quadernoAperto = false })
    if (eliminando) {
        AlertDialog(
            onDismissRequest = { eliminando = false },
            title = { Text("Eliminare l’autopilota?") },
            text = { Text("Sparisce con il suo lavoro. Non si disfa.") },
            confirmButton = {
                TextButton(onClick = {
                    eliminando = false
                    scope.launch { try { api.eliminaAutopilota(breve.id) } catch (_: Exception) {} }
                    onIndietro()
                }) { Text("Elimina", color = Banco.rosso) }
            },
            dismissButton = { TextButton(onClick = { eliminando = false }) { Text("Annulla") } }
        )
    }
}

@Composable
private fun AzioniAutopilota(api: Api, id: String, stato: String) {
    val scope = rememberCoroutineScope()
    when (stato) {
        "pronto" -> Button(
            onClick = { scope.launch { try { api.vaiAutopilota(id) } catch (_: Exception) {} } },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Vai") }
        "lavoro", "attesa" -> OutlinedButton(
            onClick = { scope.launch { try { api.fermaAutopilota(id) } catch (_: Exception) {} } },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Ferma") }
        else -> Button(
            onClick = { scope.launch { try { api.riprendiAutopilota(id) } catch (_: Exception) {} } },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Riprendi") }
    }
}

@Composable
private fun Passaggi(passi: List<Passo>) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (p in passi) {
            val colore = when (p.stato) {
                "fatto" -> Banco.verde
                "corrente" -> Banco.accento
                "attesa" -> Banco.ambra
                "fermo" -> Banco.rosso
                else -> Banco.incisione
            }
            Column(Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(colore))
                Spacer(Modifier.height(4.dp))
                Text(p.nome, color = if (p.stato == "davanti") Banco.testoQuieto else Banco.testo, fontSize = 12.sp)
            }
        }
    }
    val nota = passi.firstOrNull { it.nota != null }?.nota
    if (nota != null) {
        Spacer(Modifier.height(6.dp))
        Text(nota, color = Banco.testoQuieto, fontSize = 13.sp)
    }
}

@Composable
private fun Misura(m: MisuraPasso) {
    val colore = when (m.tono) {
        "lavoro" -> Banco.verde
        "attesa" -> Banco.ambra
        "fermo" -> Banco.rosso
        else -> Banco.accento
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        LinearProgressIndicator(
            progress = { m.percento / 100f },
            color = colore,
            trackColor = Banco.incisione,
            modifier = Modifier.weight(1f).height(6.dp)
        )
        Spacer(Modifier.size(10.dp))
        Text("${m.percento}%", color = colore, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
    if (m.dettaglio.isNotBlank()) {
        Text("${m.dettaglio} ${m.di}".trim(), color = Banco.testoQuieto, fontSize = 12.sp)
    }
}

@Composable
private fun Criterio(c: Criterio) {
    Column(Modifier.padding(vertical = 5.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Text(if (c.soddisfatto) "✓ " else "◦ ", color = if (c.soddisfatto) Banco.verde else Banco.testoQuieto)
            Text(c.descrizione, color = Banco.testo, modifier = Modifier.weight(1f))
        }
        if (c.comando != null) {
            Text(c.comando, color = Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(start = 18.dp))
        }
        if (c.raggiuntoIl != null) {
            Text("raggiunto ${c.raggiuntoIl}", color = Banco.verde, fontSize = 11.sp, modifier = Modifier.padding(start = 18.dp))
        }
    }
}

@Composable
private fun Etichetta(testo: String) {
    Text(testo, color = Banco.accento, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(4.dp))
}

/** Affida un lavoro nuovo: obiettivo + una cartella conosciuta. */
@Composable
private fun Delega(api: Api, onChiudi: () -> Unit) {
    var obiettivo by remember { mutableStateOf("") }
    var cartelle by remember { mutableStateOf<List<String>?>(null) }
    var scelta by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { cartelle = try { api.cartelle().cartelle } catch (_: Exception) { emptyList() } }

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Affida un lavoro") },
        text = {
            Column(Modifier.fillMaxWidth().height(360.dp)) {
                OutlinedTextField(
                    value = obiettivo,
                    onValueChange = { obiettivo = it },
                    label = { Text("Cosa deve fare") },
                    modifier = Modifier.fillMaxWidth().height(120.dp)
                )
                Spacer(Modifier.height(10.dp))
                Text("In quale cartella:", color = Banco.testoQuieto, fontSize = 12.sp)
                Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
                    for (c in cartelle ?: emptyList()) {
                        val sel = c == scelta
                        Text(
                            c.substringAfterLast('\\').substringAfterLast('/'),
                            color = if (sel) Banco.accento else Banco.testo,
                            fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.fillMaxWidth().clickable { scelta = c }.padding(vertical = 8.dp)
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = obiettivo.isNotBlank() && scelta != null,
                onClick = {
                    val o = obiettivo; val c = scelta!!
                    onChiudi()
                    scope.launch { try { api.creaAutopilota(o, c) } catch (_: Exception) {} }
                }
            ) { Text("Affida") }
        },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
}

/** Il quaderno di una cartella: le schede lasciate dall'autopilota. */
@Composable
private fun Quaderno(api: Api, cwd: String, onChiudi: () -> Unit) {
    var schede by remember { mutableStateOf<List<SchedaBreve>?>(null) }
    var aperta by remember { mutableStateOf<SchedaPiena?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(cwd) { schede = try { api.quaderno(cwd).schede } catch (_: Exception) { emptyList() } }

    AlertDialog(
        onDismissRequest = { if (aperta != null) aperta = null else onChiudi() },
        title = { Text(aperta?.titolo?.ifBlank { "Quaderno" } ?: "Quaderno") },
        text = {
            Column(Modifier.fillMaxWidth().height(380.dp).verticalScroll(rememberScrollState())) {
                val ap = aperta
                if (ap != null) {
                    Text(ap.corpo, color = Banco.testo, fontSize = 13.sp)
                } else when {
                    schede == null -> Text("Carico…", color = Banco.testoQuieto)
                    schede!!.isEmpty() -> Text("Nessuna scheda in questa cartella.", color = Banco.testoQuieto)
                    else -> for (s in schede!!) {
                        Text(
                            s.titolo.ifBlank { s.file },
                            color = Banco.testo,
                            modifier = Modifier.fillMaxWidth().clickable {
                                scope.launch { aperta = try { api.scheda(cwd, s.file) } catch (_: Exception) { null } }
                            }.padding(vertical = 10.dp)
                        )
                        HorizontalDivider(color = Banco.incisione)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = { if (aperta != null) aperta = null else onChiudi() }) {
                Text(if (aperta != null) "Indietro" else "Chiudi")
            }
        }
    )
}
