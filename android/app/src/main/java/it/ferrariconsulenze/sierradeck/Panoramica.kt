package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Alignment
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable

/**
 * La Panoramica del workspace dell'autopilota (PC 0.77.0, Panoramica 2 dalla
 * 0.78.0). Nicholas sulla 0.77.0: «puoi fare meglio». Le stesse regole di
 * `src/shared/panoramica.ts`: in alto la situazione (stato coerente con i
 * criteri, che si aprono al tocco), «Adesso» solo chi lavora o aspetta te, il
 * Piano per fase con lo specialista, le altre chat del workspace (anche
 * adottate), «Finite: N ▸». Sotto, la conversazione; gli eventi tecnici in
 * «Cosa è successo ▸». Situazione e piano arrivano calcolati dal PC.
 */
@Serializable
data class SchedaPanoramica(
    val id: String = "",
    val titolo: String = "",
    /** «sviluppo», «interfaccia», «collaudo», «revisione», «rilascio»; assente per una chat normale. */
    val ruolo: String? = null,
    /** «chiede», «lavora», «ferma», «finita». */
    val stato: String = "ferma",
    val nataIl: Long = 0,
    val ultimaAzione: String = "",
    val righe: List<String> = emptyList(),
    /** Da quando è in quello stato (ms), per «da 3 min». */
    val dal: Long? = null,
    /** La sessione, per aprire la chat a tutto schermo. */
    val sessione: String? = null,
    /** La domanda breve di questa chat, se c'è (regola H). */
    val domanda: Conversazione? = null,
    /** PC 0.78.0: è dell'autopilota (specialista o la sua chat): ferma va fra le finite. */
    val specialista: Boolean = false,
    /** PC 0.78.0: Nicholas l'ha segnata «solo mia». */
    val soloMia: Boolean = false
)

@Serializable
data class RiassuntoPanoramica(
    val obiettivo: String = "",
    val stato: StatoParola = StatoParola(),
    val criteri: CriteriPanoramica = CriteriPanoramica()
)

@Serializable
data class StatoParola(val parola: String = "", val colore: String = "quieto")

@Serializable
data class CriteriPanoramica(val fatti: Int = 0, val totali: Int = 0, val testo: String = "—")

/** PC 0.78.0: lo stato coerente con i criteri («finito» solo se lo sono tutti). */
@Serializable
data class StatoSituazione(val id: String = "", val parola: String = "", val colore: String = "quieto", val simbolo: String = "", val ragione: String? = null)

/** Un criterio: `esito` è «si», «no» o «mai» (mai controllato). */
@Serializable
data class CriterioVista(val descrizione: String = "", val esito: String = "mai", val quando: String? = null, val prova: String? = null)

@Serializable
data class CriteriSituazione(val fatti: Int = 0, val totali: Int = 0, val testo: String = "—", val elenco: List<CriterioVista> = emptyList())

@Serializable
data class Situazione(val obiettivo: String = "", val stato: StatoSituazione = StatoSituazione(), val criteri: CriteriSituazione = CriteriSituazione())

/** Un compito del Piano; `chat` è la chat aperta da toccare, se c'è. */
@Serializable
data class CompitoPiano(
    val id: String = "",
    val testo: String = "",
    val fase: String = "da-fare",
    val ruolo: String? = null,
    val autore: String? = null,
    val nota: String? = null,
    val giri: Int? = null,
    val chat: String? = null
)

@Serializable
data class ColonnaPiano(val fase: String = "", val nome: String = "", val compiti: List<CompitoPiano> = emptyList())

/** PC 0.79.0: una riga del riassunto accanto alla conversazione, già composta dal PC. */
@Serializable
data class RigaAlLavoro(
    val id: String = "",
    /** «Sviluppo», «Revisione»… o «Chat». */
    val chi: String = "",
    val ruolo: String? = null,
    /** Cosa fa adesso, in parole semplici (dal registro dell'autopilota). */
    val cosa: String = "",
    /** «da 3 min», «su PORTATILE». */
    val quanto: String = "",
    val aspettaTe: Boolean = false
)

