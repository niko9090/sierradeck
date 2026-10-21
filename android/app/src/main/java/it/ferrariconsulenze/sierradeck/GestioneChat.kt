package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/**
 * La gestione delle chat dal telefono (PC 0.79.0, app 2.79.0): Chiudi,
 * Archivia ed Elimina dal PC per ogni chat, «Spazio delle chat» con la scelta
 * di più chat e il totale, le Archiviate e il Recupero (30 giorni) con
 * Ripristina, «Svuota il recupero adesso» in due passi (il PC dà la conferma,
 * poi si scrive SVUOTA). Le regole le decide il PC (`/api/chat/gestione/…`);
 * i testi sono la copia di `src/shared/gestione-chat-vista.ts`, controllata da
 * `GestioneChatTest` sui casi scritti dal PC (`resources/gestione-chat/vista-0.79.json`).
 */
@Serializable data class VoceSpazioChat(
    val sessione: String = "",
    val titolo: String = "",
    val cwd: String? = null,
    val byte: Double = 0.0,
    val ultimaAttivita: String? = null,
    val archiviata: Boolean = false,
    val aperta: Boolean = false,
    /** Il perché non si elimina (lo dice il PC); assente = si può. */
    val nonEliminabile: String? = null
)
@Serializable data class EsclusaChat(val sessione: String = "", val motivo: String = "")
@Serializable data class SelezioneChat(
    val chat: Int = 0, val byte: Double = 0.0, val eliminabili: Int = 0, val byteEliminabili: Double = 0.0, val escluse: List<EsclusaChat> = emptyList(),
    /** PC 0.79.0: le scelte che lì non sono aperte («Chiudi» spento); assente da un PC più vecchio. */
    val chiuse: List<String>? = null
)
@Serializable data class ContoRecupero(val chat: Int = 0, val byte: Double = 0.0)
@Serializable data class VistaSpazioChat(
    val chat: List<VoceSpazioChat> = emptyList(),
    val totale: Double = 0.0,
    val eliminabili: Double = 0.0,
    val recupero: ContoRecupero = ContoRecupero(),
    val selezione: SelezioneChat? = null
)
@Serializable data class EsitoChatApp(val sessione: String = "", val ok: Boolean = false, val motivo: String? = null, val byte: Double? = null)
@Serializable data class EsitoAzioniChat(
    val azione: String = "", val esiti: List<EsitoChatApp> = emptyList(), val fatte: Int = 0, val rifiutate: Int = 0, val byte: Double? = null, val messaggio: String = ""
)
@Serializable data class ChatArchiviataApp(val sessione: String = "", val il: String = "", val titolo: String? = null)
@Serializable data class ArchiviateChat(val archiviate: List<ChatArchiviataApp> = emptyList())
@Serializable data class DriveDelRecupero(val pulizia: String = "", val file: Int = 0, val byte: Double = 0.0)
@Serializable data class ChatInRecuperoApp(
    val id: String = "", val sessione: String = "", val titolo: String = "", val quando: String = "", val scadeIl: String = "",
    val byte: Double = 0.0, val drive: DriveDelRecupero? = null
)
@Serializable data class RecuperoChat(val chat: List<ChatInRecuperoApp> = emptyList(), val byte: Double = 0.0)
@Serializable data class MessaggioChat(val ok: Boolean = true, val messaggio: String = "")
@Serializable data class RispostaSvuota(val ok: Boolean = false, val messaggio: String = "", val gettone: String? = null, val chat: Int? = null, val byte: Double? = null, val frase: String? = null)

@Serializable data class TestoAzioneChat(val etichetta: String = "", val breve: String = "", val spiega: String = "")

object GestioneChatRegole {
    const val FRASE_SVUOTA = "SVUOTA"
    private const val GIORNO_MS = 86_400_000L

