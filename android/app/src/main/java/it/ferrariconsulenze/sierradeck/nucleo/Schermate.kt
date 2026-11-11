package it.ferrariconsulenze.sierradeck.nucleo

import kotlinx.serialization.Serializable
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * **Le regole delle schermate nuove** (app 11/11), senza Compose: si provano su
 * JVM e le schermate le disegnano così come sono.
 *
 * Le parole sono le stesse del PC e della pagina (`src/shared/scadenza-domanda.ts`,
 * `stato-telefono.ts`): se il PC le manda già scritte si usano quelle, se no
 * (un PC 0.100.0 o prima) si ricavano da quello che c'è, senza vuoti.
 */

/** `/api/specialisti/attesa`: chi lavora e chi aspetta, con i campi in parole del PC 0.101. */
@Serializable
data class VistaAttesa(
    val alLavoro: List<VoceAttesa> = emptyList(),
    val inFila: List<VoceAttesa> = emptyList()
)

@Serializable
data class VoceAttesa(
    val id: String = "",
    val workspace: String = "",
    val compito: String? = null,
    val descrizione: String = "",
    val tipo: String = "",
    val titolo: String? = null,
    val posizione: Int? = null,
    val percentuale: Int? = null,
    val minutiStimati: Double? = null,
    val titoloParole: String? = null,
    val ruoloParole: String? = null,
    val colore: String? = null
)

/** Il tono di una frase di stato: decide il colore e l'ordine. */
enum class Tono { FERMO, ASPETTA, LAVORA, RIPOSO;
    companion object {
        fun di(s: String?): Tono = when (s) { "fermo" -> FERMO; "aspetta" -> ASPETTA; "lavora" -> LAVORA; else -> RIPOSO }
    }
}

/** Una scheda di workspace in «Lavoro». */
data class SchedaWorkspace(
    val id: String,
    val nome: String,
    val frase: String,
    val tono: Tono,
    val percento: Int?,
    val mancaMin: Int?,
    val ruoli: List<RuoloTelefono>,
    val domande: Int
)

object RegoleSchermate {
    /** Le scelte della domanda di consenso ai limiti (contratto §5). */
    val SCELTE_CONSENSO = listOf("No", "Sì, questa volta", "Sì, sempre")

    /** È la domanda di consenso? Tre scelte, quelle e solo quelle. */
    fun eConsenso(scelte: List<String>): Boolean =
        scelte.size == 3 && scelte.map { it.trim().lowercase() }.toSet() == SCELTE_CONSENSO.map { it.lowercase() }.toSet()

    /** L'ordine dei tasti del consenso: «No», «Sì, questa volta», «Sì, sempre» (quello che chiede conferma per ultimo). */
    fun ordineConsenso(scelte: List<String>): List<String> =
        SCELTE_CONSENSO.mapNotNull { c -> scelte.firstOrNull { it.trim().equals(c, ignoreCase = true) } }

    /** «Salvali e unisci»: una domanda a due scelte che parla di unire (i rami di una chat). */
    fun eSalvaEUnisci(scelte: List<String>): Boolean = scelte.size == 2 && scelte.any { it.contains("unisci", ignoreCase = true) }

    /**
     * La riga sotto la domanda, uguale al PC: «Se non rispondi: fra 40 min scelgo io «X»»,
     * «Aspetta te: non scelgo io al posto tuo», o null se non si sa.
     */
    fun rigaSeNonRispondi(scadeIl: String?, rischiosa: Boolean?, consigliata: String?, ora: Long): String? {
        if (rischiosa == true) return "Aspetta te: non scelgo io al posto tuo"
        val quando = scadeIl?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return null
        val cosa = if (!consigliata.isNullOrBlank()) "«$consigliata»" else "la strada più prudente"
        val min = ceil((quando - ora) / 60_000.0).toInt()
        if (min <= 0) return "Se non rispondi: scelgo io a momenti $cosa"
        val ore = (min / 60.0).roundToInt()
        return "Se non rispondi: fra " + (if (min >= 60) "$ore " + (if (ore == 1) "ora" else "ore") else "$min min") + " scelgo io $cosa"
    }

    /** «Hai risposto: X», «Ha scelto il programma: X», «Non serve più: perché». */
    fun rigaDecisa(d: Decisa): String = when (d.come) {
        "tu" -> "Hai risposto: ${d.testo}"
        "programma" -> "Ha scelto il programma: ${d.testo}"
        else -> if (d.testo.isBlank() || d.testo == "Non serve più") "Non serve più" else "Non serve più: ${d.testo}"
    }

    /** «manca circa 25 min», «manca circa 2 ore». */
    fun mancaCirca(min: Int?): String? = when {
        min == null || min <= 0 -> null
        min >= 90 -> "manca circa ${(min / 60.0).roundToInt()} ore"
        else -> "manca circa $min min"
    }