@Serializable
data class Panoramica(
    val workspace: String = "",
    /** PC 0.79.0: chi lavora adesso, una riga per chat; assente da un PC più vecchio. */
    val alLavoro: List<RigaAlLavoro>? = null,
    val autopilota: String? = null,
    val riassunto: RiassuntoPanoramica? = null,
    val schede: List<SchedaPanoramica> = emptyList(),
    /** PC 0.78.0; assenti da un PC della 0.77.0. */
    val situazione: Situazione? = null,
    val piano: List<ColonnaPiano> = emptyList()
)

object RegolePanoramica {
    val GRUPPI = listOf("chiede", "lavora", "ferma", "finita")
    val NOME_GRUPPO = mapOf("chiede" to "Aspettano te", "lavora" to "Al lavoro", "ferma" to "Ferme", "finita" to "Finite")
    val SIMBOLO = mapOf("chiede" to "◆", "lavora" to "●", "ferma" to "■", "finita" to "✓")
    val NOME_RUOLO = mapOf("sviluppo" to "Sviluppo", "interfaccia" to "Interfaccia", "collaudo" to "Collaudo", "revisione" to "Revisione", "rilascio" to "Rilascio")
    private val RUOLI_ORDINE = listOf("sviluppo", "interfaccia", "collaudo", "revisione", "rilascio")
    const val QUIETE_GRUPPO_MS = 8000L
    const val LARGHEZZA_LINGUETTA = 150
    const val LARGHEZZA_FISSA = 120
    const val LINGUETTE_MIN = 4
    const val LINGUETTE_MAX = 10

    private fun postoRuolo(r: String?): Int = if (r == null || r !in RUOLI_ORDINE) RUOLI_ORDINE.size else RUOLI_ORDINE.indexOf(r)

    /** L'ordine fisso: per ruolo, poi per nascita, poi per id. Non dipende dallo stato. */
    val fisso: Comparator<SchedaPanoramica> = compareBy<SchedaPanoramica>({ postoRuolo(it.ruolo) }, { it.nataIl }, { it.id })

    /** Le schede in gruppi, nell'ordine dei gruppi; dentro ogni gruppo l'ordine fisso. Niente gruppi vuoti. */
    fun ordinaSchede(schede: List<SchedaPanoramica>): List<Pair<String, List<SchedaPanoramica>>> =
        GRUPPI.mapNotNull { g ->
            val dentro = schede.filter { it.stato == g }.sortedWith(fisso)
            if (dentro.isEmpty()) null else g to dentro
        }

    /**
     * PC 0.78.0: in «Adesso» solo chi aspetta te e chi lavora (prima chi
     * aspetta te); le altre sono le chat del workspace (non dell'autopilota) e
     * le finite (dell'autopilota), in ordine fisso.
     */
    data class Sezioni(val adesso: List<SchedaPanoramica>, val chat: List<SchedaPanoramica>, val finite: List<SchedaPanoramica>)

    fun sezioni(schede: List<SchedaPanoramica>): Sezioni {
        val g = ordinaSchede(schede).toMap()
        val adesso = (g["chiede"] ?: emptyList()) + (g["lavora"] ?: emptyList())
        val ferme = (g["ferma"] ?: emptyList()) + (g["finita"] ?: emptyList())
        return Sezioni(adesso, ferme.filter { !it.specialista }, ferme.filter { it.specialista })
    }

    /** In «aspetta te» subito; negli altri gruppi solo dopo 8 secondi nello stato nuovo. */
    fun gruppoStabile(adesso: String, prima: String?, statoDal: Long, ora: Long): String =
        if (prima == null || adesso == prima || adesso == "chiede") adesso
        else if (ora - statoDal >= QUIETE_GRUPPO_MS) adesso else prima

