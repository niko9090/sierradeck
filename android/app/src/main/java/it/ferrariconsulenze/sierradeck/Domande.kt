package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * La scheda «Domande»: tutto quello che aspetta una risposta da te, in un
 * posto solo, e senza mai bloccare il resto dell'app.
 *
 * Nicholas (22/09/2026): «non riesco a vedere e a rispondere bene alle
 * domande, sia della chat che quelle iniziali. Voglio una sezione a parte,
 * non bloccante». Prima una domanda compariva come banda con una finestra
 * modale (una sola, le altre invisibili), le scelte del terminale si vedevano
 * solo dentro la chat, e le chat ferme solo nelle notifiche.
 *
 * Tre famiglie, dal computer (`/api/domande`), nell'ordine in cui vanno lette:
 * - un **autopilota** che chiede: la sua intervista prima di partire, o una
 *   decisione mentre lavora. Si risponde con parole.
 * - una **chat che aspetta una scelta**: un elenco numerato (permessi, «vuoi
 *   procedere?», conversazione da riprendere). Si tocca l'opzione, o si scrive.
 * - una **chat che ha finito e aspetta te**: si legge cosa ha scritto per
 *   ultimo e le si scrive.
 *
 * Ogni scheda ha dentro tutto: chi chiede, cosa, e il modo di rispondere.
 * Sparisce da sola quando il computer smette di elencarla.
 */
@Composable
fun Domande(api: Api, stato: Stato?) {
    var voci by remember { mutableStateOf<List<VoceDomanda>?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    // Le risposte gia' mandate, finche' il computer non toglie la voce: un
    // pulsante che resta invita a premerlo due volte.
    val mandate = remember { mutableStateMapOf<String, String>() }

    LaunchedEffect(api) {
        while (isActive) {
            try {
                voci = api.domande().voci
                guasto = null
            } catch (e: Exception) {
                guasto = if (e is Api.Errore && e.codice == 404)
                    "Questo computer non ha ancora la sezione Domande: aggiornalo alla 0.30."
                else e.message ?: "il computer non risponde"
            }
            delay(2000)
        }
    }

    val elenco = voci
    LazyColumn(Modifier.fillMaxSize().background(Banco.fondo), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        item {
            Text("DOMANDE", color = Banco.testoQuieto, fontSize = 10.sp, letterSpacing = 1.sp)
            Spacer(Modifier.height(6.dp))
        }
        guasto?.let { g ->
            item {
                Text(g, color = Banco.ambra, fontSize = 13.sp)
                Spacer(Modifier.height(10.dp))
            }
        }
        if (elenco == null) {
            item { Text("Leggo dal computer…", color = Banco.testoQuieto, fontSize = 13.sp) }
        } else if (elenco.isEmpty()) {
            item { NienteDaRispondere() }
        } else {
            val chiedono = elenco.filter { it.tipo != "chat" }
            val ferme = elenco.filter { it.tipo == "chat" }
            items(chiedono, key = { it.chiave() }) { v ->
                val gia = mandate[v.chiave()]
                when (v.tipo) {
                    "autopilota" -> SchedaAutopilota(api, v, gia) { mandate[v.chiave()] = it }
                    else -> SchedaScelta(api, v, gia) { mandate[v.chiave()] = it }
                }
                Spacer(Modifier.height(12.dp))
            }
            if (ferme.isNotEmpty()) {
                item {
                    Spacer(Modifier.height(6.dp))
                    Text("CHAT CHE HANNO FINITO E ASPETTANO TE", color = Banco.testoQuieto, fontSize = 10.sp, letterSpacing = 1.sp)
                    Text(
                        "Non sono domande: hanno chiuso il turno e aspettano la prossima istruzione. Non contano nel pallino.",
                        color = Banco.testoQuieto, fontSize = 11.sp
                    )
                    Spacer(Modifier.height(8.dp))
                }
                items(ferme, key = { it.chiave() }) { v ->
                    SchedaChatFerma(api, v, mandate[v.chiave()]) { mandate[v.chiave()] = it }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
    // Le voci sparite si dimenticano: se la stessa chat chiede di nuovo, e'
    // una domanda nuova e i pulsanti devono tornare.
    LaunchedEffect(elenco) {
        val vive = elenco?.map { it.chiave() }?.toSet() ?: return@LaunchedEffect
        mandate.keys.filter { it !in vive }.forEach { mandate.remove(it) }
    }
}

private fun VoceDomanda.chiave(): String = when (tipo) {
    "autopilota" -> "d:$id"
    "scelta" -> "s:$chat:" + opzioni.joinToString("|") { it.testo }
    else -> "c:$chat"
}

@Composable
private fun NienteDaRispondere() {
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text("Niente da rispondere", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Spacer(Modifier.height(6.dp))
            Text(
                "Qui compaiono, senza bloccare niente: le domande che un autopilota ti fa prima di partire o mentre lavora; " +
                    "le scelte che una chat aspetta (un permesso, «vuoi procedere?», un elenco numerato); " +
                    "e le chat che hanno finito e aspettano una tua istruzione. Ogni voce ha dentro il modo di rispondere, " +
                    "e sparisce da sola quando il computer riceve la risposta. Il pallino sulla scheda conta domande e scelte.",
                color = Banco.testoQuieto, fontSize = 12.sp
            )
        }
    }
}

/** Le righe di schermo che fanno da contesto: monospazio, piccole, senza cornici. */
@Composable
private fun Contesto(righe: List<String>) {
    if (righe.isEmpty()) return
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Banco.fondo)
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        for (r in righe) {
            Text(r, color = Banco.testo, fontSize = 12.sp, fontFamily = FontFamily.Monospace, lineHeight = 17.sp)
        }
    }
}

@Composable
private fun CampoRisposta(
    segnaposto: String,
    tasto: String,
    gia: String?,
    manda: suspend (String) -> Unit,
    onMandata: (String) -> Unit
) {
    var testo by remember { mutableStateOf("") }
    var inCorso by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    if (gia != null) {
        Text("Mandata: «${gia.take(80)}». Sparisce appena il computer la riceve.", color = Banco.verde, fontSize = 12.sp)
        return
    }
    OutlinedTextField(
        value = testo,
        onValueChange = { testo = it.take(50_000) },
        placeholder = { Text(segnaposto, color = Banco.testoQuieto, fontSize = 13.sp) },
        textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
        maxLines = 6,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Banco.accento,
            unfocusedBorderColor = Banco.incisione,
            focusedContainerColor = Banco.fondo,
            unfocusedContainerColor = Banco.fondo
        ),
        modifier = Modifier.fillMaxWidth()
    )
    errore?.let {
        Spacer(Modifier.height(4.dp))
        Text(it, color = Banco.rosso, fontSize = 12.sp)
    }
    Spacer(Modifier.height(8.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Button(
            enabled = !inCorso && testo.isNotBlank(),
            onClick = {
                val da = testo
                inCorso = true
                errore = null
                scope.launch {
                    // Si segna come mandata **solo se e' partita**: prima il
                    // testo spariva anche quando la richiesta cadeva.
                    try {
                        manda(da)
                        onMandata(da)
                        testo = ""
                    } catch (e: Exception) {
                        errore = "Non sono riuscito a mandarla: ${e.message ?: "il computer non risponde"}"
                    }
                    inCorso = false
                }
            }
        ) { Text(if (inCorso) "Mando…" else tasto) }
    }
}

@Composable
private fun SchedaAutopilota(api: Api, v: VoceDomanda, gia: String?, onMandata: (String) -> Unit) {
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(3.dp).height(30.dp).background(Banco.ambra))
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        if (v.origine == "intervista") "«${v.autopilota}» ti chiede, prima di partire"
                        else "«${v.autopilota}» ti chiede",
                        color = Banco.ambra, fontWeight = FontWeight.Bold, fontSize = 14.sp
                    )
                    Text(
                        if (v.origine == "intervista") "Sta leggendo il progetto: senza questa risposta non comincia."
                        else "Si è fermato su questo punto: riparte quando rispondi.",
                        color = Banco.testoQuieto, fontSize = 11.sp
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(v.testo, color = Banco.testo, fontSize = 15.sp, lineHeight = 21.sp)
            Spacer(Modifier.height(10.dp))
            CampoRisposta("La tua risposta", "Rispondi", gia, { api.rispondi(v.id, it) }, onMandata)
        }
    }
}

