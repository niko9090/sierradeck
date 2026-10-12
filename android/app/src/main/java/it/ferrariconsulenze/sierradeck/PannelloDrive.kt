package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/*
 * Il pannello delle chat e dei progetti del Drive (PC 0.58.0, app 2.58.0):
 * gli stessi dati e le stesse azioni del PC, con i testi già scritti dal PC
 * (`/api/drive/pannello`, `/api/drive/azione`, anche attraverso il ponte).
 * Ogni azione che cambia qualcosa chiede conferma con il testo del PC: cosa
 * succede e cosa no. Il riassunto della rimozione sicura e «Ripristina» ci
 * sono anche qui. Le regole stanno sul PC (src/shared/pannello-drive.ts):
 * PannelloDriveTest controlla la lettura sulla risposta vera di un PC alla 0.58.
 *
 * App 2.60.0 (PC 0.60.0): stesso nome = stesso progetto (una riga, con gli id
 * del registro, le cartelle e i workspace dello stesso nome); «Rendi residente
 * qui» prima analizza tutte le copie e mostra il riassunto, con «Conferma e
 * unisci» e «Annulla»; le unioni fatte si annullano per 30 giorni; le chat
 * senza nome non sono negli elenchi (una casella le rimette).
 */

@Serializable data class ProblemaDrive(val tipo: String = "", val titolo: String = "", val spiega: String = "", val cosaFare: String = "")
@Serializable data class ResidenteDrive(val pc: String = "", val nome: String = "", val qui: Boolean = false)
@Serializable data class CopiaDrive(val pc: String = "", val nome: String = "", val dove: String = "", val quando: String? = null)
@Serializable data class AzioneProgettoDrive(val id: String = "", val titolo: String = "", val testo: String = "", val conferma: String? = null)
@Serializable data class RigaChatDrive(
    val sessione: String = "", val titolo: String = "", val cwd: String? = null, val progetto: String? = null,
    val residente: ResidenteDrive? = null, val copie: List<CopiaDrive> = emptyList(), val ultimoUso: String? = null,
    val stato: String = "", val copiaQui: Boolean = false, val problemi: List<ProblemaDrive> = emptyList(),
    /** 0.60.0: senza nome, fuori dagli elenchi principali (non cancellata). */
    val senzaNome: Boolean = false
)
@Serializable data class RigaProgettoDrive(
    val id: String = "", val nome: String = "", val residente: ResidenteDrive? = null, val voluto: Boolean = false,
    val cartellaQui: Boolean = false, val chat: Int = 0, val ultimoUso: String? = null, val stato: String = "",
    val problemi: List<ProblemaDrive> = emptyList(), val azioni: List<AzioneProgettoDrive> = emptyList(),
    // 0.60.0: stesso nome = stesso progetto.
    val ids: List<String> = emptyList(), val cartellaTrovata: String? = null, val workspace: List<String> = emptyList(),
    val daUnire: Int = 0, val chatSenzaNome: Int = 0
)
@Serializable data class RiassuntoResidenzaDrive(val destinazione: String = "", val nuova: Boolean = false, val righe: List<String> = emptyList())
@Serializable data class StatoResidenzaDrive(
    val progetto: String = "", val nome: String = "", val fase: String = "", val messaggio: String = "",
    val riassunto: RiassuntoResidenzaDrive? = null, val unione: String? = null
)
@Serializable data class UnioneFattaDrive(val id: String = "", val progetto: String = "", val nome: String = "", val quando: String = "", val destinazione: String = "", val scadeIl: String = "")
@Serializable data class PcDrive(val id: String = "", val nome: String = "")
@Serializable data class AzionePianoDrive(val tipo: String = "", val progetto: String = "", val nome: String = "", val perche: String = "")
@Serializable data class PianoDrive(val azioni: List<AzionePianoDrive> = emptyList())
@Serializable data class StatoRimozioneDrive(val progetto: String = "", val nome: String = "", val residente: String = "", val fase: String = "", val messaggio: String = "")
@Serializable data class CartellaInRecuperoDrive(val id: String = "", val nome: String = "", val percorsoOriginale: String = "", val quando: String = "", val scadeIl: String = "", val ripristinataIl: String? = null)
@Serializable data class RimozioneDrive(val stati: List<StatoRimozioneDrive> = emptyList(), val inRecupero: List<CartellaInRecuperoDrive> = emptyList())
@Serializable data class PannelloDrive(
    val io: PcDrive = PcDrive(), val pc: List<PcDrive> = emptyList(),
    val chat: List<RigaChatDrive> = emptyList(), val progetti: List<RigaProgettoDrive> = emptyList(),
    val pcDaAggiornare: List<String> = emptyList(), val piano: PianoDrive? = null, val rimozione: RimozioneDrive = RimozioneDrive(),
    /** 0.60.0: «Rendi residente» con analisi e unione, e le unioni annullabili. */
    val residenza: List<StatoResidenzaDrive> = emptyList(), val unioni: List<UnioneFattaDrive> = emptyList(),
    /** PC 0.65.0: lo spazio sul Drive e le pulizie. Assente sui PC prima, o mentre la prima misura è in corso. */
    val spazio: StatoSpazioDrive? = null,
    /** PC 0.65.0: i traslochi, passo per passo. */
    val traslochi: List<TraslocoDrive> = emptyList()
)
@Serializable data class EsitoAzioneDrive(val ok: Boolean = false, val messaggio: String = "")

