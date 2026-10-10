package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Il «Quaderno personale» (PC 0.57.0, app 2.57.0): i dati riservati di
 * Nicholas (email di contatto, sede, partita IVA…) che una chat a volte deve
 * scrivere ma che non vanno nel codice. Stanno solo sul PC, cifrati; una chat
 * li chiede con `chiedi_dato_personale` e lui sceglie nelle Domande (che sul
 * telefono arrivano con la loro notifica): una volta, sempre per quella chat,
 * o no. Qui si aggiungono, si cambiano, si tolgono, si vede chi li ha chiesti
 * e si revocano i «sempre».
 *
 * Solo verso il PC accoppiato: i dati non viaggiano verso gli altri PC, e
 * attraverso il ponte la rotta non c'è. Le regole e i testi sono quelli di
 * src/shared/quaderno-personale.ts (controllati da QuadernoPersonaleTest).
 */

@Serializable
data class VocePersonale(val id: String, val nome: String, val valore: String, val nota: String? = null, val modificata: String = "")

@Serializable
data class ConsensoSempre(val sessione: String, val chat: String, val voceId: String, val voce: String, val dal: String = "")

@Serializable
data class UsoPersonale(val id: String, val quando: String = "", val chat: String = "", val sessione: String = "", val voce: String = "", val motivo: String = "", val esito: String = "")

@Serializable
data class StatoQuadernoPersonale(
    val disponibile: Boolean = false,
    val perche: String? = null,
    val voci: List<VocePersonale> = emptyList(),
    val consensi: List<ConsensoSempre> = emptyList(),
    val usi: List<UsoPersonale> = emptyList()
)

@Serializable
data class EsitoQuadernoPersonale(val stato: StatoQuadernoPersonale? = null)

object QuadernoPersonaleTesti {
    /** Lo stesso di `testoEsito` in src/shared/quaderno-personale.ts. */
    fun esito(e: String): String = when (e) {
        "una-volta" -> "dato, una volta"
        "sempre" -> "dato, e consentito sempre per questa chat"
        "gia-consentita" -> "dato senza chiedere (consentito sempre)"
        "negato" -> "negato"
        "nessuna-risposta" -> "nessuna risposta in due minuti: negato"
        "voce-assente" -> "voce non presente nel quaderno"
        else -> e
    }

    /** Lo stesso di `valoreNascosto`: si vede solo toccando «Mostra». */
    fun nascosto(v: String): String =
        if (v.length <= 4) "••••" else v.take(2) + "•".repeat(minOf(12, v.length - 4)) + v.takeLast(2)