@Composable
private fun SchedaScelta(api: Api, v: VoceDomanda, gia: String?, onMandata: (String) -> Unit) {
    var errore by remember(v.chiave()) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(3.dp).height(30.dp).background(Banco.ambra))
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("«${v.titolo.ifBlank { v.cwd }}» aspetta che tu scelga", color = Banco.ambra, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(v.cwd, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                }
            }
            Spacer(Modifier.height(10.dp))
            Contesto(v.righe)
            Spacer(Modifier.height(10.dp))
            if (gia != null) {
                Text("Scelta mandata: «${gia.take(60)}». Sparisce appena lo schermo cambia.", color = Banco.verde, fontSize = 12.sp)
            } else {
                for (o in v.opzioni) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Banco.fondo)
                            .border(
                                width = if (o.scelta) 2.dp else 1.dp,
                                color = if (o.scelta) Banco.ambra else Banco.incisione,
                                shape = RoundedCornerShape(8.dp)
                            )
                            .clickable {
                                errore = null
                                scope.launch {
                                    try {
                                        api.scegli(v.chat, o.testo)
                                        onMandata(o.testo)
                                    } catch (e: Exception) {
                                        errore = if (e is Api.Errore && e.codice == 409)
                                            (if (e.corpo.contains("mandata")) "Già mandata: aspetta che lo schermo cambi."
                                            else "La scelta è cambiata mentre toccavi: fra un attimo si aggiorna.")
                                        else "Non sono riuscito a mandarla: ${e.message ?: "il computer non risponde"}"
                                    }
                                }
                            }
                            .padding(horizontal = 12.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("${o.numero}", color = Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(end = 10.dp))
                        Text(o.testo, color = Banco.testo, fontSize = 14.sp)
                    }
                }
                errore?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(it, color = Banco.ambra, fontSize = 12.sp)
                }
                Spacer(Modifier.height(8.dp))
                HorizontalDivider(color = Banco.incisione)
                Spacer(Modifier.height(8.dp))
                Text("Oppure scrivile qualcosa:", color = Banco.testoQuieto, fontSize = 11.sp)
                Spacer(Modifier.height(4.dp))
                CampoRisposta("Scrivi alla chat…", "Manda", null, { api.scrivi(v.chat, it) }, onMandata)
            }
        }
    }
}

@Composable
private fun SchedaChatFerma(api: Api, v: VoceDomanda, gia: String?, onMandata: (String) -> Unit) {
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text("«${v.titolo.ifBlank { v.cwd }}» ha finito", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(v.cwd, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
            Spacer(Modifier.height(8.dp))
            Contesto(v.righe)
            Spacer(Modifier.height(8.dp))
            CampoRisposta("Scrivi alla chat…", "Manda", gia, { api.scrivi(v.chat, it) }, onMandata)
        }
    }
}