object PannelloDriveRegole {
    /** Gli stessi filtri del PC (filtraChat/filtraProgetti). */
    fun progetti(p: PannelloDrive, filtro: String): List<RigaProgettoDrive> = p.progetti.filter {
        when (filtro) {
            "sbagliati" -> it.problemi.isNotEmpty()
            "questo-pc" -> it.residente?.qui == true
            "solo-cloud" -> !(it.cartellaQui || it.residente?.qui == true)
            else -> true
        }
    }
    fun chat(p: PannelloDrive, filtro: String, senzaNome: Boolean = false): List<RigaChatDrive> = p.chat.filter {
        if (!senzaNome && it.senzaNome) return@filter false
        when (filtro) {
            "sbagliati" -> it.problemi.isNotEmpty()
            "questo-pc" -> it.residente?.qui == true
            "solo-cloud" -> !(it.copiaQui || it.residente?.qui == true)
            else -> true
        }
    }
    fun stato(s: String): String = when (s) { "residente" -> "● residente"; "conflitto" -> "● in conflitto"; else -> "● solo cloud" }
    fun copie(r: RigaChatDrive): String = if (r.copie.isEmpty()) "nessuna" else r.copie.joinToString(", ") { it.nome + when (it.dove) { "qui" -> " (qui)"; "disco" -> " (sul suo disco)"; else -> " (sul Drive)" } }
    /** Le sessioni di un progetto per il cambio di residente: le sue chat e lo stato voluto. */
    fun sessioniProgetto(p: PannelloDrive, progetto: String): List<String> = p.chat.filter { it.progetto == progetto }.map { it.sessione } + "progetto:$progetto"
    /** Le chat senza nome, nascoste dagli elenchi (0.60.0). */
    fun nascoste(p: PannelloDrive): Int = p.chat.count { it.senzaNome }
    /** Lo stato di «Rendi residente» di un progetto, se c'è (un annullato non si mostra). */
    fun residenza(p: PannelloDrive, progetto: String): StatoResidenzaDrive? = p.residenza.firstOrNull { it.progetto == progetto && it.fase != "annullata" }
    fun titoloResidenza(fase: String): String = when (fase) {
        "analisi" -> "Raccolgo e confronto le copie…"
        "unisco" -> "Unisco…"
        "attesa-conferma" -> "Riassunto: cosa unisco, cosa tengo, cosa va in recupero"
        "fatta" -> "Unito"
        "in-uso" -> "In attesa"
        else -> "Non riuscito"
    }
    /** Il PC sta ancora lavorando: il pannello si rilegge da solo. */
    fun lavora(p: PannelloDrive): Boolean = p.residenza.any { it.fase == "analisi" || it.fase == "unisco" }
    /** «Stesso nome, stesso progetto»: cosa c'è da unire, detto per esteso. */
    fun doppi(r: RigaProgettoDrive): String? {
        if (r.ids.size <= 1 && r.workspace.size <= 1) return null
        val registro = if (r.ids.size > 1) "${r.ids.size} voci nel registro del Drive" else "una voce nel registro"
        val ws = if (r.workspace.size > 1) ", workspace " + r.workspace.joinToString(", ") { "«$it»" } else ""
        return "Stesso nome, stesso progetto: $registro$ws. Qui li vedi come uno solo; «Rendi residente qui» li unisce davvero, dopo il riassunto."
    }
    fun cartellaQui(r: RigaProgettoDrive): String = when {
        !r.cartellaQui -> "no"
        r.cartellaTrovata != null -> "sì, ${r.cartellaTrovata} (trovata per nome)"
        else -> "sì"
    }
}