    /** Le tre azioni, gli stessi testi del PC (`TESTI_AZIONI_CHAT`). */
    val TESTI = linkedMapOf(
        "chiudi" to TestoAzioneChat("Chiudi", "Ferma la chat. Resta tutto.",
            "Ferma il processo di Claude Code di questa chat. La conversazione resta sul PC e si riprende quando vuoi da «Riprendi una conversazione»."),
        "archivia" to TestoAzioneChat("Archivia", "La toglie dagli elenchi. Si ritrova.",
            "La chat sparisce dagli elenchi ma non si cancella niente. La ritrovi in «Archiviate» e la rimetti con «Ripristina». Se è aperta e ferma, prima si chiude."),
        "elimina" to TestoAzioneChat("Elimina dal PC", "Libera spazio. 30 giorni per ripensarci.",
            "Toglie da questo PC solo i file di questa chat e libera il loro spazio. Per 30 giorni restano nel recupero e si rimettono con «Ripristina». La copia sul Drive resta, se non scegli «anche dal Drive».")
    )

    val ORDINI = listOf("spazio" to "Le più grandi", "uso" to "Le meno usate")

    /** Il «?» di «anche dal Drive» in Elimina dal PC e in «Svuota il recupero adesso» (`SPIEGA_ELIMINA_DRIVE`, `SPIEGA_SVUOTA_DRIVE` del PC). */
    const val SPIEGA_ELIMINA_DRIVE = "Toglie anche la copia che questa chat ha sul Drive. Non sparisce subito: va nel recupero del Drive per 30 giorni, e torna con «Ripristina». Senza la spunta la copia sul Drive resta, e gli altri PC la vedono ancora."
    const val SPIEGA_SVUOTA_DRIVE = "Cancella per sempre anche le copie di queste chat che sono nel recupero del Drive. Senza la spunta lì restano, e si cancellano da sole alla loro scadenza."

    fun byte(n: Double): String = SpazioRegole.byte(n)

    private fun quante(n: Int) = if (n == 1) "1 chat" else "$n chat"

    fun nome(titoli: List<String>): String = if (titoli.size == 1) "«${titoli[0]}»" else "${titoli.size} chat"

    /** Le scelte che la conferma nomina: per Elimina solo quelle che si possono eliminare (scelteDaConfermare del PC, collaudo c-75). */
    fun daConfermare(azione: String, scelte: List<String>, voci: List<VoceSpazioChat>): List<String> {
        if (azione != "elimina") return scelte
        val no = voci.filter { it.nonEliminabile != null }.map { it.sessione }.toSet()
        return scelte.filter { it !in no }
    }

    fun confermaChiudi(nome: String) = Conferma("Chiudere $nome?", "Si ferma. La conversazione resta e la riprendi quando vuoi.", "Chiudi")
    /** Più di una chat: i verbi al plurale, come sul PC. */
    fun confermaArchivia(nome: String, quante: Int = 1) = Conferma("Archiviare $nome?",
        if (quante > 1) "Escono dagli elenchi, ma non si cancella niente: le ritrovi in «Archiviate»." else "Esce dagli elenchi, ma non si cancella niente: la ritrovi in «Archiviate».", "Archivia")
    fun confermaElimina(nome: String, spazio: String, ancheDalDrive: Boolean, quante: Int = 1): Conferma {
        val piu = quante > 1
        return Conferma(
            "Eliminare $nome dal PC?",
            "Libera $spazio. Per 30 giorni " + (if (piu) "restano nel recupero e le rimetti" else "resta nel recupero e la rimetti") + " con «Ripristina»." +
                when {
                    ancheDalDrive && piu -> " Anche le copie sul Drive vanno nel recupero del Drive."
                    ancheDalDrive -> " Anche la copia sul Drive va nel recupero del Drive."
                    piu -> " Le copie sul Drive restano."
                    else -> " La copia sul Drive resta."
                },
            "Elimina dal PC"
        )
    }
    fun confermaChiediSvuota(ancheDalDrive: Boolean) = Conferma(
        "Svuotare il recupero adesso?",
        "Le chat nel recupero si cancellano per sempre" + (if (ancheDalDrive) ", anche le loro copie nel recupero del Drive." else ".") + " Poi ti chiedo di scrivere $FRASE_SVUOTA.",
        "Continua"
    )
    fun fraseGiusta(scritta: String): Boolean = scritta.trim().uppercase() == FRASE_SVUOTA

