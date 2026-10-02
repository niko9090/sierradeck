package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.clickable
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/*
 * La linguetta «Istruzioni» (0.41.0, app 2.45.0): quello che l'autopilota ha
 * scritto alle sue chat, per intero, dalla piu' recente. Nella chat si vede
 * solo «Leggi ed esegui le istruzioni in …»: qui c'e' il testo vero, con l'ora,
 * la chat, il perche' e l'esito. Il testo si seleziona e si copia; il Markdown
 * si disegna con stili di Compose, mai come HTML. «Correggi» manda una nota
 * legata a quell'istruzione (rotta `/api/autopilota/correggi`).
 */

@Serializable
data class Istruzione(
    val id: String = "",
    val quando: String = "",
    val chatId: String = "",
    val chatTitolo: String = "",
    val testo: String = "",
    val perche: String? = null,
    val esito: String = "in-coda",
    val cosa: String = "scrivi"
)

@Serializable
data class IstruzioniAutopilota(val istruzioni: List<Istruzione> = emptyList())

/** L'esito in parole, come sul PC. */
fun esitoIstruzione(e: String): String = when (e) {
    "partita" -> "partita"
    "consegnata" -> "consegnata"
    "non-partita" -> "non partita"
    "persa" -> "mai arrivata"
    else -> "in coda"
}

/** Una riga di Markdown, gia' riconosciuta: titolo, voce di elenco, codice, vuota o testo. */
data class RigaMd(val tipo: String, val testo: String)

/** Le righe di un'istruzione: niente HTML, solo il tipo di ogni riga. */
fun righeMarkdown(testo: String): List<RigaMd> {
    val fuori = mutableListOf<RigaMd>()
    var blocco = false
    for (r in testo.split("\n")) {
        val t = r.trim()
        if (t.startsWith("```")) { blocco = !blocco; continue }
        fuori += when {
            blocco -> RigaMd("codice", r)
            t.isEmpty() -> RigaMd("vuota", "")
            t.startsWith("#") -> RigaMd("titolo", t.trimStart('#').trim())
            t.startsWith("- ") || t.startsWith("* ") -> RigaMd("voce", t.drop(2))
            else -> RigaMd("testo", r)
        }
    }
    return fuori
}

/** Il grassetto fra doppi asterischi e il codice fra apici inversi, come stili. */
fun inRigaMd(testo: String): AnnotatedString = buildAnnotatedString {
    val pezzi = testo.split("`")
    pezzi.forEachIndexed { i, p ->
        if (i % 2 == 1 && i < pezzi.size - 1) withStyle(SpanStyle(fontFamily = FontTerminale)) { append(p) }
        else {
            val b = p.split("**")
            b.forEachIndexed { j, q ->
                if (j % 2 == 1 && j < b.size - 1) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(q) } else append(q)
            }
        }
    }
}

