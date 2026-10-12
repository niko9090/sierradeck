package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/**
 * Il trasloco di un progetto (PC 0.65.0): «Sposta progetto» e «Rendi
 * residente» in un passaggio solo, sul PC che diventa residente. Nel pannello
 * «Progetti» (`traslochi`), con gli stessi passi e le stesse regole del PC
 * (`src/shared/trasloco.ts`): barra, passo di adesso, passi fatti e da fare,
 * il motivo se è fermo, il riassunto con «Annulla tutto».
 */
@Serializable data class PassoTraslocoDrive(val stato: String = "da-fare", val dettaglio: String? = null, val fatto: Int? = null, val totale: Int? = null)
@Serializable data class CopiaAltroveDrive(val pc: String = "", val nome: String = "", val esito: String? = null)
@Serializable data class FermoTraslocoDrive(val passo: String = "", val motivo: String = "", val riprovaDaSolo: Boolean = false)
@Serializable data class PcTraslocoDrive(val pc: String = "", val nome: String = "")
@Serializable data class TraslocoDrive(
    val id: String = "", val progetto: String = "", val nome: String = "",
    val verso: PcTraslocoDrive = PcTraslocoDrive(),
    val passi: Map<String, PassoTraslocoDrive> = emptyMap(),
    val altrove: List<CopiaAltroveDrive> = emptyList(),
    val fermo: FermoTraslocoDrive? = null,
    val unione: String? = null,
    val riassunto: List<String> = emptyList(),
    val finitoIl: String? = null, val scadeIl: String? = null,
    val annullatoIl: String? = null, val annullamento: List<String> = emptyList()
)

object TraslocoRegole {
    /** Gli stessi passi del PC (`PASSI_TRASLOCO`), nello stesso ordine. */
    val PASSI = listOf(
        "raccolta" to "Raccolgo le copie",
        "analisi" to "Confronto i file",
        "unione" to "Unisco qui",
        "vecchie" to "Copie vecchie nel recupero",
        "fine" to "Riassunto"
    )

    fun passo(t: TraslocoDrive, id: String): PassoTraslocoDrive = t.passi[id] ?: PassoTraslocoDrive()

    /** Il primo passo non fatto, come `prossimoPasso` del PC. */
    fun attuale(t: TraslocoDrive): Pair<String, String>? = if (t.annullatoIl != null) null else PASSI.firstOrNull { passo(t, it.first).stato != "fatto" }

    /** Come `avanzamento` del PC: i passi fatti più la frazione di quello in corso. */
    fun percento(t: TraslocoDrive): Int {
        val fatti = PASSI.count { passo(t, it.first).stato == "fatto" }
        val p = attuale(t)?.let { passo(t, it.first) }
        val frazione = if (p != null && p.stato == "in-corso" && p.totale != null && p.totale > 0) minOf(1.0, (p.fatto ?: 0).toDouble() / p.totale) else 0.0
        return Math.round((fatti + frazione) / PASSI.size * 100).toInt()
    }

    fun stato(t: TraslocoDrive): String = when {
        t.annullatoIl != null -> "annullato"
        t.finitoIl != null -> "fatto"
        t.fermo != null -> "fermo"
        else -> "in corso"
    }

    /** La riga del passo nella lista: ✓ fatto (con il suo dettaglio), … in corso, ! fermo, · da fare. */
    fun riga(t: TraslocoDrive, id: String, titolo: String): String {
        val p = passo(t, id)
        val icona = when (p.stato) { "fatto" -> "✓"; "in-corso" -> "…"; "fermo" -> "!"; else -> "·" }
        return "$icona $titolo" + (if (p.stato == "fatto" && p.dettaglio != null) " — ${p.dettaglio}" else "")
    }

    /** «Annulla tutto»: come `annullabile` del PC, e solo a trasloco finito o fermo. */
    fun annullabile(t: TraslocoDrive, adesso: Long): Boolean {
        if (t.annullatoIl != null) return false
        val scade = t.scadeIl?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
        if (scade != null && scade < adesso) return false
        val qualcosa = t.unione != null || t.altrove.any { it.esito == "nel-recupero" }
        return qualcosa && (t.finitoIl != null || t.fermo != null)
    }

    /** Il pannello si rilegge finché un trasloco lavora. */
    fun lavora(traslochi: List<TraslocoDrive>): Boolean = traslochi.any { it.finitoIl == null && it.annullatoIl == null && it.fermo == null }
}