    private fun ms(iso: String?): Long? = try { iso?.let { java.time.Instant.parse(it).toEpochMilli() } } catch (_: Exception) { null }

    fun quandoUsata(iso: String?, adesso: Long): String {
        val t = ms(iso) ?: return "mai usata"
        val giorni = Math.floorDiv(adesso - t, GIORNO_MS)
        return when {
            giorni <= 0 -> "usata oggi"
            giorni == 1L -> "usata ieri"
            giorni < 60 -> "usata $giorni giorni fa"
            giorni < 730 -> "usata ${giorni / 30} mesi fa"
            else -> "usata ${giorni / 365} anni fa"
        }
    }

    private fun data(iso: String): String {
        val t = ms(iso) ?: return "—"
        val d = java.time.Instant.ofEpochMilli(t).atZone(java.time.ZoneId.systemDefault())
        return "%02d/%02d".format(d.dayOfMonth, d.monthValue)
    }

    fun rigaVoce(v: VoceSpazioChat, adesso: Long): String =
        (listOf(byte(v.byte), quandoUsata(v.ultimaAttivita, adesso)) + (if (v.archiviata) listOf("archiviata") else emptyList()) + (if (v.aperta) listOf("aperta") else emptyList())).joinToString(" · ")

    fun riepilogo(v: VistaSpazioChat): String =
        "${quante(v.chat.size)} · ${byte(v.totale)} · si possono liberare ${byte(v.eliminabili)}" +
            (if (v.recupero.chat > 0) " · nel recupero ${quante(v.recupero.chat)} (${byte(v.recupero.byte)})" else "")

    /** Come `totaleSelezione` del PC: quante, quanto, quante si possono eliminare e perché no. */
    fun totale(voci: List<VoceSpazioChat>, scelte: Collection<String>): SelezioneChat {
        val sel = voci.filter { it.sessione in scelte }
        val ok = sel.filter { it.nonEliminabile == null }
        return SelezioneChat(sel.size, sel.sumOf { it.byte }, ok.size, ok.sumOf { it.byte }, sel.filter { it.nonEliminabile != null }.map { EsclusaChat(it.sessione, it.nonEliminabile!!) }, sel.filter { !it.aperta }.map { it.sessione })
    }

    /** Il motivo del PC per cui una chat scelta da sola non si elimina, o null se si può: «Elimina dal PC» spento con questo motivo. */
    fun motivoNonElimina(s: SelezioneChat?): String? = s?.escluse?.firstOrNull()?.motivo?.takeIf { it.isNotBlank() }

    /** Come `motivoNonChiudeScelta` del PC: «Chiudi» spento se lì la chat non è aperta; senza `chiuse` (PC più vecchio) resta acceso. */
    fun motivoNonChiude(s: SelezioneChat?, sessione: String, titolo: String): String? =
        if (s?.chiuse?.contains(sessione) == true) "${if (titolo.isBlank()) "Questa chat" else "«${titolo.trim()}»"} non è aperta: è già chiusa." else null

    fun riepilogoSelezione(s: SelezioneChat): String {
        if (s.chat == 0) return "Nessuna chat scelta."
        val q = if (s.chat == 1) "1 chat scelta" else "${s.chat} chat scelte"
        val no = when (s.escluse.size) { 0 -> ""; 1 -> " · 1 non si può eliminare"; else -> " · ${s.escluse.size} non si possono eliminare" }
        return "$q · ${byte(s.byte)}$no · eliminandole liberi ${byte(s.byteEliminabili)}"
    }

