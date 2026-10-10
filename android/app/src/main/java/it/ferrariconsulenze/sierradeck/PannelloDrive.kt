package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
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
 */

@Serializable data class ProblemaDrive(val tipo: String = "", val titolo: String = "", val spiega: String = "", val cosaFare: String = "")
@Serializable data class ResidenteDrive(val pc: String = "", val nome: String = "", val qui: Boolean = false)
@Serializable data class CopiaDrive(val pc: String = "", val nome: String = "", val dove: String = "", val quando: String? = null)
@Serializable data class AzioneProgettoDrive(val id: String = "", val titolo: String = "", val testo: String = "", val conferma: String? = null)
@Serializable data class RigaChatDrive(
    val sessione: String = "", val titolo: String = "", val cwd: String? = null, val progetto: String? = null,
    val residente: ResidenteDrive? = null, val copie: List<CopiaDrive> = emptyList(), val ultimoUso: String? = null,
    val stato: String = "", val copiaQui: Boolean = false, val problemi: List<ProblemaDrive> = emptyList()
)
@Serializable data class RigaProgettoDrive(
    val id: String = "", val nome: String = "", val residente: ResidenteDrive? = null, val voluto: Boolean = false,
    val cartellaQui: Boolean = false, val chat: Int = 0, val ultimoUso: String? = null, val stato: String = "",
    val problemi: List<ProblemaDrive> = emptyList(), val azioni: List<AzioneProgettoDrive> = emptyList()
)
@Serializable data class PcDrive(val id: String = "", val nome: String = "")
@Serializable data class AzionePianoDrive(val tipo: String = "", val progetto: String = "", val nome: String = "", val perche: String = "")
@Serializable data class PianoDrive(val azioni: List<AzionePianoDrive> = emptyList())
@Serializable data class StatoRimozioneDrive(val progetto: String = "", val nome: String = "", val residente: String = "", val fase: String = "", val messaggio: String = "")
@Serializable data class CartellaInRecuperoDrive(val id: String = "", val nome: String = "", val percorsoOriginale: String = "", val quando: String = "", val scadeIl: String = "", val ripristinataIl: String? = null)
@Serializable data class RimozioneDrive(val stati: List<StatoRimozioneDrive> = emptyList(), val inRecupero: List<CartellaInRecuperoDrive> = emptyList())
@Serializable data class PannelloDrive(
    val io: PcDrive = PcDrive(), val pc: List<PcDrive> = emptyList(),
    val chat: List<RigaChatDrive> = emptyList(), val progetti: List<RigaProgettoDrive> = emptyList(),
    val pcDaAggiornare: List<String> = emptyList(), val piano: PianoDrive? = null, val rimozione: RimozioneDrive = RimozioneDrive()
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
    fun chat(p: PannelloDrive, filtro: String): List<RigaChatDrive> = p.chat.filter {
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

    Text(
        "Ogni chat e ogni progetto ha un PC residente: è lì che lavora; sugli altri PC si apre dal vivo, e il progetto lì è «solo cloud». Qui vedi il residente, chi ne ha una copia, l’ultimo uso e lo stato; in ambra le assegnazioni sbagliate, con il perché e cosa fare. Ogni cambio chiede conferma e non cancella niente: le copie tolte vanno nella cartella di recupero per 30 giorni.",
        color = Banco.testoQuieto, fontSize = 12.sp
    )
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
    d.piano?.takeIf { it.azioni.isNotEmpty() }?.let { pi ->
        Spacer(Modifier.height(6.dp))
        Text("PIANO DI ALLINEAMENTO DI QUESTO PC", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        for (a in pi.azioni) Text((if (a.tipo == "porta-qui") "↓ " else "☁ ") + a.perche, color = Banco.testo, fontSize = 12.sp)
    }
    Spacer(Modifier.height(6.dp))
    FlowRow {
        TextButton(onClick = { vista = "progetti"; quante = 60 }) { Text(if (vista == "progetti") "[Progetti ${d.progetti.size}]" else "Progetti ${d.progetti.size}") }
        TextButton(onClick = { vista = "chat"; quante = 60 }) { Text(if (vista == "chat") "[Chat ${d.chat.size}]" else "Chat ${d.chat.size}") }
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
                Text("Residente: ${r.residente?.let { it.nome + (if (it.qui) " (questo PC)" else "") } ?: "nessuno"} · qui sul disco: ${if (r.cartellaQui) "sì" else "no"} · ${r.chat} chat · ultimo uso: ${r.ultimoUso?.let { QuadernoPersonaleTesti.quando(it) } ?: "mai"}", color = Banco.testoQuieto, fontSize = 12.sp)
                for (x in r.problemi) Text("${x.titolo}. ${x.spiega} Cosa fare: ${x.cosaFare}", color = Banco.ambra, fontSize = 12.sp)
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
        val righe = PannelloDriveRegole.chat(d, filtro)
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
            text = { Text(c.testo) },
            confirmButton = { TextButton(onClick = { conferma = null; fai(c.fai, c.titolo.lowercase()) }) { Text(c.bottone) } },
            dismissButton = { TextButton(onClick = { conferma = null }) { Text("Annulla") } }
        )
    }
}
