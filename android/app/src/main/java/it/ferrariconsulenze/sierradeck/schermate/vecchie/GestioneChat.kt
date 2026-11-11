package it.ferrariconsulenze.sierradeck.schermate.vecchie

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
import it.ferrariconsulenze.sierradeck.nucleo.Conferma
import it.ferrariconsulenze.sierradeck.nucleo.FunzionePc
import it.ferrariconsulenze.sierradeck.nucleo.SpazioRegole
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco

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
@Serializable data class DriveDelRecupero(val pulizia: String = "", val file: Int = 0, val byte: Double = 0.0)
@Serializable data class ChatInRecuperoApp(
    val id: String = "", val sessione: String = "", val titolo: String = "", val quando: String = "", val scadeIl: String = "",
    val byte: Double = 0.0, val drive: DriveDelRecupero? = null
)
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
