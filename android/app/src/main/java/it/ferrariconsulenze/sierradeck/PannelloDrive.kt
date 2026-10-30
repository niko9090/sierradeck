package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
 * App 2.60.0 (PC 0.60.0): stesso nome = stesso progetto (una riga); le chat
 * senza nome non sono negli elenchi (una casella le rimette).
 *
 * PC 0.88.0: ogni progetto vive su un PC solo (il proprietario) e il Drive.
 * Gli altri PC e il telefono lo aprono da lontano («Apri su <PC>»); cambia PC
 * solo con «Sposta su questo PC», un'azione come le altre. «Sposta su ▾»,
 * «Rendi residente», il trasloco, le unioni e il piano non ci sono più.
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
    val senzaNome: Boolean = false,
    /** PC 0.69: sta lavorando adesso, e su quali PC. */
    val alLavoroSu: List<String> = emptyList()
)
@Serializable data class RigaProgettoDrive(
    val id: String = "", val nome: String = "", val residente: ResidenteDrive? = null, val voluto: Boolean = false,
    val cartellaQui: Boolean = false, val chat: Int = 0, val ultimoUso: String? = null, val stato: String = "",
    val problemi: List<ProblemaDrive> = emptyList(), val azioni: List<AzioneProgettoDrive> = emptyList(),
    // 0.60.0: stesso nome = stesso progetto.
    val ids: List<String> = emptyList(), val cartellaTrovata: String? = null, val workspace: List<String> = emptyList(),
    val daUnire: Int = 0, val chatSenzaNome: Int = 0,
    /** PC 0.58: dove ha la cartella; serve ad aprire le sue chat sul PC dove vivono (0.67.0). */
    val cartelle: List<CartellaProgettoDrive> = emptyList(),
    /** PC 0.69: quanto occupa sul Drive, e i file grandi come avviso. */
    val spazioDrive: SpazioProgettoDrive? = null,
    /** PC 0.69: le chat con nome al lavoro adesso, e la vista (stato in una parola, gruppi, testi). */
    val alLavoro: Int = 0,
    val vista: VistaProgettoDrive? = null
)
@Serializable data class SpazioProgettoDrive(val file: Int = 0, val byte: Double = 0.0, val grandi: List<FileGrandeDrive> = emptyList())
@Serializable data class FileGrandeDrive(val percorso: String = "", val byte: Double = 0.0)
@Serializable data class CartellaProgettoDrive(val pc: String = "", val nome: String = "", val percorso: String = "")

/** Come si apre una chat dal pannello: qui, o dal vivo sul PC dove vive (PC 0.67.0). */
sealed class AperturaChat {
    data class Qui(val cwd: String) : AperturaChat()
    data class Altrove(val pc: String, val nome: String, val cwd: String) : AperturaChat()
}
@Serializable data class PcDrive(val id: String = "", val nome: String = "")
@Serializable data class CartellaInRecuperoDrive(val id: String = "", val nome: String = "", val percorsoOriginale: String = "", val quando: String = "", val scadeIl: String = "", val ripristinataIl: String? = null)
/** Le copie nel recupero dei programmi, da rimettere (gli `stati` della rimozione sicura non ci sono più: PC 0.88.0). */
@Serializable data class RimozioneDrive(val inRecupero: List<CartellaInRecuperoDrive> = emptyList())
@Serializable data class PannelloDrive(
    val io: PcDrive = PcDrive(), val pc: List<PcDrive> = emptyList(),
    val chat: List<RigaChatDrive> = emptyList(), val progetti: List<RigaProgettoDrive> = emptyList(),
    val pcDaAggiornare: List<String> = emptyList(), val rimozione: RimozioneDrive = RimozioneDrive(),
    /** PC 0.65.0: lo spazio sul Drive e le pulizie. Assente sui PC prima, o mentre la prima misura è in corso. */
    val spazio: StatoSpazioDrive? = null
)
@Serializable data class EsitoAzioneDrive(val ok: Boolean = false, val messaggio: String = "")