    fun ordina(voci: List<VoceSpazioChat>, ordine: String): List<VoceSpazioChat> =
        if (ordine == "spazio") voci.sortedWith(compareByDescending<VoceSpazioChat> { it.byte }.thenBy { it.ultimaAttivita ?: "" }.thenBy { it.sessione })
        else voci.sortedWith(compareBy<VoceSpazioChat> { it.ultimaAttivita ?: "" }.thenByDescending { it.byte }.thenBy { it.sessione })

    fun rigaRecupero(c: ChatInRecuperoApp, adesso: Long): String {
        val scade = ms(c.scadeIl) ?: adesso
        val resto = scade - adesso
        val giorni = if (resto <= 0) 0L else (resto + GIORNO_MS - 1) / GIORNO_MS
        return "${byte(c.byte)} · eliminata il ${data(c.quando)} · " + (when (giorni) { 0L -> "si svuota oggi"; 1L -> "si svuota domani"; else -> "si svuota fra $giorni giorni" }) +
            (if (c.drive != null) " · anche dal Drive" else "")
    }

    fun rigaArchiviata(a: ChatArchiviataApp): String = "archiviata il ${data(a.il)}"

    /** I rifiuti: il motivo del PC, che nomina già la chat. */
    fun rifiuti(e: EsitoAzioniChat): List<String> = e.esiti.filter { !it.ok }.map { it.motivo ?: "${it.sessione.take(8)}: non si è potuta toccare." }
}

/**
 * Le tre azioni di **una** chat, con il loro «?» e la conferma. Si apre dal
 * menu della chat aperta e dall'elenco «Riprendi una conversazione».
 * `onFatto` riceve quante chat il PC ha davvero toccato (0 = rifiutata).
 */
