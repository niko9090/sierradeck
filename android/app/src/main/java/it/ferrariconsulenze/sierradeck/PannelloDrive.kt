package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
    val vista: VistaProgettoDrive? = null,
    /** PC 0.71: «Sposta su ▾», i PC di arrivo con la conferma già scritta dal PC. */
    val spostaSu: List<DestinazioneSpostaDrive> = emptyList()
)
@Serializable data class RiassuntoSpostaDrive(val titolo: String = "", val righe: List<String> = emptyList(), val conferma: String = "", val avviso: String? = null)
@Serializable data class DestinazioneSpostaDrive(
    val pc: String = "", val nome: String = "", val qui: Boolean = false, val acceso: Boolean = false,
    val attuale: Boolean = false, val testo: String = "", val riassunto: RiassuntoSpostaDrive? = null
)

/** «Sposta su ▾» (PC 0.71.0): le regole lato app, uguali a quelle della pagina. */
object SpostaSu {
    private const val SEPARATORE_RIGHE = "\n"
    /** Si mostra solo se c'è almeno un PC diverso da quello dove vive. */
    fun mostra(r: RigaProgettoDrive): Boolean = r.spostaSu.any { !it.attuale }
    /** Il testo della conferma: le righe del PC, con l'avviso in fondo. */
    fun testoConferma(x: DestinazioneSpostaDrive): String {
        val c = x.riassunto ?: return "Sposto il progetto su ${x.nome}. Niente si cancella: «Annulla tutto» per 30 giorni."
        return (c.righe + listOfNotNull(c.avviso?.let { "⚠ $it" })).joinToString(SEPARATORE_RIGHE)
    }
    fun titolo(x: DestinazioneSpostaDrive, nome: String): String = x.riassunto?.titolo ?: "Sposta «$nome» su ${x.nome}?"
    fun bottone(x: DestinazioneSpostaDrive): String = x.riassunto?.conferma ?: "Conferma: sposta su ${x.nome}"
}
@Serializable data class SpazioProgettoDrive(val file: Int = 0, val byte: Double = 0.0, val grandi: List<FileGrandeDrive> = emptyList())
@Serializable data class FileGrandeDrive(val percorso: String = "", val byte: Double = 0.0)
@Serializable data class CartellaProgettoDrive(val pc: String = "", val nome: String = "", val percorso: String = "")

/** Come si apre una chat dal pannello: qui, o dal vivo sul PC dove vive (PC 0.67.0). */
sealed class AperturaChat {
    data class Qui(val cwd: String) : AperturaChat()
    data class Altrove(val pc: String, val nome: String, val cwd: String) : AperturaChat()
}
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
    "verde" -> Banco.verde
    "ambra" -> Banco.ambra
    "rosso" -> Banco.rosso
    // 0.80.0: «quieto» è il grigio del PC; prima finiva nel blu qui sotto.
    "quieto" -> Banco.testoQuieto
    // PC 0.71: il ruolo «Interfaccia»; PC 0.82.0: gli altri colori dei ruoli, dalla tabella unica.
    else -> if (c in TabellaAttivita.colori) Attivita.colore(c) else Color(0xFF4AA3FF)
}