private data class DaConfermare(val titolo: String, val testo: String, val bottone: String, val fai: suspend () -> EsitoAzioneDrive)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SezionePannelloDrive(api: Api) {
    val scope = rememberCoroutineScope()
    var p by remember { mutableStateOf<PannelloDrive?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    var vista by remember { mutableStateOf("progetti") }
    var filtro by remember { mutableStateOf("tutti") }
    var conferma by remember { mutableStateOf<DaConfermare?>(null) }
    var quante by remember { mutableStateOf(60) }
    var senzaNome by remember { mutableStateOf(false) }
    val spenta = FunzioniPc.disponibile(FunzionePc.PANNELLO_DRIVE, PcCorrente.versione) == false
    suspend fun leggi() { try { p = api.pannelloDrive(); guasto = null } catch (e: Exception) { guasto = FunzioniPc.spiega(e, FunzionePc.PANNELLO_DRIVE) } }
    fun fai(azione: suspend () -> EsitoAzioneDrive, cosa: String) {
        scope.launch {
            val r = tenta(cosa) { azione() }
            if (r != null) Nota.mostra(r.messaggio)
            leggi()
        }
    }
    LaunchedEffect(spenta) { if (!spenta) leggi() }
    // Analisi e unione lavorano sul PC: finché lavorano, il pannello si rilegge.
    val lavora = p?.let { PannelloDriveRegole.lavora(it) || TraslocoRegole.lavora(it.traslochi) } == true
    LaunchedEffect(lavora) { while (lavora) { kotlinx.coroutines.delay(2500); leggi(); if (p?.let { PannelloDriveRegole.lavora(it) || TraslocoRegole.lavora(it.traslochi) } != true) break } }
    // La prima misura del Drive arriva dopo il pannello (PC 0.65.0): qualche rilettura finché c'è.
    val senzaSpazio = p != null && p?.spazio == null
    LaunchedEffect(senzaSpazio) { var giri = 0; while (senzaSpazio && giri < 5) { kotlinx.coroutines.delay(4000); leggi(); giri += 1; if (p?.spazio != null) break } }

    RigaConAiuto("Il PC residente di ogni chat e progetto, e le copie.", "Ogni chat e ogni progetto ha un PC residente: è lì che lavora; sugli altri PC si apre dal vivo, e il progetto lì è «solo cloud». Qui vedi il residente, chi ne ha una copia, l’ultimo uso e lo stato; in ambra le assegnazioni sbagliate, con il perché e cosa fare. Ogni cambio chiede conferma e non cancella niente: le copie tolte vanno nella cartella di recupero per 30 giorni.")
    if (spenta) { Text(FunzioniPc.testoMancante(FunzionePc.PANNELLO_DRIVE), color = Banco.ambra, fontSize = 13.sp); return }
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val d = p ?: run { if (guasto == null) Text("Leggo…", color = Banco.testoQuieto, fontSize = 13.sp); return }

    if (d.pcDaAggiornare.isNotEmpty()) Text("${d.pcDaAggiornare.joinToString(", ")}: non dice ancora quali chat e progetti ha sul disco, va aggiornato alla 0.58.", color = Banco.ambra, fontSize = 12.sp)
    for (st in d.rimozione.stati) {
        Spacer(Modifier.height(6.dp))
        Text("Togliere «${st.nome}» da questo PC: ${st.messaggio}", color = Banco.testo, fontSize = 12.sp)
        if (st.fase == "attesa-conferma" || st.fase == "in-uso") FlowRow {
            OutlinedButton(onClick = { fai({ api.azioneDrive("conferma", st.progetto) }, "togliere «${st.nome}»") }) { Text("Conferma e togli da questo PC") }
            TextButton(onClick = { fai({ api.azioneDrive("annulla", st.progetto) }, "annullare") }) { Text("Annulla") }
        }
    }
    val inRec = d.rimozione.inRecupero.filter { it.ripristinataIl == null }
    if (inRec.isNotEmpty()) {
        Spacer(Modifier.height(6.dp))
        Text("CARTELLE IN RECUPERO", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text("Tolte da questo PC, non cancellate: «Ripristina» le rimette dov’erano.", color = Banco.testoQuieto, fontSize = 12.sp)
        for (c in inRec) {
            Text("${c.nome} · tolta il ${QuadernoPersonaleTesti.quando(c.quando)} · resta fino al ${QuadernoPersonaleTesti.quando(c.scadeIl)}", color = Banco.testo, fontSize = 12.sp)
            TextButton(onClick = { conferma = DaConfermare("Ripristina «${c.nome}»", "La cartella torna in ${c.percorsoOriginale}. Se lì adesso c’è un’altra cartella non la sovrascrivo e te lo dico.", "Ripristina") { api.azioneDrive("ripristina", "", c.id) } }) { Text("Ripristina") }
        }
    }
    // Il trasloco (PC 0.65.0): «Sposta progetto» e «Rendi residente» passo per passo.
    for (t in d.traslochi) {
        Spacer(Modifier.height(6.dp))
        androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("TRASLOCO DI «${t.nome}» SU ${t.verso.nome} · ${TraslocoRegole.stato(t)}", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold); Aiuto("«Sposta progetto» e «Rendi residente» sono lo stesso passaggio: raccolgo le copie, le confronto, unisco qui quello che serve e solo alla fine metto le copie vecchie nel recupero dei loro PC. Se un PC non risponde mi fermo e riprendo da dove ero. «Annulla tutto» per 30 giorni.", di = "TRASLOCO") }
        androidx.compose.material3.LinearProgressIndicator(progress = { TraslocoRegole.percento(t) / 100f }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), color = if (t.fermo != null) Banco.ambra else Banco.verde)
        TraslocoRegole.attuale(t)?.takeIf { t.finitoIl == null }?.let { (id, titolo) -> Text("$titolo: ${TraslocoRegole.passo(t, id).dettaglio ?: "…"}", color = Banco.testo, fontSize = 12.sp) }
        t.fermo?.let { Text("Fermo: ${it.motivo}" + (if (it.riprovaDaSolo) " Riprendo da solo quando passa." else ""), color = Banco.ambra, fontSize = 12.sp) }
        for ((id, titolo) in TraslocoRegole.PASSI) Text(TraslocoRegole.riga(t, id, titolo), color = if (TraslocoRegole.passo(t, id).stato == "da-fare") Banco.testoQuieto else Banco.testo, fontSize = 12.sp)
        if (t.finitoIl != null) for (r in t.riassunto) Text("• $r", color = Banco.testo, fontSize = 12.sp)
        if (t.annullatoIl != null) for (r in t.annullamento) Text("• $r", color = Banco.testo, fontSize = 12.sp)
        FlowRow {
            if (t.fermo != null) TextButton(onClick = { fai({ api.azioneDrive("trasloco-riprendi", "", t.id) }, "riprendere il trasloco") }) { Text("Riprendi") }
            if (TraslocoRegole.annullabile(t, System.currentTimeMillis())) TextButton(onClick = { conferma = DaConfermare("Annulla tutto: «${t.nome}»", "Le copie vecchie tornano al loro posto sui loro PC, l’unione si annulla, la casa torna a chi c’era prima. Niente si cancella.", "Annulla tutto") { api.azioneDrive("trasloco-annulla", "", t.id) } }) { Text("Annulla tutto…") }
        }
    }
    // Lo spazio sul Drive (PC 0.65.0): ogni pulizia si conferma, va nel recupero per 30 giorni e si annulla.
    d.spazio?.let { sp ->
        Spacer(Modifier.height(6.dp))
        androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("SPAZIO SUL DRIVE", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold); Aiuto("Quanto occupa SierraDeck nella sua cartella privata del tuo Drive, per tipo, e lo spazio del tuo account Google. Le pulizie non cancellano subito: tengono i file 30 giorni nel recupero, «Annulla» li rimette. Una chat tolta che riprende a lavorare risale da sola.", di = "SPAZIO SUL DRIVE") }
        sp.errore?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
        sp.misura?.let { m ->
            Text(SpazioRegole.riepilogo(m), color = Banco.testo, fontSize = 12.sp)
            for (r in SpazioRegole.righe(m)) Text(r, color = Banco.testoQuieto, fontSize = 12.sp)
        }
        for (pr in sp.proposte) {
            Text("${pr.titolo} · ${pr.breve} · libera ${SpazioRegole.byte(pr.byte)}", color = Banco.testo, fontSize = 12.sp)
            TextButton(onClick = { conferma = DaConfermare(pr.titolo, pr.spiega, "Nel recupero") { api.azioneSpazio("spazio-pulisci", tipo = pr.tipo) } }) { Text("Pulisci…") }
        }
        if (sp.misura != null && sp.proposte.isEmpty()) Text("Niente da pulire.", color = Banco.testoQuieto, fontSize = 12.sp)
        for (x in SpazioRegole.inRecupero(sp)) {
            Text("${x.titolo} · ${x.voci.size} file, ${SpazioRegole.byte(x.byte)} · nel recupero fino al ${QuadernoPersonaleTesti.quando(x.scadeIl)}", color = Banco.testo, fontSize = 12.sp)
            FlowRow {
                TextButton(onClick = { fai({ api.azioneSpazio("spazio-annulla", id = x.id) }, "annullare la pulizia") }) { Text("Annulla") }
                TextButton(onClick = { conferma = DaConfermare("Svuota adesso «${x.titolo}»", "Cancello adesso questi file dal Drive, senza aspettare i 30 giorni. Dopo non si annulla più.", "Cancella per sempre") { api.azioneSpazio("spazio-svuota", id = x.id) } }) { Text("Svuota adesso…") }
            }
        }
        TextButton(onClick = { fai({ api.azioneSpazio("spazio-misura") }, "misurare il Drive") }) { Text("Misura adesso") }
    }
    if (d.unioni.isNotEmpty()) {
        Spacer(Modifier.height(6.dp))
        androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("UNIONI FATTE", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold); Aiuto("I progetti uniti con «Rendi residente qui» negli ultimi 30 giorni. «Annulla l’unione» rimette com’erano cartelle, file, chat, workspace e registro; niente si cancella.", di = "UNIONI FATTE") }
        for (u in d.unioni) {
            Text("${u.nome} · unito il ${QuadernoPersonaleTesti.quando(u.quando)} in ${u.destinazione} · annullabile fino al ${QuadernoPersonaleTesti.quando(u.scadeIl)}", color = Banco.testo, fontSize = 12.sp)
            TextButton(onClick = { conferma = DaConfermare("Annulla l’unione di «${u.nome}»", "Le cartelle doppie tornano al loro posto dalla cartella di recupero, i file sostituiti tornano com’erano, quelli entrati con l’unione escono e vanno nei recuperati (non si cancellano), le trascrizioni e i workspace tornano com’erano. La casa delle chat resta questo PC.", "Annulla l’unione") { api.azioneDrive("annulla-unione", u.progetto, u.id) } }) { Text("Annulla l’unione") }
        }
    }
    d.piano?.takeIf { it.azioni.isNotEmpty() }?.let { pi ->
        Spacer(Modifier.height(6.dp))
        Text("PIANO DI ALLINEAMENTO DI QUESTO PC", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        for (a in pi.azioni) Text((if (a.tipo == "porta-qui") "↓ " else "☁ ") + a.perche, color = Banco.testo, fontSize = 12.sp)
    }
    Spacer(Modifier.height(6.dp))
    FlowRow {
        TextButton(onClick = { vista = "progetti"; quante = 60 }) { Text(if (vista == "progetti") "[Progetti ${d.progetti.size}]" else "Progetti ${d.progetti.size}") }
        val visibili = d.chat.size - (if (senzaNome) 0 else PannelloDriveRegole.nascoste(d))
        TextButton(onClick = { vista = "chat"; quante = 60 }) { Text(if (vista == "chat") "[Chat $visibili]" else "Chat $visibili") }
    }
    if (vista == "chat" && PannelloDriveRegole.nascoste(d) > 0) {
        TextButton(onClick = { senzaNome = !senzaNome; quante = 60 }) {
            Text((if (senzaNome) "☑" else "☐") + " mostra anche le senza nome (${PannelloDriveRegole.nascoste(d)}, nascoste: non sono cancellate, restano nel loro progetto)", fontSize = 12.sp)
        }
    }
    FlowRow {
        for ((id, nome) in listOf("tutti" to "Tutti", "sbagliati" to "Sbagliati", "questo-pc" to "Di questo PC", "solo-cloud" to "Solo cloud")) {
            TextButton(onClick = { filtro = id; quante = 60 }) { Text(if (filtro == id) "[$nome]" else nome, fontSize = 12.sp) }
        }
    }
    val tutti = listOf(d.io) + d.pc
    if (vista == "progetti") {
        val righe = PannelloDriveRegole.progetti(d, filtro)
        if (righe.isEmpty()) Text("Nessun progetto con questo filtro.", color = Banco.testoQuieto, fontSize = 12.sp)
        for (r in righe.take(quante)) {
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text("${r.nome}  ${PannelloDriveRegole.stato(r.stato)}", color = if (r.problemi.isEmpty()) Banco.testo else Banco.ambra, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text("Residente: ${r.residente?.let { it.nome + (if (it.qui) " (questo PC)" else "") } ?: "nessuno"} · qui sul disco: ${PannelloDriveRegole.cartellaQui(r)} · ${r.chat} chat${if (r.chatSenzaNome > 0) " (di cui ${r.chatSenzaNome} senza nome)" else ""} · ultimo uso: ${r.ultimoUso?.let { QuadernoPersonaleTesti.quando(it) } ?: "mai"}", color = Banco.testoQuieto, fontSize = 12.sp)
                PannelloDriveRegole.doppi(r)?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp) }
                for (x in r.problemi) Text("${x.titolo}. ${x.spiega} Cosa fare: ${x.cosaFare}", color = Banco.ambra, fontSize = 12.sp)
                PannelloDriveRegole.residenza(d, r.id)?.let { st ->
                    Text(PannelloDriveRegole.titoloResidenza(st.fase), color = Banco.verde, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    val righe = st.riassunto?.righe
                    if (st.fase == "attesa-conferma" && righe != null) for (x in righe) Text("• $x", color = Banco.testo, fontSize = 12.sp)
                    else Text(st.messaggio, color = Banco.testo, fontSize = 12.sp)
                    if (st.fase == "attesa-conferma" || st.fase == "in-uso") FlowRow {
                        OutlinedButton(onClick = { conferma = DaConfermare("Conferma e unisci «${r.nome}»", (righe ?: listOf(st.messaggio)).joinToString("\n\n"), "Conferma e unisci") { api.azioneDrive("conferma-residenza", r.id) } }) { Text("Conferma e unisci") }
                        TextButton(onClick = { fai({ api.azioneDrive("annulla-residenza", r.id) }, "annullare") }) { Text("Annulla") }
                    }
                }
                FlowRow {
                    for (a in r.azioni) TextButton(onClick = {
                        if (a.conferma == null) fai({ api.azioneDrive(a.id, r.id) }, a.titolo.lowercase())
                        else conferma = DaConfermare("${a.titolo}: ${r.nome}", a.testo, a.conferma) { api.azioneDrive(a.id, r.id) }
                    }) { Text(a.titolo, fontSize = 12.sp) }
                    for (pc in tutti.filter { it.id != r.residente?.pc && it.id != d.io.id }) TextButton(onClick = {
                        conferma = DaConfermare("Rendi residente ${pc.nome}", "${pc.nome} diventa il residente di «${r.nome}»: le sue chat lavorano lì, sugli altri PC si aprono dal vivo, e qui il progetto diventa «solo cloud» (tolto solo dopo il confronto e la tua conferma). Non si cancella niente; si torna indietro scegliendo di nuovo il PC di prima.", "Conferma") {
                            api.residenteDrive(PannelloDriveRegole.sessioniProgetto(d, r.id), pc)
                        }
                    }) { Text("Residente: ${pc.nome}", fontSize = 12.sp) }
                }
            }
        }
        if (righe.size > quante) TextButton(onClick = { quante += 60 }) { Text("Altri ${righe.size - quante}") }
    } else {
        val righe = PannelloDriveRegole.chat(d, filtro, senzaNome)
        if (righe.isEmpty()) Text("Nessuna chat con questo filtro.", color = Banco.testoQuieto, fontSize = 12.sp)
        for (r in righe.take(quante)) {
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text("${r.titolo}  ${PannelloDriveRegole.stato(r.stato)}", color = if (r.problemi.isEmpty()) Banco.testo else Banco.ambra, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text("Residente: ${r.residente?.let { it.nome + (if (it.qui) " (questo PC)" else "") } ?: "nessuno"} · copie: ${PannelloDriveRegole.copie(r)} · ultimo uso: ${r.ultimoUso?.let { QuadernoPersonaleTesti.quando(it) } ?: "mai"}", color = Banco.testoQuieto, fontSize = 12.sp)
                for (x in r.problemi) Text("${x.titolo}. ${x.spiega} Cosa fare: ${x.cosaFare}", color = Banco.ambra, fontSize = 12.sp)
                FlowRow {
                    for (pc in tutti.filter { it.id != r.residente?.pc }) TextButton(onClick = {
                        conferma = DaConfermare("Rendi residente ${pc.nome}", "La chat «${r.titolo}» lavorerà su ${pc.nome}: il suo claude.exe parte solo lì, sugli altri PC si apre dal vivo, e le altre copie vanno nella cartella di recupero a fine turno (mai a metà). Non si cancella niente.", "Conferma") {
                            api.residenteDrive(listOf(r.sessione), pc)
                        }
                    }) { Text("Residente: ${pc.nome}", fontSize = 12.sp) }
                }
            }
        }
        if (righe.size > quante) TextButton(onClick = { quante += 60 }) { Text("Altre ${righe.size - quante}") }
    }
    OutlinedButton(onClick = { scope.launch { leggi() } }) { Text("Aggiorna") }

    conferma?.let { c ->
        AlertDialog(
            onDismissRequest = { conferma = null },
            title = { Text(c.titolo) },
            // Il riassunto di «Rendi residente» è lungo: si scorre.
            text = { Column(Modifier.verticalScroll(rememberScrollState())) { Text(c.testo) } },
            confirmButton = { TextButton(onClick = { conferma = null; fai(c.fai, c.titolo.lowercase()) }) { Text(c.bottone) } },
            dismissButton = { TextButton(onClick = { conferma = null }) { Text("Annulla") } }
        )
    }
}