    /** Le linguette visibili e quelle in «Altre»: chi chiede, chi lavora e la chat aperta sempre visibili. */
    fun linguetteVisibili(larghezza: Int, chat: List<SchedaPanoramica>, aperta: String? = null): Pair<List<SchedaPanoramica>, List<SchedaPanoramica>> {
        val inOrdine = chat.sortedWith(fisso)
        val inTutto = ((larghezza - LARGHEZZA_FISSA) / LARGHEZZA_LINGUETTA).coerceIn(LINGUETTE_MIN, LINGUETTE_MAX)
        val posti = inTutto - 1
        if (inOrdine.size <= posti) return inOrdine to emptyList()
        // PC 0.78.0: sempre in vista, ma non oltre il tetto (26 chat che chiedevano = 26 linguette di un carattere).
        val priorita = { c: SchedaPanoramica -> if (c.id == aperta) 0 else if (c.stato == "chiede") 1 else 2 }
        val scelte = inOrdine.filter { it.stato == "chiede" || it.stato == "lavora" || it.id == aperta }
            .sortedWith(compareBy<SchedaPanoramica> { priorita(it) }.then(fisso))
            .take(LINGUETTE_MAX - 1)
            .map { it.id }.toMutableSet()
        var liberi = posti - scelte.size
        for (c in inOrdine) {
            if (liberi <= 0) break
            if (scelte.add(c.id)) liberi -= 1
        }
        return inOrdine.filter { it.id in scelte } to inOrdine.filter { it.id !in scelte }
    }

    /**
     * PC 0.78.0: a sinistra la conversazione (tu e lui), gli eventi (note) a parte, dal più recente.
     * PC 0.79.0: le righe corte dei traguardi («Revisione: ha approvato …, unito.») restano nella conversazione.
     */
    fun separaConversazione(battute: List<Battuta>): Pair<List<Battuta>, List<Battuta>> {
        fun inConversazione(b: Battuta) = b.da != "nota" || b.tono == "traguardo"
        return battute.filter { inConversazione(it) } to battute.filter { !inConversazione(it) }.reversed()
    }

    /** Il titolo del riassunto: «Al lavoro · 3 · ◆ 1 aspetta te». */
    fun titoloAlLavoro(righe: List<RigaAlLavoro>): String {
        val aspettano = righe.count { it.aspettaTe }
        return "Al lavoro · ${righe.size}" + when (aspettano) { 0 -> ""; 1 -> " · ◆ 1 aspetta te"; else -> " · ◆ $aspettano aspettano te" }
    }

    /** La seconda riga di una riga del riassunto: «aspetta te · da 3 min». */
    fun sottoAlLavoro(r: RigaAlLavoro): String =
        listOfNotNull(if (r.aspettaTe) "aspetta te" else null, r.quanto.takeIf { it.isNotBlank() }).joinToString(" · ")

    private val ANSI = Regex("\u001B\\[[0-?]*[ -/]*[@-~]|\u001B\\][^\u0007]*(\u0007|\u001B\\\\)|\u001B[@-Z\\\\-_]|[\u0000-\u0008\u000B-\u001F\u007F]")
    private val RUMORE = listOf(
        Regex("^[\\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║╔╗╚╝▔▁▏▕·•…_-]*$"),
        Regex("^\\s*[│|]?\\s*❯\\s*$"),
        Regex("^\\s*[│|]?\\s*❯\\s*Try \""),
        Regex("\\? for shortcuts"),
        Regex("⏵⏵|bypass permissions|shift\\+tab to cycle", RegexOption.IGNORE_CASE),
        Regex("^\\s*◐.*/effort"),
        Regex("Your login expires", RegexOption.IGNORE_CASE),
        Regex("Transcript saving is off", RegexOption.IGNORE_CASE),
        // La riga di stato di Claude Code (PC 0.77.0 e 0.78.0).
        Regex("contesto \\d+%|context \\d+%|\\b5 ore \\d+%|settimana \\d+%|week \\d+%", RegexOption.IGNORE_CASE),
        // La testata di Claude Code (PC 0.78.0): logo, versione, piano.
        Regex("[▐▛▜▌▝▘]{2}"),
        Regex("Claude Code v\\d"),
        Regex("^\\s*… \\+\\d+ lines?\\b"),
        Regex("^\\s*[─━═]{4,}.*[─━═]{2,}\\s*$"),
        Regex("· Claude (Max|Pro|Team|Enterprise)\\b")
    )
    /** Pezzi di codici colore rimasti senza ESC: «;2;153;153m». */
    private val ANSI_SPEZZATO = Regex(";?(?:\\d{1,3};)+\\d{1,3}m")
    private val TRATTI = Regex("[─━═╌╍┄┅┈┉]")

