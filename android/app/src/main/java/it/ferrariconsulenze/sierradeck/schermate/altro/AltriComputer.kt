package it.ferrariconsulenze.sierradeck.schermate.altro

import it.ferrariconsulenze.sierradeck.schermate.altro.*
import it.ferrariconsulenze.sierradeck.schermate.file.*
import it.ferrariconsulenze.sierradeck.schermate.comune.*
import it.ferrariconsulenze.sierradeck.schermate.radice.*
import it.ferrariconsulenze.sierradeck.nucleo.*

import androidx.compose.ui.Alignment
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.border
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.nucleo.FunzionePc
import it.ferrariconsulenze.sierradeck.nucleo.FunzioniPc
import it.ferrariconsulenze.sierradeck.nucleo.PcCorrente
import it.ferrariconsulenze.sierradeck.nucleo.PcRemoto
import it.ferrariconsulenze.sierradeck.nucleo.TonoChat
import it.ferrariconsulenze.sierradeck.nucleo.VocePosta
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.MappaPc
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.Tessera
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco

/**
 * Gli altri computer (app 2.61.0 in Salute, 2.83.0 in Altro): accesi o spenti,
 * le chat aperte, «Chat di X dal vivo», «Installa là» e la cassetta delle azioni.
 * Legge l'elenco dei PC ogni 15 secondi e la cassetta aperta ogni 10, solo mentre si vede.
 */