    fun quando(iso: String): String = try {
        DateTimeFormatter.ofPattern("dd/MM/yy HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(iso))
    } catch (_: Exception) { iso }

    const val SPIEGA = "I tuoi dati riservati che una chat a volte deve scrivere, per esempio in una pagina legale o in un modulo: l’email di contatto, la sede, la partita IVA. Stanno solo sul computer, in un file cifrato: non nel codice, non nei progetti, non nel Drive. Nessuna chat li legge da sola: li chiede dicendo quale e perché, e tu scegli nelle Domande (ti arriva la notifica) «Consenti una volta», «Sempre per questa chat» o «No». Senza risposta in due minuti vale no. Ogni richiesta resta nell’elenco qui sotto."
}

@Composable
fun SezioneQuadernoPersonale(api: Api) {
    val scope = rememberCoroutineScope()
    var s by remember { mutableStateOf<StatoQuadernoPersonale?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    var visti by remember { mutableStateOf(setOf<String>()) }
    var idBozza by remember { mutableStateOf<String?>(null) }
    var nome by remember { mutableStateOf("") }
    var valore by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf("") }
    var daTogliere by remember { mutableStateOf<String?>(null) }
    var tutti by remember { mutableStateOf(false) }
    val spenta = FunzioniPc.disponibile(FunzionePc.QUADERNO_PERSONALE, PcCorrente.versione) == false
    suspend fun leggi() {
        try { s = api.quadernoPersonale(); guasto = null } catch (e: Exception) { guasto = FunzioniPc.spiega(e, FunzionePc.QUADERNO_PERSONALE) }
    }
    fun pulisci() { idBozza = null; nome = ""; valore = ""; nota = "" }
    LaunchedEffect(spenta) { if (!spenta) leggi() }

    Text(QuadernoPersonaleTesti.SPIEGA, color = Banco.testoQuieto, fontSize = 12.sp)
    if (spenta) { Text(FunzioniPc.testoMancante(FunzionePc.QUADERNO_PERSONALE), color = Banco.ambra, fontSize = 13.sp); return }
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val st = s
    if (st == null) { if (guasto == null) Text("Leggo…", color = Banco.testoQuieto, fontSize = 13.sp); return }
    if (!st.disponibile) { Text(st.perche ?: "Il quaderno personale non è disponibile su questo computer.", color = Banco.ambra, fontSize = 13.sp); return }

    if (st.voci.isEmpty()) {
        Spacer(Modifier.height(6.dp))
        Text("Il quaderno è vuoto. Aggiungi la prima voce qui sotto: il nome è quello che la chat chiederà («Email di contatto», «Sede legale», «Partita IVA»).", color = Banco.testo, fontSize = 12.sp)
    }
    for (v in st.voci) {
        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Text(v.nome, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            v.nota?.let { Text(it, color = Banco.testoQuieto, fontSize = 11.sp) }
            if (v.id in visti) SelectionContainer { Text(v.valore, color = Banco.testo, fontFamily = FontFamily.Monospace, fontSize = 13.sp) }
            else Text(QuadernoPersonaleTesti.nascosto(v.valore), color = Banco.testoQuieto, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
            Row {
                TextButton(onClick = { visti = if (v.id in visti) visti - v.id else visti + v.id }) { Text(if (v.id in visti) "Nascondi" else "Mostra") }
                TextButton(onClick = { idBozza = v.id; nome = v.nome; valore = v.valore; nota = v.nota ?: "" }) { Text("Modifica") }
                TextButton(onClick = {
                    if (daTogliere != v.id) { daTogliere = v.id; return@TextButton }
                    daTogliere = null
                    scope.launch {
                        val r = tenta("togliere «${v.nome}»") { api.togliVocePersonale(v.id) }
                        if (r != null) { r.stato?.let { s = it }; Nota.mostra("«${v.nome}» tolta, con i suoi «sempre».") }
                    }
                }) { Text(if (daTogliere == v.id) "Sicuro? Tocca ancora" else "Togli") }
            }
        }
    }

    Spacer(Modifier.height(8.dp))
    Text(if (idBozza == null) "NUOVA VOCE" else "MODIFICA «${st.voci.find { it.id == idBozza }?.nome ?: ""}»", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    OutlinedTextField(value = nome, onValueChange = { nome = it.take(80) }, label = { Text("Nome, es. Email di contatto") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(value = valore, onValueChange = { valore = it.take(2000) }, label = { Text("Valore") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(value = nota, onValueChange = { nota = it.take(300) }, label = { Text("Nota facoltativa: a cosa serve") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Row {
        OutlinedButton(enabled = nome.isNotBlank() && valore.isNotBlank(), onClick = {
            val n = nome.trim()
            scope.launch {
                val r = tenta(if (idBozza == null) "aggiungere «$n»" else "salvare «$n»") { api.salvaVocePersonale(idBozza, nome, valore, nota) }
                if (r != null) { r.stato?.let { s = it }; Nota.mostra(if (idBozza == null) "«$n» aggiunta." else "«$n» cambiata."); pulisci() }
            }
        }) { Text(if (idBozza == null) "Aggiungi" else "Salva") }
        if (idBozza != null) { Spacer(Modifier.width(6.dp)); TextButton(onClick = { pulisci() }) { Text("Annulla") } }
    }

    Spacer(Modifier.height(10.dp))
    Text("CONSENSI «SEMPRE PER QUESTA CHAT»", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    if (st.consensi.isEmpty()) Text("Nessuno: ogni richiesta passa dalle Domande.", color = Banco.testoQuieto, fontSize = 12.sp)
    for (k in st.consensi) {
        Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Text("«${k.chat}» può avere ${k.voce} senza chiedere, dal ${QuadernoPersonaleTesti.quando(k.dal)}", color = Banco.testo, fontSize = 12.sp)
            TextButton(onClick = {
                scope.launch {
                    val r = tenta("revocare il consenso") { api.revocaConsensoPersonale(k.sessione, k.voceId) }
                    if (r != null) { r.stato?.let { s = it }; Nota.mostra("Revocato: «${k.chat}» dovrà chiedere «${k.voce}» ogni volta.") }
                }
            }) { Text("Revoca") }
        }
    }

    Spacer(Modifier.height(10.dp))
    Text("CHI LI HA CHIESTI", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    if (st.usi.isEmpty()) Text("Ancora nessuna richiesta.", color = Banco.testoQuieto, fontSize = 12.sp)
    for (u in if (tutti) st.usi else st.usi.take(15)) {
        Text("${QuadernoPersonaleTesti.quando(u.quando)} · «${u.chat}» ha chiesto ${u.voce} — ${QuadernoPersonaleTesti.esito(u.esito)}. Motivo: «${u.motivo}»", color = Banco.testo, fontSize = 12.sp, modifier = Modifier.padding(vertical = 2.dp))
    }
    if (st.usi.size > 15) TextButton(onClick = { tutti = !tutti }) { Text(if (tutti) "Solo gli ultimi" else "Tutti (${st.usi.size})") }
    OutlinedButton(onClick = { scope.launch { leggi() } }) { Text("Aggiorna") }
}