object PannelloDriveRegole {
    /** « · sul Drive 340 MB · ⚠ 2 file grandi: a.mp4, b.zip» — come la riga del PC; vuoto se il PC non lo dice. */
    fun spazio(r: RigaProgettoDrive): String {
        val sd = r.spazioDrive ?: return ""
        val g = sd.grandi
        val avviso = if (g.isEmpty()) "" else " · ⚠ ${g.size} ${if (g.size == 1) "file grande" else "file grandi"}: ${g.joinToString(", ") { it.percorso }}"
        return " · sul Drive ${SpazioRegole.byte(sd.byte)}$avviso"
    }
    /** Le chat di un progetto (tutti i suoi id), con nome, le più recenti prima — come `chatDelProgetto` del PC. */
    fun chatDelProgetto(p: PannelloDrive, r: RigaProgettoDrive): List<RigaChatDrive> {
        val ids = r.ids.ifEmpty { listOf(r.id) }
        return p.chat.filter { it.progetto != null && it.progetto in ids && !it.senzaNome }.sortedByDescending { it.ultimoUso ?: "" }
    }

    /** Come `comeAprireChat` del PC. */
    fun comeAprire(c: RigaChatDrive, r: RigaProgettoDrive?): AperturaChat? {
        val res = c.residente
        if (res == null || res.qui) return if (c.cwd != null && (res != null || c.copiaQui)) AperturaChat.Qui(c.cwd) else null
        val cwd = r?.cartelle?.firstOrNull { it.pc == res.pc }?.percorso ?: c.cwd ?: return null
        return AperturaChat.Altrove(res.pc, res.nome, cwd)
    }

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
    /** Le chat senza nome, nascoste dagli elenchi (0.60.0). */
    fun nascoste(p: PannelloDrive): Int = p.chat.count { it.senzaNome }
    fun cartellaQui(r: RigaProgettoDrive): String = when {
        !r.cartellaQui -> "no"
        r.cartellaTrovata != null -> "sì, ${r.cartellaTrovata} (trovata per nome)"
        else -> "sì"
    }
}

/*
 * «Progetti» rifatto (PC 0.69.0, app 2.69.0). Nicholas, 12/10: «rifai il menu
 * Progetti!! non si capisce nulla». Come sul PC, adattato al telefono: un
 * elenco con lo stato in una parola e un colore, i gruppi (Su questo PC · Su
 * altri PC · Da sistemare · Tutti), la ricerca e l'ordine; il tocco apre il
 * dettaglio a tutto schermo. Lo stato, i gruppi e i testi li calcola il PC
 * (`vista`, src/shared/progetti-vista.ts): qui si disegnano. Da un PC di
 * prima della 0.69 si ricava il minimo (`vistaDi`).
 */
@Serializable data class StatoVistaDrive(val id: String = "a-posto", val parola: String = "a posto", val colore: String = "verde", val ragione: String? = null)
@Serializable data class CopieVistaDrive(val testo: String = "", val nomi: List<String> = emptyList())
@Serializable data class ChatVistaDrive(val testo: String = "", val totali: Int = 0, val alLavoro: Int = 0)
@Serializable data class SpazioVistaDrive(val testo: String = "—", val byte: Double? = null, val avviso: Boolean = false)
@Serializable data class VistaProgettoDrive(
    val stato: StatoVistaDrive = StatoVistaDrive(), val gruppi: List<String> = emptyList(),
    val dove: String = "—", val doveQui: Boolean = false,
    val copie: CopieVistaDrive = CopieVistaDrive(), val chat: ChatVistaDrive = ChatVistaDrive(), val spazio: SpazioVistaDrive = SpazioVistaDrive()
)

object ProgettiVista {
    val GRUPPI = listOf("questo-pc" to "Su questo PC", "altri-pc" to "Su altri PC", "da-sistemare" to "Da sistemare", "tutti" to "Tutti")
    val ORDINI = listOf("stato" to "Stato", "nome" to "Nome", "chat" to "Chat", "spazio" to "Spazio")
    private val RANGO = mapOf("spostamento" to 0, "da-sistemare" to 1, "al-lavoro" to 2, "a-posto" to 3)