    /** Una riga fatta per lo più di tratti è una cornice, anche con un titolo dentro (PC 0.78.0). */
    private fun eCornice(r: String): Boolean {
        val piena = r.filterNot { it.isWhitespace() }
        return piena.isNotEmpty() && TRATTI.findAll(piena).count().toDouble() / piena.length >= 0.6
    }

    /** Le ultime righe dal vivo, pulite. Sul telefono 3 in «Adesso» (revisione UI/UX della 0.78.0). */
    fun righeDalVivo(righe: List<String>, quante: Int = 2): List<String> {
        val pulite = righe.flatMap { it.split(Regex("\\r?\\n")) }
            .map { it.replace(ANSI, "").replace(ANSI_SPEZZATO, "").trimEnd() }
            .map { it.replace(Regex("^\\s*[│┃║]\\s?"), "").replace(Regex("\\s*[│┃║]\\s*$"), "") }
            .filter { it.isNotBlank() && RUMORE.none { x -> x.containsMatchIn(it) } && !eCornice(it) }
        val senzaDoppi = pulite.filterIndexed { i, r -> i == 0 || r.trim() != pulite[i - 1].trim() }
        return senzaDoppi.takeLast(quante).map { if (it.length > 160) it.take(159) + "…" else it }
    }

    /** «adesso», «da 3 min», «da 2 h». */
    fun daQuanto(dal: Long?, ora: Long): String {
        if (dal == null) return ""
        val s = ((ora - dal) / 1000).coerceAtLeast(0)
        if (s < 60) return "adesso"
        val m = Math.round(s / 60.0)
        if (m < 60) return "da $m min"
        val h = Math.round(m / 60.0)
        return if (h < 48) "da $h h" else "da ${Math.round(h / 24.0)} giorni"
    }
}

/** L'ora locale di un istante ISO, «12:19»; vuota se non si legge. */
fun oraLocale(iso: String?): String = try {
    if (iso == null) "" else {
        // «…Z» o con l'offset («+02:00»): tutti e due nell'ora del telefono.
        val istante = try { java.time.Instant.parse(iso) } catch (_: Exception) { java.time.OffsetDateTime.parse(iso).toInstant() }
        istante.atZone(java.time.ZoneId.systemDefault()).toLocalTime().toString().take(5)
    }
} catch (_: Exception) { "" }

private fun coloreParola(c: String): Color = when (c) { "verde" -> Banco.verde; "ambra" -> Banco.ambra; "rosso" -> Banco.rosso; else -> Banco.testoQuieto }

/** Una riga che si apre e si chiude, alta 48 dp (revisione UI/UX). */
@Composable
private fun RigaApri(testo: String, aperta: Boolean, onClick: () -> Unit) {
    Text(
        (if (aperta) "▾ " else "▸ ") + testo,
        color = Banco.testo,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { onClick() }.padding(horizontal = 8.dp, vertical = 14.dp)
    )
}

