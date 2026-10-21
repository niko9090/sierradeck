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
 * Le schede delle domande di un PC più vecchio della 0.36 (prima delle
 * conversazioni), e il campo per rispondere: dalla 2.83.0 le mostra Adesso
 * (`DomandeAdesso.kt`), in cima. Tre famiglie: un **autopilota** che chiede,
 * una **chat che aspetta una scelta**, una **chat che ha finito**.
 */
internal fun VoceDomanda.chiave(): String = when (tipo) {
    "autopilota" -> "d:$id"
    "scelta" -> "s:$chat:" + opzioni.joinToString("|") { it.testo }
    else -> "c:$chat"
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
            Text(r, color = Banco.testo, fontSize = 12.sp, fontFamily = FontTerminale, lineHeight = 17.sp)
        }
    }
}

@Composable
internal fun CampoRisposta(
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
                        // Il PC (0.52.5) dice perché: per esempio quali sono le opzioni di un permesso.
                        errore = SceltaVista.rifiuto(e, "mandarla")
                    }
                    inCorso = false
                }
            }
        ) { Text(if (inCorso) "Mando…" else tasto) }
    }
}

@Composable
internal fun SchedaAutopilota(api: Api, v: VoceDomanda, gia: String?, onMandata: (String) -> Unit) {
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
internal fun SchedaScelta(api: Api, v: VoceDomanda, gia: String?, onMandata: (String) -> Unit) {
    var errore by remember(v.chiave()) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(3.dp).height(30.dp).background(Banco.ambra))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("«${v.titolo.ifBlank { v.cwd }}» aspetta che tu scelga", color = Banco.ambra, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(v.cwd, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                }
                ApriLaChat(v.chat)
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
                                // «Type something.» (2.52.5): si scrive nel campo qui sotto.
                                if (o.libera) { errore = SceltaVista.SCRIVI; return@clickable }
                                scope.launch {
                                    try {
                                        api.scegli(v.chat, o.testo)
                                        onMandata(o.testo)
                                    } catch (e: Exception) {
                                        errore = SceltaVista.rifiuto(e, "mandarla")
                                    }
                                }
                            }
                            .padding(horizontal = 12.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TestoOpzione(o)
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
internal fun SchedaChatFerma(api: Api, v: VoceDomanda, gia: String?, onMandata: (String) -> Unit) {
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("«${v.titolo.ifBlank { v.cwd }}» ha finito", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(v.cwd, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                }
                ApriLaChat(v.chat)
            }
            Spacer(Modifier.height(8.dp))
            Contesto(v.righe)
            Spacer(Modifier.height(8.dp))
            CampoRisposta("Scrivi alla chat…", "Manda", gia, { api.scrivi(v.chat, it) }, onMandata)
        }
    }
}

/**
 * Entra nella chat, nella scheda Chat.
 *
 * La voce ha gia' il contesto e il modo di rispondere, ma a volte serve
 * vedere tutta la conversazione prima di decidere: prima si tornava alla
 * scheda Chat e la si cercava a mano nell'elenco.
 */
@Composable
private fun ApriLaChat(chat: String) {
    if (chat.isBlank()) return
    androidx.compose.material3.TextButton(onClick = { Apertura.apriChat(chat) }) {
        Text("Apri la chat", fontSize = 12.sp)
    }
}