    /** La vista dal PC; da un PC di prima il minimo: problemi = da sistemare. */
    fun vistaDi(r: RigaProgettoDrive): VistaProgettoDrive {
        r.vista?.let { return it }
        val da = r.problemi.isNotEmpty()
        val qui = r.residente?.qui ?: r.cartellaQui
        val totali = (r.chat - r.chatSenzaNome).coerceAtLeast(0)
        return VistaProgettoDrive(
            stato = if (da) StatoVistaDrive("da-sistemare", "da sistemare", "ambra", r.problemi.first().titolo.lowercase()) else StatoVistaDrive(),
            gruppi = listOf(if (qui) "questo-pc" else "altri-pc") + (if (da) listOf("da-sistemare") else emptyList()),
            dove = r.residente?.let { if (it.qui) "Questo PC" else it.nome } ?: "—", doveQui = r.residente?.qui == true,
            chat = ChatVistaDrive(totali.toString(), totali, 0),
            spazio = r.spazioDrive?.let { SpazioVistaDrive(SpazioRegole.byte(it.byte), it.byte, it.grandi.isNotEmpty()) } ?: SpazioVistaDrive()
        )
    }
    fun nelGruppo(r: RigaProgettoDrive, g: String): Boolean = g == "tutti" || g in vistaDi(r).gruppi
    fun conti(righe: List<RigaProgettoDrive>): Map<String, Int> =
        GRUPPI.associate { (g, _) -> g to (if (g == "tutti") righe.size else righe.count { g in vistaDi(it).gruppi }) }