@Composable
private fun SchedaTel(s: SchedaPanoramica, quante: Int, onApri: (String) -> Unit) {
    val apribile = !s.id.startsWith("fine-")
    val colore = when (s.stato) { "chiede" -> Banco.ambra; "lavora" -> Banco.verde; else -> Banco.testoQuieto }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .heightIn(min = 48.dp)
            .border(BorderStroke(1.dp, if (s.stato == "chiede") Banco.ambra else Banco.incisione), RoundedCornerShape(8.dp))
            .let { if (apribile) it.clickable { onApri(s.id) } else it }
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Text(
            (RegolePanoramica.SIMBOLO[s.stato] ?: "") + "  " + (s.ruolo?.let { RegolePanoramica.NOME_RUOLO[it] ?: it } ?: "Chat") + " · " + s.titolo.replace(Regex("^[^·]+ · "), "") + (if (s.soloMia) " · solo tua" else ""),
            color = colore, maxLines = 1
        )
        if (quante > 0) {
            val righe = RegolePanoramica.righeDalVivo(s.righe, quante)
            if (righe.isEmpty()) Text("in attesa di output…", color = Banco.testoQuieto, fontSize = 11.sp)
            for (riga in righe) Text(riga, color = Banco.testoQuieto, maxLines = 1, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
        }
        val azione = s.domanda?.scheda?.domanda?.let { "Ti chiede: $it" } ?: s.ultimaAzione
        if (azione.isNotBlank()) Text(azione, color = Banco.testo, maxLines = 1, fontSize = 13.sp)
    }
}

/** La Panoramica sul telefono: Situazione, Adesso, Piano, Chat, Finite (PC 0.78.0); la lista di prima con un PC della 0.77.0. */
@Composable
fun PanoramicaVista(p: Panoramica, onApri: (String) -> Unit) {
    var aperte by remember { mutableStateOf(setOf("in-corso", "in-revisione")) }
    val apri = { k: String -> aperte = if (k in aperte) aperte - k else aperte + k }
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        val st = p.situazione
        if (st == null) {
            // Un PC della 0.77.0.
            p.riassunto?.let { r ->
                Text(r.obiettivo, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 2)
                Text("${r.stato.parola} · criteri ${r.criteri.testo}", color = coloreParola(r.stato.colore), fontSize = 12.sp)
            }
            Serigrafia("Panoramica")
            val ordinate = RegolePanoramica.ordinaSchede(p.schede).flatMap { it.second }
            for (s in ordinate) SchedaTel(s, 2, onApri)
            if (ordinate.isEmpty()) Text("Nessuna chat: l’autopilota le apre quando serve.", color = Banco.testoQuieto)
            return@Column
        }
        // ─── Situazione ───
        Text(st.obiettivo, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 2)
        Text(
            "${st.stato.simbolo} ${st.stato.parola}" + (st.stato.ragione?.let { " · $it" } ?: ""),
            color = coloreParola(st.stato.colore), fontSize = 12.sp
        )
        if (st.criteri.totali > 0) {
            RigaApri("Criteri ${st.criteri.testo}", "criteri" in aperte) { apri("criteri") }
            if ("criteri" in aperte) for (c in st.criteri.elenco) {
                val segno = when (c.esito) { "si" -> "✓"; "no" -> "✗"; else -> "○" }
                val colore = when (c.esito) { "si" -> Banco.verde; "no" -> Banco.ambra; else -> Banco.testoQuieto }
                Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
                    Text("$segno ${c.descrizione}", color = colore, fontSize = 13.sp)
                    Text((if (c.quando != null) "controllato alle ${oraLocale(c.quando)}" else "mai controllato") + (c.prova?.let { " · $it" } ?: ""), color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                }
            }
        }
        val sz = RegolePanoramica.sezioni(p.schede)
        // ─── Adesso ───
        Serigrafia("Adesso · ${sz.adesso.size}", modifier = Modifier.padding(top = 10.dp))
        if (sz.adesso.isEmpty()) Text("Nessuna chat al lavoro.", color = Banco.testoQuieto, modifier = Modifier.padding(vertical = 6.dp))
        for (s in sz.adesso) SchedaTel(s, 3, onApri)
        // ─── Piano ───
        val piano = p.piano.filter { it.compiti.isNotEmpty() }
        if (piano.isNotEmpty()) {
            Serigrafia("Piano", modifier = Modifier.padding(top = 10.dp))
            for (c in piano) {
                RigaApri("${c.nome} · ${c.compiti.size}", c.fase in aperte) { apri(c.fase) }
                if (c.fase in aperte) for (x in c.compiti) {
                    val chi = x.ruolo?.let { RegolePanoramica.NOME_RUOLO[it] ?: it } ?: (if (x.fase == "da-fare") "da assegnare" else "Chat")
                    Column(
                        Modifier.fillMaxWidth().padding(top = 6.dp).heightIn(min = 48.dp)
                            .border(BorderStroke(1.dp, Banco.incisione), RoundedCornerShape(8.dp))
                            .let { m -> x.chat?.let { id -> m.clickable { onApri(id) } } ?: m }
                            .padding(horizontal = 10.dp, vertical = 8.dp)
                    ) {
                        Text(
                            chi + (x.autore?.let { " · di ${RegolePanoramica.NOME_RUOLO[it] ?: it}" } ?: "") + (x.giri?.let { " · ↺ $it" } ?: ""),
                            color = Banco.testoQuieto, fontSize = 11.sp
                        )
                        Text(x.testo, color = if (x.chat != null) Banco.testo else Banco.testoQuieto, maxLines = 2, fontSize = 13.sp)
                        x.nota?.let { Text(it, color = Banco.testoQuieto, fontSize = 11.sp) }
                    }
                }
            }
        }
        // ─── Le altre chat del workspace ───
        if (sz.chat.isNotEmpty()) {
            Serigrafia("Chat · ${sz.chat.size}", modifier = Modifier.padding(top = 10.dp))
            for (s in sz.chat) SchedaTel(s, 0, onApri)
        }
        // ─── Finite ───
        if (sz.finite.isNotEmpty()) {
            RigaApri("Finite: ${sz.finite.size}", "finite" in aperte) { apri("finite") }
            if ("finite" in aperte) for (s in sz.finite) SchedaTel(s, 0, onApri)
        }
    }
}