@Composable
fun AltriComputer(api: Api) {
    val scope = rememberCoroutineScope()
    // La posta per un PC: gli altri computer, la cassetta di quello aperto.
    var pcVisti by remember { mutableStateOf<List<PcRemoto>?>(null) }
    var pcDisponibile by remember { mutableStateOf(true) }
    var ultima by remember { mutableStateOf<String?>(null) }
    var pcAperto by remember { mutableStateOf<String?>(null) }
    var postaVoci by remember { mutableStateOf<List<VocePosta>>(emptyList()) }
    var postaCwd by remember { mutableStateOf("") }
    var postaTesto by remember { mutableStateOf("") }
    var postaNota by remember { mutableStateOf<String?>(null) }
    var mappaAperta by remember { mutableStateOf(false) }
    var mappa by remember { mutableStateOf<MappaPc?>(null) }
    var mappaLetta by remember { mutableStateOf(false) }
    LaunchedEffect(mappaAperta) {
        if (!mappaAperta) return@LaunchedEffect
        try { mappa = api.salute().mappa } catch (_: Exception) { }
        mappaLetta = true
    }
    LaunchedEffect(Unit) {
        while (isActive) {
            try { val e = api.pc(); pcVisti = e.pc; pcDisponibile = e.disponibile } catch (_: Exception) { if (pcVisti == null) pcVisti = emptyList() }
            // L'ultima versione che il PC collegato ha trovato (disponibile, scaricata o in installazione):
            // un altro PC più vecchio di quella si può aggiornare da qui.
            try { api.aggiornamento().takeIf { it.fase in listOf("disponibile", "scarico", "pronto", "attendo", "installo") }?.versione?.let { ultima = it } } catch (_: Exception) { }
            Davanti.pausa(15_000)
        }
    }
    LaunchedEffect(pcAperto) {
        val id = pcAperto ?: return@LaunchedEffect
        while (isActive) {
            try { postaVoci = api.posta(id).voci; postaNota = null } catch (e: Exception) { postaNota = "Non riesco a leggere la cassetta." }
            Davanti.pausa(10_000)
        }
    }
        // Gli altri computer, e le azioni da eseguire solo la'. Nicholas
        // (2026-09-14): «se sto operando su una chat su una cartella in rete
        // gli altri come fanno a operare li'?». Si scrive nella cassetta di
        // quel PC; consegna il suo postino, quando e' acceso.
        Sezione("Computer", aiuto = "I tuoi PC che usano lo stesso Drive, con le chat che hanno aperte (dal loro battito, ogni pochi minuti): acceso, spento o in aggiornamento, come sul PC. Pallino verde = al lavoro, grigio = ferma (ha finito il turno). Si raggiungono con le stesse strade del PC (rete di casa, Tailscale) e solo con la chiave della stessa cassaforte. «Azioni» lascia un'istruzione nella cassetta di quel PC: si esegue solo là, in una sua chat, quando è acceso — serve per una cartella che sta su quel PC (un disco di rete, un progetto che non viaggia). Se la cartella là non esiste, la voce fallisce e lo leggi qui.")
        Spacer(Modifier.height(8.dp))
        // Questo computer, quello a cui il telefono è accoppiato: sempre acceso, se ti risponde.
        Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Text(PcCorrente.nome?.takeIf { it.isNotBlank() } ?: "Questo computer", color = Banco.testo, maxLines = 1)
                Text("acceso · questo computer" + (PcCorrente.versione?.let { " · $it" } ?: ""), color = Banco.verde, fontSize = 12.sp)
            }
        }
        val pcs = pcVisti
        when {
            !pcDisponibile -> Text("Questo computer non sa ancora mandare azioni a un altro PC: aggiornalo.", color = Banco.testoQuieto)
            pcs == null -> Text("Leggo il Drive…", color = Banco.testoQuieto)
            pcs.isEmpty() -> Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Nessun altro PC sul Drive.", color = Banco.testoQuieto, modifier = Modifier.weight(1f))
                Aiuto("Un altro PC compare qui quando lascia un segno sul Drive: serve SierraDeck 0.27.0 o più nuovo su quel PC, con la cassaforte sbloccata e il Drive collegato.", di = "Altri computer")
            }
            else -> for (p in pcs) {
                val aperto = pcAperto == p.pcId
                Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(p.mostra, color = Banco.testo, maxLines = 1)
                                p.sotto?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1) }
                                val parola = StatoPcVista.parola(p, System.currentTimeMillis())
                                Text(
                                    parola.testo + " · ${p.chat.size} chat aperte · ${p.cartelle.size} cartelle",
                                    color = when (parola.colore) { StatoPcVista.Colore.VERDE -> Banco.verde; StatoPcVista.Colore.BLU -> Banco.accento; else -> Banco.testoQuieto },
                                    fontSize = 12.sp
                                )
                            }
                            OutlinedButton(onClick = {
                                pcAperto = if (aperto) null else p.pcId
                                postaVoci = emptyList(); postaTesto = ""; postaNota = null
                                postaCwd = p.cartelle.firstOrNull() ?: ""
                            }) { Text(if (aperto) "Chiudi" else "Azioni") }
                        }
                        // Indietro con la versione (app 2.56.2): cosa manca là, e «Installa là».
                        if (p.vivo) BandaPcIndietro(api, p.pcId, p.mostra, p.versione, ultima)
                        // Le chat aperte su quel PC, con chi aspetta: il battito le
                        // porta da sempre e il telefono ne mostrava solo il numero.
                        // Da qui si vede chi si e' fermato anche su un computer con
                        // cui il telefono non e' accoppiato.
                        if (p.chat.isNotEmpty()) {
                            Spacer(Modifier.height(6.dp))
                            for (ch in p.chat.take(8)) {
                                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                                    LedChat(if (!p.vivo) null else if (ch.aspetta) TonoChat.FERMA else TonoChat.LAVORA)
                                    Spacer(Modifier.width(8.dp))
                                    Text(ch.titolo.ifBlank { ch.cwd }, color = Banco.testo, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
                                    Text(
                                        // 0.80.0: «ferma» e grigio come il LED accanto (prima «aspetta te» in ambra).
                                        if (!p.vivo) "ultimo stato noto" else if (ch.aspetta) "ferma" else "al lavoro",
                                        color = Banco.testoQuieto, fontSize = 12.sp
                                    )
                                }
                            }
                            if (p.chat.size > 8) Text("e altre ${p.chat.size - 8}", color = Banco.testoQuieto, fontSize = 12.sp)
                        }
                        if (aperto) {
                            Spacer(Modifier.height(8.dp))
                            val attesa = postaVoci.filter { it.stato == "attesa" }
                            val chiuse = postaVoci.filter { it.stato != "attesa" }
                            val nota = postaNota
                            if (nota != null) Text(nota, color = Banco.rosso, fontSize = 12.sp)
                            if (attesa.isEmpty()) Text("Nessuna azione in attesa.", color = Banco.testoQuieto, fontSize = 12.sp)
                            for ((i, v) in attesa.withIndex()) {
                                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("${i + 1}. ${v.testo}", color = Banco.testo, fontSize = 13.sp)
                                        Text("in ${v.cwd} · da ${v.daNome}" + (if (v.apertaIl != null) " · chat aperta, aspetto che sia pronta" else ""), color = Banco.testoQuieto, fontSize = 12.sp)
                                    }
                                    TextButton(onClick = { scope.launch { try { postaVoci = api.postaTogli(p.pcId, v.id).voci } catch (e: Exception) { postaNota = "Non sono riuscito a togliere la voce." } } }) { Text("Togli") }
                                }
                            }
                            if (chiuse.isNotEmpty()) {
                                for (v in chiuse.takeLast(5)) {
                                    Text((if (v.stato == "fallita") "✗ " else "✓ ") + v.testo.take(60) + " — " + (v.esito ?: v.stato), color = if (v.stato == "fallita") Banco.ambra else Banco.testoQuieto, fontSize = 12.sp)
                                }
                                TextButton(onClick = { scope.launch { try { postaVoci = api.postaPulisci(p.pcId).voci } catch (e: Exception) { postaNota = "Non sono riuscito a pulire." } } }) { Text("Pulisci le chiuse") }
                            }
                            Spacer(Modifier.height(8.dp))
                            if (p.cartelle.isNotEmpty()) {
                                Text("In quale cartella di ${p.mostra}:", color = Banco.testoQuieto, fontSize = 12.sp)
                                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    for (c in p.cartelle) {
                                        FilterChip(selected = postaCwd == c, onClick = { postaCwd = c }, label = { Text(c.substringAfterLast('\\').substringAfterLast('/'), fontSize = 12.sp) })
                                    }
                                }
                            }
                            OutlinedTextField(
                                value = postaCwd,
                                onValueChange = { postaCwd = it },
                                label = { Text("La cartella com'è su quel PC") },
                                textStyle = LocalTextStyle.current.copy(fontSize = 13.sp),
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(6.dp))
                            OutlinedTextField(
                                value = postaTesto,
                                onValueChange = { postaTesto = it.take(4000) },
                                placeholder = { Text("L'azione, come la scriveresti nella chat di quel PC", color = Banco.testoQuieto, fontSize = 14.sp) },
                                textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                                minLines = 2,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(
                                enabled = postaTesto.isNotBlank() && postaCwd.isNotBlank(),
                                colors = it.ferrariconsulenze.sierradeck.schermate.tema.coloriTastoPieno(),
                                shape = MaterialTheme.shapes.small,
                                onClick = {
                                    val t = postaTesto.trim(); val c = postaCwd.trim()
                                    scope.launch {
                                        try { postaVoci = api.postaAggiungi(p.pcId, c, t).voci; postaTesto = ""; postaNota = null }
                                        catch (e: Api.Errore) { postaNota = if (e.codice == 409) "La posta sta sul Drive: sul computer serve la cassaforte sbloccata e il Drive collegato." else "Non sono riuscito a mandare (HTTP ${e.codice})." }
                                        catch (e: Exception) { postaNota = "Non sono riuscito a mandare: ${e.message ?: "il computer non risponde"}" }
                                    }
                                }
                            ) { Text("Manda a ${p.mostra}") }
                        }
                    }
                }
            }
        }
        // La mappa dei PC (PC 0.51.0), che prima stava in Salute: a richiesta.
        if (FunzioniPc.disponibile(FunzionePc.SALUTE, PcCorrente.versione) != false) {
            TextButton(onClick = { mappaAperta = !mappaAperta }) { Text(if (mappaAperta) "Nascondi la mappa" else "Mappa dei PC") }
            if (mappaAperta) {
                val m = mappa
                if (m != null && m.nodi.size > 1) MappaPcVista(m) else Text(if (mappaLetta) "Un solo computer: niente da mappare." else "Guardo…", color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
}