    /** La frase e il tono di un autopilota: quelli del PC; da un PC di prima, dalla vista in una parola. */
    fun adessoDi(a: AutopilotaBreve): Pair<String, Tono> {
        a.adesso?.takeIf { it.testo.isNotBlank() }?.let { return it.testo to Tono.di(it.tono) }
        return when (a.vista?.stato?.id ?: a.stato) {
            "al-lavoro", "lavoro" -> "Al lavoro" to Tono.LAVORA
            "prepara", "intervista" -> "Si prepara" to Tono.LAVORA
            "aspetta", "attesa" -> "Fermo: aspetta una tua risposta" to Tono.ASPETTA
            "pronto" -> "Aspetta il tuo via" to Tono.ASPETTA
            "senza-segni" -> "Nessun segno da un po’" to Tono.FERMO
            "guasto", "fallito" -> "Fermo per un errore" to Tono.FERMO
            "finito" -> "A riposo: tutto fatto" to Tono.RIPOSO
            "sospeso", "fermo" -> "Fermo" to Tono.FERMO
            else -> "A riposo" to Tono.RIPOSO
        }
    }

    /** Le schede dei workspace, in ordine fermo › aspetta te › al lavoro › a riposo; gli archiviati no. */
    fun schedeWorkspace(autopiloti: List<AutopilotaBreve>): List<SchedaWorkspace> =
        autopiloti.filter { !it.archiviato }.map { a ->
            val (frase, tono) = adessoDi(a)
            SchedaWorkspace(
                id = a.id,
                nome = a.workspace?.takeIf { it.isNotBlank() } ?: a.nome.ifBlank { a.id },
                frase = frase, tono = tono,
                percento = a.avanzamento?.percento?.coerceIn(0, 100),
                mancaMin = a.avanzamento?.mancaMin,
                ruoli = a.ruoli,
                domande = a.domande ?: 0
            )
        }.withIndex().sortedWith(compareBy({ it.value.tono.ordinal }, { it.index })).map { it.value }

    /** Le domande che aspettano: quelle con la scheda, aperte (senza `decisa` né risposta). */
    fun domandeAperte(c: List<Conversazione>): List<Conversazione> =
        c.filter { it.scheda != null && it.chiede && it.scheda.decisa == null && it.scheda.risposta == null && it.scheda.superata == null }

    /** Il colore di un ruolo: `#rrggbb` del PC, o quello della tabella per nome. */
    fun argbRuolo(colore: String?): Long? {
        val c = colore?.trim() ?: return null
        if (!c.matches(Regex("#[0-9a-fA-F]{6}"))) return null
        return 0xFF000000L or c.substring(1).toLong(16)
    }

    /** Il titolo in parole: quello del PC, o il testo senza la sigla davanti (PC di prima). */
    fun titolo(parole: String?, grezzo: String): String =
        parole?.takeIf { it.isNotBlank() } ?: grezzo.replace(Regex("^\\s*\\[?(?:[krpc]-\\d{1,6}|k\\d{1,4})\\]?\\s*[:·—–-]?\\s*", RegexOption.IGNORE_CASE), "").replaceFirstChar { it.uppercase() }

    /** Il ruolo in parole: quello del PC, o dal tipo dello specialista. */
    fun ruolo(parole: String?, tipo: String?): String = parole?.takeIf { it.isNotBlank() } ?: when (tipo?.lowercase()) {
        "sviluppatore", "sviluppo" -> "Sviluppo"
        "verificatore", "collaudo" -> "Collaudo"
        "revisore", "revisione" -> "Revisione"
        "interfaccia" -> "Interfaccia"
        "android" -> "Android"
        "esploratore" -> "Analisi"
        "rilascio" -> "Rilascio"
        null, "" -> "Specialista"
        else -> tipo.replaceFirstChar { it.uppercase() }
    }

    /** Il colore di un ruolo per nome (PC di prima, che non manda `colore`). */
    fun coloreRuolo(ruolo: String): String = when (ruolo) {
        "Sviluppo", "Android" -> "#4aa3ff"
        "Interfaccia" -> "#b48cff"
        "Collaudo" -> "#3cc8c0"
        "Revisione" -> "#f283c0"
        "Rilascio" -> "#b4d454"
        "Analisi" -> "#54c07a"
        else -> "#9aa1a9"
    }

    /** Una riga di «Chi lavora»: «in fila, 2°», «mancano circa 12 min», «finito». */
    fun statoVoce(v: VoceAttesa, alLavoro: Boolean): String = when {
        !alLavoro -> "in fila, ${v.posizione ?: 1}°"
        v.minutiStimati != null && v.minutiStimati > 0 -> "mancano circa ${v.minutiStimati.roundToInt().coerceAtLeast(1)} min"
        else -> "al lavoro"
    }

    /** Una frase fissa per tipo di errore: il dettaglio va dietro «?». */
    fun fraseErrore(tipo: TipoErrore): String = when (tipo) {
        TipoErrore.RETE -> "Il computer non risponde. Riprovo da solo."
        TipoErrore.RIFIUTO -> "Il computer non l’ha presa."
        TipoErrore.VECCHIO -> "Il computer va aggiornato per questo."
        TipoErrore.CHIAVE -> "Il computer non riconosce più questo telefono."
    }
}

enum class TipoErrore { RETE, RIFIUTO, VECCHIO, CHIAVE }