@Composable
private fun Titoletto(testo: String, aiuto: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 10.dp)) {
        Text(testo.uppercase(), color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
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
    // Analisi, unione e traslochi lavorano sul PC: finché lavorano, il pannello si rilegge.
    val lavora = p?.let { PannelloDriveRegole.lavora(it) || TraslocoRegole.lavora(it.traslochi) } == true
    LaunchedEffect(lavora) { while (lavora) { kotlinx.coroutines.delay(2500); leggi(); if (p?.let { PannelloDriveRegole.lavora(it) || TraslocoRegole.lavora(it.traslochi) } != true) break } }
    val senzaSpazio = p != null && p?.spazio == null
    LaunchedEffect(senzaSpazio) { var giri = 0; while (senzaSpazio && giri < 5) { kotlinx.coroutines.delay(4000); leggi(); giri += 1; if (p?.spazio != null) break } }

    if (spenta) { Text(FunzioniPc.testoMancante(FunzionePc.PANNELLO_DRIVE), color = Banco.ambra, fontSize = 13.sp); return }
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val d = p ?: run { if (guasto == null) Text("Leggo…", color = Banco.testoQuieto, fontSize = 13.sp); return }
    if (d.pcDaAggiornare.isNotEmpty()) RigaConAiuto("${d.pcDaAggiornare.joinToString(", ")}: va aggiornato", "Finché non è aggiornato, di quel PC si vedono solo le copie caricate sul Drive.")

    // Il dettaglio a tutto schermo: «‹ Progetti» torna all'elenco.
    val sel = scelto?.let { id -> d.progetti.firstOrNull { it.id == id } }
    if (sel != null) {
        DettaglioProgetto(d, sel, onIndietro = { scelto = null }, fai = { a, b -> fai(a, b) }, chiedi = { conferma = it }, api = api)
    } else {
        RigaConAiuto("Ogni progetto, dove vive e come sta.", "Ogni progetto vive su un PC (il residente): lì girano le sue chat; gli altri PC le guardano dal vivo. Stato: a posto, al lavoro (una chat sta lavorando), da sistemare (con il motivo), spostamento in corso. Tocca un progetto per il dettaglio e le azioni. Niente si cancella: le copie tolte vanno nel recupero per 30 giorni.")
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
            Column(Modifier.fillMaxWidth().clickable { scelto = r.id; strumento = null }.padding(vertical = 8.dp)) {
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
                (if (inRec.isNotEmpty()) listOf("recupero" to "Cartelle in recupero (${inRec.size})") else emptyList()) +
                (if (d.traslochi.isNotEmpty()) listOf("traslochi" to "Spostamenti") else emptyList()) +
                (if (d.unioni.isNotEmpty()) listOf("unioni" to "Unioni fatte") else emptyList()) +
                (if (d.piano?.azioni?.isNotEmpty() == true) listOf("piano" to "Piano di allineamento") else emptyList())
            for ((id, nome) in voci) FilterChip(selected = strumento == id, onClick = { strumento = if (strumento == id) null else id }, label = { Text(nome) })
        }
        when (strumento) {
            "chat" -> TutteLeChatDrive(d, filtro, { filtro = it }, senzaNome, { senzaNome = it }, chiedi = { conferma = it }, api = api)
            "spazio" -> SpazioDriveSezione(d, fai = { a, b -> fai(a, b) }, chiedi = { conferma = it }, api = api)
            "recupero" -> for (c in inRec) {
                Text("${c.nome} · tolta il ${QuadernoPersonaleTesti.quando(c.quando)} · fino al ${QuadernoPersonaleTesti.quando(c.scadeIl)}", color = Banco.testo, fontSize = 12.sp)
                TextButton(onClick = { conferma = DaConfermare("Ripristina «${c.nome}»", "La cartella torna in ${c.percorsoOriginale}. Se lì adesso c’è un’altra cartella non la sovrascrivo e te lo dico.", "Ripristina") { api.azioneDrive("ripristina", "", c.id) } }) { Text("Ripristina") }
            }
            "traslochi" -> for (t in d.traslochi) Trasloco(t, fai = { a, b -> fai(a, b) }, chiedi = { conferma = it }, api = api)
            "unioni" -> for (u in d.unioni) Unione(u, chiedi = { conferma = it }, api = api)
            "piano" -> d.piano?.azioni?.forEach { a -> Text((if (a.tipo == "porta-qui") "↓ " else "☁ ") + a.perche, color = Banco.testo, fontSize = 12.sp) }
        }
        OutlinedButton(onClick = { scope.launch { leggi() } }) { Text("Aggiorna") }
    }

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

/** Il dettaglio di un progetto: azioni in vista (ognuna con il «?»), conferme, problemi, spostamento, chat, cartelle, spazio, storia. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DettaglioProgetto(d: PannelloDrive, r: RigaProgettoDrive, onIndietro: () -> Unit, fai: (suspend () -> EsitoAzioneDrive, String) -> Unit, chiedi: (DaConfermare) -> Unit, api: Api) {
    val v = ProgettiVista.vistaDi(r)
    val ids = r.ids.ifEmpty { listOf(r.id) }
    TextButton(onClick = onIndietro) { Text("‹ Progetti") }
    Text(r.nome, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    Text(v.stato.parola + (v.stato.ragione?.let { " · $it" } ?: ""), color = coloreVista(v.stato.colore), fontSize = 13.sp,
        modifier = Modifier.padding(vertical = 4.dp).border(1.dp, coloreVista(v.stato.colore), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 2.dp))
    // «Sposta su ▾» (PC 0.71.0): da qualsiasi PC verso qualsiasi PC, con la conferma del PC.
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 4.dp)) {
        Text("Dove vive: ", color = Banco.testoQuieto, fontSize = 13.sp)
        Text(v.dove, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(1f))
        if (SpostaSu.mostra(r)) {
            var aperto by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { aperto = true }) { Text("Sposta su ▾") }
                DropdownMenu(expanded = aperto, onDismissRequest = { aperto = false }) {
                    for (x in r.spostaSu) {
                        DropdownMenuItem(
                            text = { Text((if (x.acceso) "● " else "○ ") + x.testo, color = if (x.attuale) Banco.testoQuieto else Banco.testo) },
                            enabled = !x.attuale,
                            onClick = { aperto = false; chiedi(DaConfermare(SpostaSu.titolo(x, r.nome), SpostaSu.testoConferma(x), SpostaSu.bottone(x)) { api.spostaSu(r.id, x.pc) }) }
                        )
                    }
                }
            }
            Aiuto("Il progetto va a vivere sul PC che scegli: là girano le sue chat, gli altri le guardano dal vivo. Il trasloco gira sul PC di arrivo: confronta le copie, prende quello che c’è solo altrove, unisce, e solo alla fine mette le copie vecchie nel recupero. Niente si cancella: «Annulla tutto» per 30 giorni.", di = "Sposta su")
        }
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
    PannelloDriveRegole.residenza(d, r.id)?.let { st ->
        if (st.fase == "attesa-conferma" || st.fase == "in-uso") {
            val righe = st.riassunto?.righe
            RigaConAiuto("Aspetta la tua conferma: unione delle copie", (righe ?: listOf(st.messaggio)).joinToString("\n"))
            FlowRow {
                OutlinedButton(onClick = { chiedi(DaConfermare("Conferma e unisci «${r.nome}»", (righe ?: listOf(st.messaggio)).joinToString("\n\n"), "Conferma e unisci") { api.azioneDrive("conferma-residenza", r.id) }) }) { Text("Conferma") }
                TextButton(onClick = { fai({ api.azioneDrive("annulla-residenza", r.id) }, "annullare") }) { Text("Annulla") }
            }
        } else Text(st.messaggio, color = Banco.testo, fontSize = 12.sp)
    }
    d.rimozione.stati.firstOrNull { it.progetto in ids }?.let { st ->
        RigaConAiuto("Togliere da questo PC", st.messaggio)
        if (st.fase == "attesa-conferma" || st.fase == "in-uso") FlowRow {
            OutlinedButton(onClick = { fai({ api.azioneDrive("conferma", st.progetto) }, "togliere «${st.nome}»") }, border = BorderStroke(1.dp, Banco.rosso)) { Text("Togli da questo PC", color = Banco.rosso) }
            TextButton(onClick = { fai({ api.azioneDrive("annulla", st.progetto) }, "annullare") }) { Text("Annulla") }
        }
    }
    if (r.problemi.isNotEmpty()) {
        Titoletto("Da sistemare")
        for (x in r.problemi) Row(verticalAlignment = Alignment.CenterVertically) { Text(x.titolo, color = Banco.ambra, fontSize = 13.sp); Aiuto("${x.spiega} Cosa fare: ${x.cosaFare}", di = x.titolo) }
    }
    for (t in d.traslochi.filter { it.progetto in ids }) Trasloco(t, fai = fai, chiedi = chiedi, api = api)
    val chat = PannelloDriveRegole.chatDelProgetto(d, r)
    Titoletto("Chat (${chat.size})", "Si aprono dove vivono: qui con la loro storia, o dal vivo sul PC residente. Pallino blu: sta lavorando.")
    if (chat.isEmpty()) Text("Nessuna chat con nome.", color = Banco.testoQuieto, fontSize = 12.sp)
    for (c in chat.take(30)) {
        val come = PannelloDriveRegole.comeAprire(c, r)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("●", color = if (c.alLavoroSu.isNotEmpty()) Color(0xFF4AA3FF) else Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(end = 6.dp))
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
    val unioni = d.unioni.filter { it.progetto in ids }
    if (unioni.isNotEmpty()) { Titoletto("Storia"); for (u in unioni) Unione(u, chiedi = chiedi, api = api) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Trasloco(t: TraslocoDrive, fai: (suspend () -> EsitoAzioneDrive, String) -> Unit, chiedi: (DaConfermare) -> Unit, api: Api) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) { Text("SPOSTAMENTO DI «${t.nome}» SU ${t.verso.nome} · ${TraslocoRegole.stato(t)}", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold); Aiuto("Raccolgo le copie, le confronto, unisco qui quello che serve e solo alla fine metto le copie vecchie nel recupero dei loro PC. Se un PC non risponde mi fermo e riprendo da dove ero. «Annulla tutto» per 30 giorni.", di = "SPOSTAMENTO") }
    androidx.compose.material3.LinearProgressIndicator(progress = { TraslocoRegole.percento(t) / 100f }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), color = if (t.fermo != null) Banco.ambra else Banco.verde)
    TraslocoRegole.attuale(t)?.takeIf { t.finitoIl == null }?.let { (id, titolo) -> Text("$titolo: ${TraslocoRegole.passo(t, id).dettaglio ?: "…"}", color = Banco.testo, fontSize = 12.sp) }
    // Un PC spento (PC 0.71.1): il motivo in chiaro, con il nome scelto, e le due scelte.
    val chiaro = t.fermoChiaro
    var aspetto by remember(t.id) { mutableStateOf(false) }
    if (t.fermo != null && chiaro?.pc != null) {
        Text("Fermo: ${chiaro.testo}", color = Banco.ambra, fontSize = 12.sp)
        if (chiaro.scelte) FlowRow {
            TextButton(onClick = { aspetto = true }) { Text("Aspetta ${chiaro.pc.nome}") }
            TextButton(onClick = { chiedi(DaConfermare("Vai avanti senza ${chiaro.pc.nome}", "Uso la sua copia che è già sul Drive. La sua copia sul PC resta dov’è: quando torna, quello che ha solo lui entra nei recuperati e la sua copia va nel recupero di quel PC per 30 giorni. Niente si cancella.", "Vai avanti senza") { api.traslocoSenza(t.id, chiaro.pc.pc) }) }) { Text("Vai avanti senza…") }
        }
        if (aspetto) Text("Aspetto ${chiaro.pc.nome}: riparto da solo quando si riaccende.", color = Banco.testo, fontSize = 12.sp)
    } else t.fermo?.let { Text("Fermo: ${chiaro?.testo ?: it.motivo}" + (if (it.riprovaDaSolo) " Riprendo da solo quando passa." else ""), color = Banco.ambra, fontSize = 12.sp) }
    for (a in t.altrove.filter { it.esito == "dopo" }) Text("${a.nome} era spento: la sua copia la sistemo quando torna.", color = Banco.testo, fontSize = 12.sp)
    for ((id, titolo) in TraslocoRegole.PASSI) Text(TraslocoRegole.riga(t, id, titolo), color = if (TraslocoRegole.passo(t, id).stato == "da-fare") Banco.testoQuieto else Banco.testo, fontSize = 12.sp)
    if (t.finitoIl != null) for (x in t.riassunto) Text("• $x", color = Banco.testo, fontSize = 12.sp)
    if (t.annullatoIl != null) for (x in t.annullamento) Text("• $x", color = Banco.testo, fontSize = 12.sp)
    FlowRow {
        if (t.fermo != null) TextButton(onClick = { fai({ api.azioneDrive("trasloco-riprendi", "", t.id) }, "riprendere lo spostamento") }) { Text("Riprendi") }
        if (TraslocoRegole.annullabile(t, System.currentTimeMillis())) TextButton(onClick = { chiedi(DaConfermare("Annulla tutto: «${t.nome}»", "Le copie vecchie tornano al loro posto sui loro PC, l’unione si annulla, la casa torna a chi c’era prima. Niente si cancella.", "Annulla tutto") { api.azioneDrive("trasloco-annulla", "", t.id) }) }) { Text("Annulla tutto…") }
    }
}

@Composable
private fun Unione(u: UnioneFattaDrive, chiedi: (DaConfermare) -> Unit, api: Api) {
    Text("${u.nome} · unito il ${QuadernoPersonaleTesti.quando(u.quando)} · annullabile fino al ${QuadernoPersonaleTesti.quando(u.scadeIl)}", color = Banco.testo, fontSize = 12.sp)
    TextButton(onClick = { chiedi(DaConfermare("Annulla l’unione di «${u.nome}»", "Le cartelle doppie tornano al loro posto dalla cartella di recupero, i file sostituiti tornano com’erano, quelli entrati con l’unione escono e vanno nei recuperati (non si cancellano), le trascrizioni e i workspace tornano com’erano. La casa delle chat resta questo PC.", "Annulla l’unione") { api.azioneDrive("annulla-unione", u.progetto, u.id) }) }) { Text("Annulla l’unione") }
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
private fun TutteLeChatDrive(d: PannelloDrive, filtro: String, setFiltro: (String) -> Unit, senzaNome: Boolean, setSenzaNome: (Boolean) -> Unit, chiedi: (DaConfermare) -> Unit, api: Api) {
    var quante by remember { mutableStateOf(60) }
    FlowRow {
        for ((id, nome) in listOf("tutti" to "Tutte", "sbagliati" to "Da sistemare", "questo-pc" to "Su questo PC", "solo-cloud" to "Solo cloud")) {
            TextButton(onClick = { setFiltro(id); quante = 60 }) { Text(if (filtro == id) "[$nome]" else nome, fontSize = 12.sp) }
        }
    }
    if (PannelloDriveRegole.nascoste(d) > 0) TextButton(onClick = { setSenzaNome(!senzaNome) }) { Text((if (senzaNome) "☑" else "☐") + " anche le senza nome (${PannelloDriveRegole.nascoste(d)})", fontSize = 12.sp) }
    val tutti = listOf(d.io) + d.pc
    val righe = PannelloDriveRegole.chat(d, filtro, senzaNome)
    if (righe.isEmpty()) Text("Nessuna chat con questo filtro.", color = Banco.testoQuieto, fontSize = 12.sp)
    for (r in righe.take(quante)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
            Text(r.titolo, color = if (r.problemi.isEmpty()) Banco.testo else Banco.ambra, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text("${r.residente?.let { it.nome + (if (it.qui) " (questo PC)" else "") } ?: "senza casa"} · ${r.ultimoUso?.let { QuadernoPersonaleTesti.quando(it) } ?: "mai"}", color = Banco.testoQuieto, fontSize = 12.sp)
            FlowRow {
                for (pc in tutti.filter { it.id != r.residente?.pc }) TextButton(onClick = {
                    chiedi(DaConfermare("Rendi residente ${pc.nome}", "La chat «${r.titolo}» lavorerà su ${pc.nome}: il suo claude.exe parte solo lì, sugli altri PC si apre dal vivo, e le altre copie vanno nella cartella di recupero a fine turno (mai a metà). Non si cancella niente.", "Conferma") {
                        api.residenteDrive(listOf(r.sessione), pc)
                    })
                }) { Text("Residente: ${pc.nome}", fontSize = 12.sp) }
            }
        }
    }
    if (righe.size > quante) TextButton(onClick = { quante += 60 }) { Text("Altre ${righe.size - quante}") }
}