    private fun piano(t: String): String = java.text.Normalizer.normalize(t, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()
    /** Ogni parola deve stare nel nome, nei PC o nelle cartelle (come `cercaProgetti` del PC). */
    fun cerca(righe: List<RigaProgettoDrive>, q: String): List<RigaProgettoDrive> {
        val parole = piano(q).split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (parole.isEmpty()) return righe
        return righe.filter { r ->
            val v = vistaDi(r)
            val testo = piano((listOf(r.nome, v.dove) + v.copie.nomi + r.cartelle.map { "${it.nome} ${it.percorso}" }).joinToString(" "))
            parole.all { it in testo }
        }
    }
    /** Come `ordinaProgetti` del PC: per stato, poi il più usato di recente; i «—» in fondo. */
    fun ordina(righe: List<RigaProgettoDrive>, ordine: String): List<RigaProgettoDrive> {
        val conIndice = righe.withIndex().toList()
        val (senza, con) = conIndice.partition { ordine == "spazio" && vistaDi(it.value).spazio.byte == null }
        val c = when (ordine) {
            "nome" -> con.sortedWith(compareBy({ piano(it.value.nome) }, { it.index }))
            "chat" -> con.sortedWith(compareBy({ -vistaDi(it.value).chat.totali }, { it.index }))
            "spazio" -> con.sortedWith(compareBy({ -(vistaDi(it.value).spazio.byte ?: 0.0) }, { it.index }))
            else -> con.sortedWith(compareBy<IndexedValue<RigaProgettoDrive>>({ RANGO[vistaDi(it.value).stato.id] ?: 9 }).thenByDescending { it.value.ultimoUso ?: "" }.thenBy { it.index })
        }
        return (c + senza).map { it.value }
    }
    /** La riga sotto il nome: il motivo in ambra se è da sistemare, sennò dove vive, chat, spazio. */
    fun sotto(r: RigaProgettoDrive): String {
        val v = vistaDi(r)
        if (v.stato.id == "da-sistemare" && v.stato.ragione != null) return v.stato.ragione
        val pezzi = mutableListOf(v.dove, "${v.chat.totali} chat")
        if (v.chat.alLavoro > 0) pezzi += "${v.chat.alLavoro} al lavoro"
        if (v.spazio.byte != null) pezzi += v.spazio.testo + (if (v.spazio.avviso) " ⚠" else "")
        if (v.stato.id == "spostamento" && v.stato.ragione != null) pezzi += v.stato.ragione
        return pezzi.joinToString(" · ")
    }
    /** Le azioni: la principale (Apri, se c'è), le altre, quella pericolosa per ultima. */
    fun azioniInOrdine(az: List<AzioneProgettoDrive>): List<AzioneProgettoDrive> {
        val pericolo = az.firstOrNull { it.id == "solo-cloud-qui" }
        val resto = az.filter { it != pericolo }
        val primaria = resto.firstOrNull { it.id == "apri" } ?: resto.firstOrNull()
        return listOfNotNull(primaria) + resto.filter { it != primaria } + listOfNotNull(pericolo)
    }
}

private data class DaConfermare(val titolo: String, val testo: String, val bottone: String, val fai: suspend () -> EsitoAzioneDrive)

fun coloreVista(c: String): Color = when (c) {
    "verde" -> ColoreStato.verde
    "ambra" -> ColoreStato.ambra
    "rosso" -> ColoreStato.rosso
    // 0.80.0: «quieto» è il grigio del PC; prima finiva nel blu qui sotto.
    "quieto" -> ColoreStato.quieto
    // PC 0.71: il ruolo «Interfaccia»; PC 0.82.0: gli altri colori dei ruoli, dalla tabella unica.
    else -> if (c in TabellaAttivita.colori) Attivita.colore(c) else ColoreStato.blu
}

@Composable
private fun Titoletto(testo: String, aiuto: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 10.dp)) {
        Text(testo.uppercase(), color = Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        if (aiuto != null) Aiuto(aiuto, di = testo)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SezionePannelloDrive(api: Api) {
    val scope = rememberCoroutineScope()
    var p by remember { mutableStateOf<PannelloDrive?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    var gruppo by remember { mutableStateOf("tutti") }
    var q by remember { mutableStateOf("") }
    var ordine by remember { mutableStateOf("stato") }
    var scelto by remember { mutableStateOf<String?>(null) }
    var strumento by remember { mutableStateOf<String?>(null) }
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
    val senzaSpazio = p != null && p?.spazio == null
    LaunchedEffect(senzaSpazio) { var giri = 0; while (senzaSpazio && giri < 5) { Davanti.pausa(4000); leggi(); giri += 1; if (p?.spazio != null) break } }

    if (spenta) { Text(FunzioniPc.testoMancante(FunzionePc.PANNELLO_DRIVE), color = Banco.ambra, fontSize = 13.sp); return }
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val d = p ?: run { if (guasto == null) Text("Leggo…", color = Banco.testoQuieto, fontSize = 13.sp); return }
    if (d.pcDaAggiornare.isNotEmpty()) RigaConAiuto("${d.pcDaAggiornare.joinToString(", ")}: va aggiornato", "Finché non è aggiornato, di quel PC si vedono solo le copie caricate sul Drive.")

    // Il dettaglio a tutto schermo: «‹ Progetti» torna all'elenco.
    val sel = scelto?.let { id -> d.progetti.firstOrNull { it.id == id } }
    // «Indietro» (2.83.0): chiude il dettaglio o lo strumento aperto, invece di uscire dall'app.
    androidx.activity.compose.BackHandler(enabled = sel != null || strumento != null) { if (sel != null) scelto = null else strumento = null }
    if (sel != null) {
        DettaglioProgetto(d, sel, onIndietro = { scelto = null }, fai = { a, b -> fai(a, b) }, chiedi = { conferma = it }, api = api)
    } else {
        RigaConAiuto("Ogni progetto, dove vive e come sta.", "Ogni progetto vive su un PC: lì girano le sue chat; gli altri PC e il telefono le aprono da lontano, e se quel PC è spento quello che scrivi aspetta nella sua posta. Cambia PC solo con «Sposta su questo PC». Stato: a posto, al lavoro (una chat sta lavorando), da sistemare (con il motivo), spostamento in corso. Tocca un progetto per il dettaglio e le azioni. Niente si cancella: le copie tolte vanno nel recupero per 30 giorni.")
        val conti = ProgettiVista.conti(d.progetti)
        if (gruppo == "da-sistemare" && (conti["da-sistemare"] ?: 0) == 0) gruppo = "tutti"
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((id, nome) in ProgettiVista.GRUPPI) {
                if (id == "da-sistemare" && (conti[id] ?: 0) == 0) continue
                FilterChip(selected = gruppo == id, onClick = { gruppo = id; quante = 60 },
                    label = { Text("$nome ${conti[id] ?: 0}", color = if (id == "da-sistemare") Banco.ambra else Banco.testo) })
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = q, onValueChange = { q = it }, placeholder = { Text("Cerca progetto o PC", maxLines = 1) }, singleLine = true, modifier = Modifier.weight(1f))
            var aperto by remember { mutableStateOf(false) }
            Box {
                TextButton(onClick = { aperto = true }) { Text("⇅ " + (ProgettiVista.ORDINI.firstOrNull { it.first == ordine }?.second ?: "Stato")) }
                DropdownMenu(expanded = aperto, onDismissRequest = { aperto = false }) {
                    for ((id, nome) in ProgettiVista.ORDINI) DropdownMenuItem(text = { Text(nome) }, onClick = { ordine = id; aperto = false })
                }
            }
        }
        val righe = ProgettiVista.ordina(ProgettiVista.cerca(d.progetti.filter { ProgettiVista.nelGruppo(it, gruppo) }, q), ordine)
        if (righe.isEmpty()) Text(if (q.isNotBlank()) "Nessun progetto per «$q»." else if (gruppo == "da-sistemare") "Tutto a posto" else "Nessun progetto in questo gruppo.", color = if (gruppo == "da-sistemare") Banco.verde else Banco.testoQuieto, fontSize = 13.sp)
        for (r in righe.take(quante)) {
            val v = ProgettiVista.vistaDi(r)
            Column(Modifier.fillMaxWidth().tocco { scelto = r.id; strumento = null }.padding(vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(r.nome, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("● ${v.stato.parola}", color = coloreVista(v.stato.colore), fontSize = 13.sp)
                }
                Text(ProgettiVista.sotto(r), color = if (v.stato.id == "da-sistemare") Banco.ambra else Banco.testoQuieto, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (righe.size > quante) TextButton(onClick = { quante += 60 }) { Text("Altri ${righe.size - quante}") }

        // Gli strumenti rari, come «Strumenti ▾» sul PC.
        Titoletto("Strumenti")
        val inRec = d.rimozione.inRecupero.filter { it.ripristinataIl == null }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val voci = listOf("chat" to "Tutte le chat", "spazio" to "Spazio sul Drive") +
                (if (inRec.isNotEmpty()) listOf("recupero" to "Cartelle in recupero (${inRec.size})") else emptyList())
            for ((id, nome) in voci) FilterChip(selected = strumento == id, onClick = { strumento = if (strumento == id) null else id }, label = { Text(nome) })
        }
        when (strumento) {
            "chat" -> TutteLeChatDrive(d, filtro, { filtro = it }, senzaNome, { senzaNome = it })
            "spazio" -> SpazioDriveSezione(d, fai = { a, b -> fai(a, b) }, chiedi = { conferma = it }, api = api)
            "recupero" -> for (c in inRec) {
                Text("${c.nome} · tolta il ${QuadernoPersonaleTesti.quando(c.quando)} · fino al ${QuadernoPersonaleTesti.quando(c.scadeIl)}", color = Banco.testo, fontSize = 12.sp)
                TextButton(onClick = { conferma = DaConfermare("Ripristina «${c.nome}»", "La cartella torna in ${c.percorsoOriginale}. Se lì adesso c’è un’altra cartella non la sovrascrivo e te lo dico.", "Ripristina") { api.azioneDrive("ripristina", "", c.id) } }) { Text("Ripristina") }
            }
        }
        OutlinedButton(onClick = { scope.launch { leggi() } }) { Text("Aggiorna") }
    }

    conferma?.let { c ->
        AlertDialog(
            onDismissRequest = { conferma = null },
            title = { Text(c.titolo) },
            // Un testo lungo si scorre.
            text = { Column(Modifier.verticalScroll(rememberScrollState())) { Text(c.testo) } },
            confirmButton = { TextButton(onClick = { conferma = null; fai(c.fai, c.titolo.lowercase()) }) { Text(c.bottone) } },
            dismissButton = { TextButton(onClick = { conferma = null }) { Text("Annulla") } }
        )
    }
}

/** Il dettaglio di un progetto: azioni in vista (ognuna con il «?»), conferme, problemi, chat, cartelle, spazio. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DettaglioProgetto(d: PannelloDrive, r: RigaProgettoDrive, onIndietro: () -> Unit, fai: (suspend () -> EsitoAzioneDrive, String) -> Unit, chiedi: (DaConfermare) -> Unit, api: Api) {
    val v = ProgettiVista.vistaDi(r)
    var quaderno by remember(r.id) { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onIndietro, modifier = Modifier.heightIn(min = 48.dp)) { Text("‹ Progetti") }
        Spacer(Modifier.weight(1f))
        // Il quaderno del progetto (2.83.0): prima solo dal dettaglio di un suo autopilota.
        val cartella = r.cartelle.firstOrNull { it.pc == d.io.id }?.percorso ?: r.cartellaTrovata
        if (cartella != null) TextButton(onClick = { quaderno = true }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Quaderno") }
        if (quaderno && cartella != null) Quaderno(api, cartella, onChiudi = { quaderno = false })
    }
    Text(r.nome, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    Text(v.stato.parola + (v.stato.ragione?.let { " · $it" } ?: ""), color = coloreVista(v.stato.colore), fontSize = 13.sp,
        modifier = Modifier.padding(vertical = 4.dp).border(1.dp, coloreVista(v.stato.colore), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 2.dp))
    // Dove vive (PC 0.88.0: il proprietario); cambia PC solo con «Sposta su questo PC», fra le azioni qui sotto.
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 4.dp)) {
        Text("Dove vive: ", color = Banco.testoQuieto, fontSize = 13.sp)
        Text(v.dove, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(1f))
    }
    val azioni = ProgettiVista.azioniInOrdine(r.azioni)
    for ((i, a) in azioni.withIndex()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val pericolo = a.id == "solo-cloud-qui"
            val fa = {
                if (a.conferma == null) fai({ api.azioneDrive(a.id, r.id) }, a.titolo.lowercase())
                else chiedi(DaConfermare("${a.titolo}: ${r.nome}", a.testo, a.conferma) { api.azioneDrive(a.id, r.id) })
            }
            if (i == 0 && !pericolo) Button(onClick = fa, modifier = Modifier.weight(1f)) { Text(a.titolo) }
            else OutlinedButton(onClick = fa, modifier = Modifier.weight(1f), border = if (pericolo) BorderStroke(1.dp, Banco.rosso) else ButtonDefaults.outlinedButtonBorder(true)) { Text(a.titolo, color = if (pericolo) Banco.rosso else Banco.testo) }
            Aiuto(a.testo, di = a.titolo)
        }
    }
    if (r.problemi.isNotEmpty()) {
        Titoletto("Da sistemare")
        for (x in r.problemi) Row(verticalAlignment = Alignment.CenterVertically) { Text(x.titolo, color = Banco.ambra, fontSize = 13.sp); Aiuto("${x.spiega} Cosa fare: ${x.cosaFare}", di = x.titolo) }
    }
    val chat = PannelloDriveRegole.chatDelProgetto(d, r)
    Titoletto("Chat (${chat.size})", "Si aprono dove vivono: qui con la loro storia, o dal vivo sul PC del progetto. Pallino blu: sta lavorando.")
    if (chat.isEmpty()) Text("Nessuna chat con nome.", color = Banco.testoQuieto, fontSize = 12.sp)
    for (c in chat.take(30)) {
        val come = PannelloDriveRegole.comeAprire(c, r)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("●", color = if (c.alLavoroSu.isNotEmpty()) ColoreStato.blu else ColoreStato.quieto, fontSize = 12.sp, modifier = Modifier.padding(end = 6.dp))
            Text(c.titolo, color = Banco.testo, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            when (come) {
                is AperturaChat.Qui -> TextButton(onClick = { fai({ api.apriChatProgetto(come.cwd, c.sessione, null, c.titolo) }, "aprire la chat") }) { Text("Apri", fontSize = 12.sp) }
                is AperturaChat.Altrove -> TextButton(onClick = { fai({ api.apriChatProgetto(come.cwd, c.sessione, come.pc, c.titolo) }, "aprire la chat") }) { Text("Guarda su ${come.nome}", fontSize = 12.sp) }
                null -> {}
            }
        }
    }
    Titoletto("Cartelle")
    for (c in r.cartelle) Text("${c.nome}${if (c.pc == d.io.id) " (qui)" else ""}  ${c.percorso}", color = Banco.testo, fontSize = 12.sp)
    r.cartellaTrovata?.let { Text("${d.io.nome} (qui, per nome)  $it", color = Banco.testo, fontSize = 12.sp) }
    if (r.cartelle.isEmpty() && r.cartellaTrovata == null) Text("Su nessun PC.", color = Banco.testoQuieto, fontSize = 12.sp)
    Titoletto("Spazio sul Drive", "I file oltre 20 MB sono segnalati; oltre 50 MB restano a casa.")
    val sd = r.spazioDrive
    if (sd == null) Text("Non ancora misurato.", color = Banco.testoQuieto, fontSize = 12.sp)
    else {
        Text("${SpazioRegole.byte(sd.byte)} in ${sd.file} file", color = Banco.testo, fontSize = 12.sp)
        for (g in sd.grandi.sortedByDescending { it.byte }.take(5)) Text("⚠ ${g.percorso} · ${SpazioRegole.byte(g.byte)}", color = Banco.ambra, fontSize = 12.sp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SpazioDriveSezione(d: PannelloDrive, fai: (suspend () -> EsitoAzioneDrive, String) -> Unit, chiedi: (DaConfermare) -> Unit, api: Api) {
    val sp = d.spazio ?: run { Text("Misuro il Drive…", color = Banco.testoQuieto, fontSize = 12.sp); return }
    sp.errore?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    sp.misura?.let { m ->
        Text(SpazioRegole.riepilogo(m), color = Banco.testo, fontSize = 12.sp)
        for (x in SpazioRegole.righe(m)) Text(x, color = Banco.testoQuieto, fontSize = 12.sp)
    }
    for (pr in sp.proposte) {
        Text("${pr.titolo} · ${pr.breve} · libera ${SpazioRegole.byte(pr.byte)}", color = Banco.testo, fontSize = 12.sp)
        TextButton(onClick = { chiedi(DaConfermare(pr.titolo, pr.spiega, "Nel recupero") { api.azioneSpazio("spazio-pulisci", tipo = pr.tipo) }) }) { Text("Pulisci…") }
    }
    if (sp.misura != null && sp.proposte.isEmpty()) Text("Niente da pulire.", color = Banco.testoQuieto, fontSize = 12.sp)
    for (x in SpazioRegole.inRecupero(sp)) {
        Text("${x.titolo} · ${x.voci.size} file, ${SpazioRegole.byte(x.byte)} · nel recupero fino al ${QuadernoPersonaleTesti.quando(x.scadeIl)}", color = Banco.testo, fontSize = 12.sp)
        FlowRow {
            TextButton(onClick = { fai({ api.azioneSpazio("spazio-annulla", id = x.id) }, "annullare la pulizia") }) { Text("Annulla") }
            TextButton(onClick = { chiedi(DaConfermare("Svuota adesso «${x.titolo}»", "Cancello adesso questi file dal Drive, senza aspettare i 30 giorni. Dopo non si annulla più.", "Cancella per sempre") { api.azioneSpazio("spazio-svuota", id = x.id) }) }) { Text("Svuota adesso…") }
        }
    }
    TextButton(onClick = { fai({ api.azioneSpazio("spazio-misura") }, "misurare il Drive") }) { Text("Misura adesso") }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TutteLeChatDrive(d: PannelloDrive, filtro: String, setFiltro: (String) -> Unit, senzaNome: Boolean, setSenzaNome: (Boolean) -> Unit) {
    var quante by remember { mutableStateOf(60) }
    FlowRow {
        for ((id, nome) in listOf("tutti" to "Tutte", "sbagliati" to "Da sistemare", "questo-pc" to "Su questo PC", "solo-cloud" to "Solo cloud")) {
            TextButton(onClick = { setFiltro(id); quante = 60 }) { Text(if (filtro == id) "[$nome]" else nome, fontSize = 12.sp) }
        }
    }
    if (PannelloDriveRegole.nascoste(d) > 0) TextButton(onClick = { setSenzaNome(!senzaNome) }) { Text((if (senzaNome) "☑" else "☐") + " anche le senza nome (${PannelloDriveRegole.nascoste(d)})", fontSize = 12.sp) }
    val righe = PannelloDriveRegole.chat(d, filtro, senzaNome)
    if (righe.isEmpty()) Text("Nessuna chat con questo filtro.", color = Banco.testoQuieto, fontSize = 12.sp)
    for (r in righe.take(quante)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
            Text(r.titolo, color = if (r.problemi.isEmpty()) Banco.testo else Banco.ambra, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text("${r.residente?.let { it.nome + (if (it.qui) " (questo PC)" else "") } ?: "senza casa"} · ${r.ultimoUso?.let { QuadernoPersonaleTesti.quando(it) } ?: "mai"}", color = Banco.testoQuieto, fontSize = 12.sp)
        }
    }
    if (righe.size > quante) TextButton(onClick = { quante += 60 }) { Text("Altre ${righe.size - quante}") }
}