@Composable
fun AzioniChatDialogo(api: Api, sessione: String, titolo: String, nomePc: String?, onFatto: (Int) -> Unit, onChiudi: () -> Unit) {
    val scope = rememberCoroutineScope()
    var conferma by remember { mutableStateOf<String?>(null) }
    var spazio by remember { mutableStateOf<String?>(null) }
    // Elimina si conferma solo dopo aver saputo quanto libera (revisione ECC): finché il PC misura, il tasto aspetta.
    var misura by remember { mutableStateOf(false) }
    var drive by remember { mutableStateOf(false) }
    var inCorso by remember { mutableStateOf(false) }
    var esito by remember { mutableStateOf<Pair<String, List<String>>?>(null) }
    var fatte by remember { mutableIntStateOf(0) }
    // Aperto il dialogo si chiede subito al PC quanto libera e se si può eliminare: una chat al lavoro,
    // in attesa, guidata da un autopilota attivo o di un altro PC mostra «Elimina dal PC» spento col motivo.
    var motivoNo by remember { mutableStateOf<String?>(null) }
    var motivoChiudi by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(sessione) {
        misura = true
        try {
            val sel = api.spazioChat(listOf(sessione)).selezione
            spazio = GestioneChatRegole.byte(sel?.byte ?: 0.0)
            motivoNo = GestioneChatRegole.motivoNonElimina(sel)
            motivoChiudi = GestioneChatRegole.motivoNonChiude(sel, sessione, titolo)
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { }
        misura = false
    }
    val nome = GestioneChatRegole.nome(listOf(titolo))
    fun fai(azione: String) {
        inCorso = true
        scope.launch {
            val e = tentaGestione("${GestioneChatRegole.TESTI[azione]?.etichetta?.lowercase() ?: azione} la chat", nomePc, FunzionePc.GESTIONE_CHAT) { api.azioneChat(azione, listOf(sessione), drive) }
            inCorso = false
            conferma = null
            if (e != null) { fatte = e.fatte; esito = e.messaggio to GestioneChatRegole.rifiuti(e); onFatto(e.fatte) }
        }
    }
    val r = esito
    if (r != null) {
        AlertDialog(onDismissRequest = onChiudi, title = { Text(if (fatte == 0) "Non fatto" else "Fatto") },
            text = { Column { Text(r.first, fontSize = 14.sp); RifiutiChat(r.second) } },
            confirmButton = { TextButton(onClick = onChiudi) { Text("Va bene") } })
        return
    }
    val c = conferma
    if (c != null) {
        val testo = when (c) {
            "chiudi" -> GestioneChatRegole.confermaChiudi(nome)
            "archivia" -> GestioneChatRegole.confermaArchivia(nome)
            else -> GestioneChatRegole.confermaElimina(nome, spazio ?: "lo spazio di questa chat", drive)
        }
        AlertDialog(
            onDismissRequest = { if (!inCorso) conferma = null },
            title = { Text(testo.titolo) },
            text = {
                Column {
                    // Toccato prima che arrivasse il motivo del PC: lo si dice qui, e il tasto resta spento.
                    if (c == "elimina" && motivoNo != null) Text(motivoNo ?: "", color = Banco.ambra, fontSize = 13.sp)
                    else Text(testo.testo, fontSize = 14.sp)
                    if (c == "elimina" && motivoNo == null) Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = drive, onCheckedChange = { drive = it })
                        Text("anche dal Drive", fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Aiuto(GestioneChatRegole.SPIEGA_ELIMINA_DRIVE, di = "anche dal Drive")
                    }
                }
            },
            confirmButton = { TextButton(enabled = !inCorso && !(c == "elimina" && (misura || motivoNo != null)), onClick = { fai(c) }) { Text(if (inCorso) "Un momento…" else if (c == "elimina" && misura) "Misuro…" else testo.azione, color = if (c == "elimina") Banco.rosso else Banco.accento) } },
            dismissButton = { TextButton(enabled = !inCorso, onClick = { conferma = null }) { Text("Annulla") } }
        )
        return
    }
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text(titolo, maxLines = 2) },
        text = {
            Column {
                for ((id, t) in GestioneChatRegole.TESTI) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        val no = when (id) { "elimina" -> motivoNo; "chiudi" -> motivoChiudi; else -> null }
                        val spento = no != null
                        // «anche dal Drive» riparte senza spunta a ogni conferma, come sul PC e sulla pagina.
                        TextButton(enabled = !spento, onClick = { drive = false; conferma = id }) { Text(t.etichetta, color = if (spento) Banco.testoQuieto else if (id == "elimina") Banco.rosso else Banco.accento) }
                        if (spento) Text(no ?: "", color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        else Text(t.breve, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Aiuto(t.spiega, di = t.etichetta)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
}

@Composable
private fun RifiutiChat(righe: List<String>) {
    if (righe.isEmpty()) return
    Spacer(Modifier.height(6.dp))
    for (r in righe) Text("• $r", color = Banco.ambra, fontSize = 12.sp)
}

/**
 * «Spazio delle chat» di un PC: le chat dalla più grande (o dalla meno usata),
 * la scelta di più chat con il totale, Archivia ed Elimina dal PC; le
 * Archiviate e il Recupero (30 giorni) con Ripristina e «Svuota adesso».
 */
@Composable
fun SpazioDelleChat(api: Api, nomePc: String?, onChiudi: () -> Unit) {
    val scope = rememberCoroutineScope()
    var scheda by remember { mutableStateOf("spazio") }
    var vista by remember { mutableStateOf<VistaSpazioChat?>(null) }
    var archiviate by remember { mutableStateOf<List<ChatArchiviataApp>?>(null) }
    var recupero by remember { mutableStateOf<RecuperoChat?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var nota by remember { mutableStateOf<Pair<String, List<String>>?>(null) }
    var ordine by remember { mutableStateOf("spazio") }
    var scelte by remember { mutableStateOf<List<String>>(emptyList()) }
    var conferma by remember { mutableStateOf<String?>(null) }
    var drive by remember { mutableStateOf(false) }
    var svuota by remember { mutableIntStateOf(0) }
    var svuotaDrive by remember { mutableStateOf(false) }
    var gettone by remember { mutableStateOf<RispostaSvuota?>(null) }
    var frase by remember { mutableStateOf("") }
    var inCorso by remember { mutableStateOf(false) }
    var giro by remember { mutableIntStateOf(0) }
    LaunchedEffect(giro) {
        errore = null
        // Ogni elenco per conto suo (revisione ECC): se uno non arriva, gli altri si vedono lo stesso e quello
        // non resta su «Leggo…» per sempre; «Riprova» rilegge tutto.
        suspend fun <T> leggi(cosa: suspend () -> T): T? = try { cosa() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Api.Errore) {
            errore = if (FunzioniPc.mancaSulPc(e)) FunzioniPc.testoMancante(FunzionePc.GESTIONE_CHAT, nomePc) else spiegaGestione(e, "leggere le chat", nomePc, FunzionePc.GESTIONE_CHAT)
            null
        } catch (e: Exception) { errore = "Non riesco a leggere le chat: ${e.message ?: "il computer non risponde"}"; null }
        leggi { api.spazioChat() }?.let { v -> vista = v; val ci = v.chat.map { it.sessione }.toSet(); scelte = scelte.filter { it in ci } }
        archiviate = leggi { api.archiviateChat().archiviate } ?: archiviate ?: emptyList()
        recupero = leggi { api.recuperoChat() } ?: recupero ?: RecuperoChat()
    }
    fun esegui(cosa: String, azione: suspend () -> Pair<String, List<String>>?) {
        inCorso = true
        scope.launch {
            nota = tentaGestione(cosa, nomePc, FunzionePc.GESTIONE_CHAT) { azione() }
            inCorso = false
            giro += 1
        }
    }
    val adesso = System.currentTimeMillis()
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { TitoloDialogo("Spazio delle chat", "Le chat di questo PC con lo spazio che occupano. Scegline una o più e tocca Archivia (escono dagli elenchi, non si cancella niente) o Elimina dal PC (liberi spazio; per 30 giorni restano nel recupero). Le chat al lavoro, che aspettano una tua risposta, guidate da un autopilota attivo o che vivono su un altro PC non si toccano: lo dice la riga sotto il nome.") },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = scheda == "spazio", onClick = { scheda = "spazio"; nota = null }, label = { Text("Spazio", fontSize = 12.sp) })
                    FilterChip(selected = scheda == "archiviate", onClick = { scheda = "archiviate"; nota = null }, label = { Text("Archiviate" + (archiviate?.size?.takeIf { it > 0 }?.let { " ($it)" } ?: ""), fontSize = 12.sp) })
                    FilterChip(selected = scheda == "recupero", onClick = { scheda = "recupero"; nota = null }, label = { Text("Recupero" + (recupero?.chat?.size?.takeIf { it > 0 }?.let { " ($it)" } ?: ""), fontSize = 12.sp) })
                }
                errore?.let { Row(verticalAlignment = Alignment.CenterVertically) { Text(it, color = Banco.rosso, fontSize = 12.sp, modifier = Modifier.weight(1f)); TextButton(onClick = { giro += 1 }) { Text("Riprova") } } }
                nota?.let { (m, rif) -> Text(m, color = Banco.testo, fontSize = 13.sp); RifiutiChat(rif) }
                Spacer(Modifier.height(6.dp))
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                    when (scheda) {
                        "spazio" -> {
                            val v = vista
                            if (v == null) Text(if (errore == null) "Misuro le chat…" else "", color = Banco.testoQuieto)
                            else {
                                val voci = GestioneChatRegole.ordina(v.chat, ordine)
                                val sel = GestioneChatRegole.totale(voci, scelte)
                                Text(GestioneChatRegole.riepilogo(v), color = Banco.testoQuieto, fontSize = 12.sp)
                                Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                                    for ((id, n) in GestioneChatRegole.ORDINI) FilterChip(selected = ordine == id, onClick = { ordine = id }, label = { Text(n, fontSize = 12.sp) }, modifier = Modifier.padding(end = 6.dp))
                                    TextButton(onClick = { scelte = if (scelte.isNotEmpty()) emptyList() else voci.filter { it.nonEliminabile == null }.map { it.sessione } }) { Text(if (scelte.isNotEmpty()) "Nessuna" else "Scegli tutte") }
                                }
                                Text(GestioneChatRegole.riepilogoSelezione(sel), color = Banco.testo, fontSize = 12.sp)
                                Row {
                                    TextButton(enabled = scelte.isNotEmpty() && !inCorso, onClick = { conferma = "archivia" }) { Text("Archivia") }
                                    TextButton(enabled = sel.eliminabili > 0 && !inCorso, onClick = { drive = false; conferma = "elimina" }) { Text("Elimina dal PC", color = Banco.rosso) }
                                }
                                if (voci.isEmpty()) Text("Nessuna chat su questo PC.", color = Banco.testoQuieto)
                                for (x in voci) {
                                    Row(Modifier.fillMaxWidth().tocco { scelte = if (x.sessione in scelte) scelte - x.sessione else scelte + x.sessione }.padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
                                        Checkbox(checked = x.sessione in scelte, onCheckedChange = { scelte = if (it) scelte + x.sessione else scelte - x.sessione })
                                        Column(Modifier.weight(1f)) {
                                            Text(x.titolo, color = Banco.testo, fontWeight = FontWeight.Medium, maxLines = 2)
                                            Text(GestioneChatRegole.rigaVoce(x, adesso), color = Banco.testoQuieto, fontSize = 12.sp)
                                            x.nonEliminabile?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
                                        }
                                    }
                                    HorizontalDivider(color = Banco.incisione)
                                }
                            }
                        }
                        "archiviate" -> {
                            val l = archiviate
                            when {
                                l == null -> Text("Leggo…", color = Banco.testoQuieto)
                                l.isEmpty() -> Text("Nessuna chat archiviata.", color = Banco.testoQuieto)
                                else -> for (a in l) {
                                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text(a.titolo ?: a.sessione.take(8), color = Banco.testo, maxLines = 2)
                                            Text(GestioneChatRegole.rigaArchiviata(a), color = Banco.testoQuieto, fontSize = 12.sp)
                                        }
                                        TextButton(enabled = !inCorso, onClick = { esegui("rimettere la chat") { api.azioneChat("ripristina", listOf(a.sessione)).let { it.messaggio to GestioneChatRegole.rifiuti(it) } } }) { Text("Ripristina") }
                                    }
                                    HorizontalDivider(color = Banco.incisione)
                                }
                            }
                        }
                        else -> {
                            val r = recupero
                            if (r == null) Text("Leggo…", color = Banco.testoQuieto)
                            else {
                                RigaConAiuto(
                                    if (r.chat.isEmpty()) "Il recupero è vuoto." else "${if (r.chat.size == 1) "1 chat" else "${r.chat.size} chat"} · ${GestioneChatRegole.byte(r.byte)} · si svuota da solo dopo 30 giorni",
                                    "Le chat eliminate dal PC restano qui 30 giorni, poi si cancellano da sole. «Ripristina» rimette la chat al suo posto con il suo nome. Lo spazio sul disco si libera davvero quando il recupero si svuota: da solo, o con «Svuota il recupero adesso», che chiede una conferma forte.",
                                    di = "il recupero"
                                )
                                if (r.chat.isNotEmpty()) TextButton(enabled = !inCorso, onClick = { svuotaDrive = false; svuota = 1 }) { Text("Svuota il recupero adesso", color = Banco.rosso) }
                                for (c in r.chat) {
                                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text(c.titolo, color = Banco.testo, maxLines = 2)
                                            Text(GestioneChatRegole.rigaRecupero(c, adesso), color = Banco.testoQuieto, fontSize = 12.sp)
                                        }
                                        TextButton(enabled = !inCorso, onClick = { esegui("rimettere la chat") { api.ripristinaDalRecupero(c.id).messaggio to emptyList() } }) { Text("Ripristina") }
                                    }
                                    HorizontalDivider(color = Banco.incisione)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } }
    )

    conferma?.let { az ->
        val voci = vista?.chat ?: emptyList()
        val nome = GestioneChatRegole.nome(GestioneChatRegole.daConfermare(az, scelte, voci).map { s -> voci.firstOrNull { it.sessione == s }?.titolo ?: s.take(8) })
        val tot = GestioneChatRegole.totale(voci, scelte)
        val c = if (az == "archivia") GestioneChatRegole.confermaArchivia(nome, scelte.size)
            else GestioneChatRegole.confermaElimina(nome, GestioneChatRegole.byte(tot.byteEliminabili), drive, tot.eliminabili)
        AlertDialog(
            onDismissRequest = { conferma = null },
            title = { Text(c.titolo) },
            text = {
                Column {
                    Text(c.testo, fontSize = 14.sp)
                    if (az == "elimina") Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = drive, onCheckedChange = { drive = it }); Text("anche dal Drive", fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Aiuto(GestioneChatRegole.SPIEGA_ELIMINA_DRIVE, di = "anche dal Drive")
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val quali = scelte
                    conferma = null
                    esegui(if (az == "archivia") "archiviare le chat" else "eliminare le chat") {
                        api.azioneChat(az, quali, az == "elimina" && drive).let { scelte = emptyList(); it.messaggio to GestioneChatRegole.rifiuti(it) }
                    }
                }) { Text(c.azione, color = if (az == "elimina") Banco.rosso else Banco.accento) }
            },
            dismissButton = { TextButton(onClick = { conferma = null }) { Text("Annulla") } }
        )
    }

    if (svuota == 1) {
        val c = GestioneChatRegole.confermaChiediSvuota(svuotaDrive)
        AlertDialog(
            onDismissRequest = { svuota = 0 },
            title = { Text(c.titolo) },
            text = {
                Column {
                    Text(c.testo, fontSize = 14.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = svuotaDrive, onCheckedChange = { svuotaDrive = it }); Text("anche dal Drive", fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Aiuto(GestioneChatRegole.SPIEGA_SVUOTA_DRIVE, di = "anche dal Drive")
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = !inCorso, onClick = {
                    // Un tocco solo: due richieste darebbero due gettoni, e il secondo passo userebbe quello vecchio.
                    inCorso = true
                    scope.launch {
                        val r = tentaGestione("chiedere la conferma", nomePc, FunzionePc.GESTIONE_CHAT) { api.chiediSvuotaRecupero(svuotaDrive) }
                        inCorso = false
                        // Annullato mentre il PC rispondeva: «Scrivi SVUOTA» non deve comparire lo stesso.
                        if (svuota != 1) return@launch
                        if (r != null && r.ok && r.gettone != null) { gettone = r; frase = ""; svuota = 2 } else { svuota = 0; if (r != null) nota = r.messaggio to emptyList() }
                    }
                }) { Text(c.azione, color = Banco.rosso) }
            },
            dismissButton = { TextButton(onClick = { svuota = 0 }) { Text("Annulla") } }
        )
    }
    if (svuota == 2) {
        val g = gettone
        AlertDialog(
            onDismissRequest = { svuota = 0 },
            title = { Text("Scrivi ${GestioneChatRegole.FRASE_SVUOTA} per confermare") },
            text = {
                Column {
                    Text(g?.messaggio ?: "", fontSize = 14.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(value = frase, onValueChange = { frase = it.take(20) }, singleLine = true, placeholder = { Text(GestioneChatRegole.FRASE_SVUOTA) }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton(enabled = GestioneChatRegole.fraseGiusta(frase) && g?.gettone != null, onClick = {
                    val t = g?.gettone ?: return@TextButton
                    svuota = 0
                    esegui("svuotare il recupero") { api.svuotaRecupero(svuotaDrive, t, frase).messaggio to emptyList() }
                }) { Text("Svuota per sempre", color = Banco.rosso) }
            },
            dismissButton = { TextButton(onClick = { svuota = 0 }) { Text("Annulla") } }
        )
    }
    Spacer(Modifier.width(0.dp))
}
