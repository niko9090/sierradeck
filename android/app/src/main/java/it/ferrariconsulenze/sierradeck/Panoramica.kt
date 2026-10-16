package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/**
 * La Panoramica del workspace dell'autopilota (PC 0.77.0). Nicholas, 16/10:
 * «vedere tutto in una vista». Le stesse regole di `src/shared/panoramica.ts`:
 * i gruppi (aspettano te → al lavoro → ferme → finite), l'ordine fisso dentro
 * ogni gruppo (per ruolo, poi per nascita), le linguette visibili e «Altre»,
 * le righe dal vivo pulite. Sul telefono la Panoramica è una lista di schede.
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
    val domanda: Conversazione? = null
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

@Serializable
data class Panoramica(
    val workspace: String = "",
    val autopilota: String? = null,
    val riassunto: RiassuntoPanoramica? = null,
    val schede: List<SchedaPanoramica> = emptyList()
)

object RegolePanoramica {
    val GRUPPI = listOf("chiede", "lavora", "ferma", "finita")
    val NOME_GRUPPO = mapOf("chiede" to "Aspettano te", "lavora" to "Al lavoro", "ferma" to "Ferme", "finita" to "Finite")
    val SIMBOLO = mapOf("chiede" to "◆", "lavora" to "●", "ferma" to "■", "finita" to "✓")
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
        val scelte = inOrdine.filter { it.stato == "chiede" || it.stato == "lavora" || it.id == aperta }.map { it.id }.toMutableSet()
        var liberi = posti - scelte.size
        for (c in inOrdine) {
            if (liberi <= 0) break
            if (scelte.add(c.id)) liberi -= 1
        }
        return inOrdine.filter { it.id in scelte } to inOrdine.filter { it.id !in scelte }
    }

    private val ANSI = Regex("\u001B\\[[0-?]*[ -/]*[@-~]|\u001B\\][^\u0007]*(\u0007|\u001B\\\\)|\u001B[@-Z\\\\-_]|[\u0000-\u0008\u000B-\u001F\u007F]")
    private val RUMORE = listOf(
        Regex("^[\\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║╔╗╚╝▔▁▏▕·•-]*$"),
        Regex("^\\s*[│|]?\\s*❯\\s*$"),
        Regex("^\\s*[│|]?\\s*❯\\s*Try \""),
        Regex("\\? for shortcuts"),
        Regex("⏵⏵|bypass permissions|shift\\+tab to cycle", RegexOption.IGNORE_CASE),
        Regex("^\\s*◐.*/effort"),
        Regex("Your login expires", RegexOption.IGNORE_CASE),
        Regex("Transcript saving is off", RegexOption.IGNORE_CASE)
    )

    /** Le ultime righe dal vivo, pulite. Sul telefono 2 (revisione UI/UX). */
    fun righeDalVivo(righe: List<String>, quante: Int = 2): List<String> =
        righe.flatMap { it.split(Regex("\\r?\\n")) }
            .map { it.replace(ANSI, "").trimEnd() }
            .filter { it.isNotBlank() && RUMORE.none { x -> x.containsMatchIn(it) } }
            .takeLast(quante)
            .map { if (it.length > 160) it.take(159) + "…" else it }

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