@Composable
fun LinguettaIstruzioni(api: Api, autopilota: String) {
    var lista by remember(autopilota) { mutableStateOf<List<Istruzione>?>(null) }
    var guasto by remember(autopilota) { mutableStateOf<String?>(null) }
    var aperta by remember(autopilota) { mutableStateOf<String?>(null) }
    var correggi by remember(autopilota) { mutableStateOf<String?>(null) }
    var nota by remember(autopilota) { mutableStateOf("") }
    var esito by remember(autopilota) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    // Un computer piu' vecchio della 0.41.0 non le ha: la linguetta si spegne e lo dice.
    val spenta = FunzioniPc.disponibile(FunzionePc.ISTRUZIONI, PcCorrente.versione) == false
    LaunchedEffect(autopilota, spenta) {
        if (spenta) { guasto = FunzioniPc.testoMancante(FunzionePc.ISTRUZIONI); return@LaunchedEffect }
        while (isActive) {
            try { lista = api.istruzioniAutopilota(autopilota).istruzioni; guasto = null } catch (e: Exception) {
                guasto = FunzioniPc.spiega(e, FunzionePc.ISTRUZIONI)
            }
            delay(4000)
        }
    }
    Text(
        "Quello che l'autopilota ha scritto alle sue chat, per intero e dalla più recente. Nella chat spesso vedi solo «Leggi ed esegui le istruzioni in …»: il testo vero è questo. Tocca un'istruzione per aprirla; tieni premuto sul testo per copiarlo. «Correggi» gli scrive una nota legata a quell'istruzione.",
        color = Banco.testoQuieto, fontSize = 12.sp
    )
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    esito?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp) }
    val l = lista
    if (spenta) return
    if (l == null && guasto == null) Text("Leggo le istruzioni…", color = Banco.testoQuieto, fontSize = 13.sp)
    if (l != null && l.isEmpty()) Text("Ancora nessuna istruzione salvata: si salvano dalla 0.41.0 in poi, quando l'autopilota le decide.", color = Banco.testoQuieto, fontSize = 13.sp)
    l?.forEachIndexed { k, i ->
        val apri = aperta == i.id || (aperta == null && k == 0)
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxWidth().clickable { aperta = if (apri) "" else i.id }) {
            Row {
                Text(quandoBreve(i.quando), color = Banco.testoQuieto, fontSize = 11.sp)
                Spacer(Modifier.width(6.dp))
                Text("→ ${i.chatTitolo.ifBlank { i.chatId }}", color = Banco.testo, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Text(
                    esitoIstruzione(i.esito), fontSize = 11.sp,
                    color = when (i.esito) { "partita", "consegnata" -> Banco.verde; "non-partita", "persa" -> Banco.rosso; else -> Banco.ambra }
                )
            }
            if (!apri) Text(i.testo.lineSequence().firstOrNull { it.isNotBlank() }?.trim() ?: "", color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
        }
        if (apri) {
            i.perche?.let { Text("Perché: $it", color = Banco.testo, fontSize = 12.sp) }
            if (i.cosa == "interrompi") Text("Ha interrotto la chat (nessun testo).", color = Banco.testoQuieto, fontSize = 12.sp)
            else SelectionContainer {
                Column(Modifier.padding(top = 4.dp)) {
                    for (r in righeMarkdown(i.testo)) when (r.tipo) {
                        "titolo" -> Text(inRigaMd(r.testo), color = Banco.testo, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        "voce" -> Text(buildAnnotatedString { append("• "); append(inRigaMd(r.testo)) }, color = Banco.testo, fontSize = 13.sp)
                        "codice" -> Text(r.testo, color = Banco.testo, fontSize = 11.sp, fontFamily = FontTerminale)
                        "vuota" -> Spacer(Modifier.height(4.dp))
                        else -> Text(inRigaMd(r.testo), color = Banco.testo, fontSize = 13.sp)
                    }
                }
            }
            if (correggi == i.id) {
                OutlinedTextField(value = nota, onValueChange = { nota = it }, modifier = Modifier.fillMaxWidth(), placeholder = { Text("Cosa c'è di sbagliato, o cosa doveva scrivere invece") })
                Row {
                    Button(enabled = nota.isNotBlank(), onClick = {
                        val testo = nota
                        scope.launch {
                            esito = try { api.correggiIstruzione(autopilota, i.id, testo); nota = ""; correggi = null; "Correzione mandata: la trovi nella chat con lui, con la sua risposta." } catch (e: Exception) { if (FunzioniPc.mancaSulPc(e)) FunzioniPc.testoMancante(FunzionePc.CORREGGI) else "Non mandata: ${e.message}" }
                        }
                    }) { Text("Manda la correzione") }
                    Spacer(Modifier.width(8.dp))
                    OutlinedButton(onClick = { correggi = null }) { Text("Annulla") }
                }
            } else OutlinedButton(onClick = { correggi = i.id; esito = null }) { Text("Correggi") }
        }
    }
}

private fun quandoBreve(iso: String): String =
    // 2026-10-02T12:31:05.000Z → 02/10 14:31, nell'ora del telefono.
    try {
        val z = java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
        "%02d/%02d %02d:%02d".format(z.dayOfMonth, z.monthValue, z.hour, z.minute)
    } catch (_: Exception) { iso }