/** Gli eventi tecnici dell'autopilota, chiusi: «Cosa è successo ▸» (PC 0.78.0). */
@Composable
fun CosaESuccesso(eventi: List<Battuta>) {
    if (eventi.isEmpty()) return
    var aperta by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        RigaApri("Cosa è successo · ${eventi.size}", aperta) { aperta = !aperta }
        if (aperta) for (b in eventi.take(50)) {
            Text(
                oraLocale(b.quando) + "  " + b.testo + (b.volte?.let { " ×$it" } ?: ""),
                color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
            )
        }
    }
}

/**
 * PC 0.79.0, Nicholas: accanto alla conversazione con l'autopilota un
 * riassunto che si aggiorna da solo, una riga per chat al lavoro. Sta fuori
 * dallo scorrimento, sopra la conversazione: al più 3 righe, le altre dietro
 * «e altre N». Il tocco apre la chat.
 */
@Composable
fun AlLavoro(righe: List<RigaAlLavoro>, onApri: (String) -> Unit) {
    var tutte by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(RegolePanoramica.titoloAlLavoro(righe), color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Aiuto("Una riga per chat al lavoro: chi è, cosa fa adesso, da quanto. ◆ vuol dire che aspetta una tua risposta. Si aggiorna da sola; tocca una riga per aprire la sua chat.", di = "Al lavoro")
        }
        if (righe.isEmpty()) Text("Nessuna chat al lavoro.", color = Banco.testoQuieto, fontSize = 12.sp)
        // Aperte tutte, scorrono in un'altezza fissa: la conversazione sotto non si schiaccia.
        Column(Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState())) {
        for (r in if (tutte) righe else righe.take(3)) {
            Row(
                Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 48.dp)
                    .border(BorderStroke(1.dp, if (r.aspettaTe) Banco.ambra else Banco.incisione), RoundedCornerShape(8.dp))
                    .clickable { onApri(r.id) }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(if (r.aspettaTe) "◆" else "●", color = if (r.aspettaTe) Banco.ambra else Banco.verde)
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text("${r.chi}  ${r.cosa}", color = Banco.testo, fontSize = 13.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    Text(RegolePanoramica.sottoAlLavoro(r), color = if (r.aspettaTe) Banco.ambra else Banco.testoQuieto, fontSize = 11.sp)
                }
            }
        }
        }
        if (righe.size > 3) RigaApri(if (tutte) "meno" else "e altre ${righe.size - 3}", tutte) { tutte = !tutte }
    }
}
