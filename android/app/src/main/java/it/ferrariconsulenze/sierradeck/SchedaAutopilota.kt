package it.ferrariconsulenze.sierradeck

/**
 * Le linguette «Domande» e «File» della scheda dell'autopilota (0.38.0), la
 * parte pura: la stessa regola del PC e della pagina (`domande-autopilota.ts`,
 * `file-autopilota.ts`), provata senza Compose.
 *
 * Nicholas (01/10): le domande di un autopilota si vedono in una linguetta
 * «Domande» con il numerino, una per volta, non nella chat; dopo la risposta
 * domanda e risposta entrano nella chat e la linguetta passa alla successiva o
 * si chiude. La linguetta «File» mostra i file cambiati, per chat, e il diff.
 */

/** Come si risponde a una domanda della linguetta: percorso e corpo, come `richiestaScheda`. */
fun richiestaScheda(d: DomandaScheda, autopilota: String, testo: String): Pair<String, Map<String, String>> = when {
    d.tipo == "domanda" -> "/api/rispondi" to mapOf("domanda" to (d.idDomanda ?: ""), "risposta" to testo)
    testo.trim().equals("vai", ignoreCase = true) -> "/api/autopilota/vai" to mapOf("autopilota" to autopilota)
    else -> "/api/autopilota/dialogo" to mapOf("autopilota" to autopilota, "testo" to testo)
}

/** La riga sopra il testo: da dove viene la domanda. */
fun etichettaOrigine(d: DomandaScheda): String = when (d.origine) {
    "preparazione" -> "domanda iniziale: si sta preparando, e senza la tua risposta non comincia"
    "pubblica" -> "il lavoro è finito e verificato: chiede se pubblicare"
    "via" -> "si è preparato: aspetta il tuo via"
    else -> "domanda durante il lavoro: la chat è ferma su questa"
}

/**
 * Le linguette del dettaglio, in ordine: «Domande» (solo se ce ne sono, per
 * prima), «File», e quelle di sempre.
 */
fun linguetteAutopilota(domande: Int): List<String> =
    (if (domande > 0) listOf("domande") else emptyList()) + listOf("istruzioni", "file", "obiettivo", "criteri", "compiti", "deciso", "altro")

/** Una domanda nuova (che prima non c'era) fa avanti la linguetta. */
fun domandaArrivata(prima: List<String>?, adesso: List<DomandaScheda>): Boolean =
    if (prima == null) adesso.isNotEmpty() else adesso.any { it.chiave !in prima }

/** Una riga del diff, con il suo tipo per il colore. */
data class RigaDiff(val tipo: String, val testo: String)

fun righeDiff(testo: String, max: Int = 2000): List<RigaDiff> = testo.split("\n").take(max).map { r ->
    when {
        r.startsWith("+++") || r.startsWith("---") || r.startsWith("diff ") || r.startsWith("index ") -> RigaDiff("testa", r)
        r.startsWith("@@") -> RigaDiff("blocco", r)
        r.startsWith("+") -> RigaDiff("piu", r.drop(1))
        r.startsWith("-") -> RigaDiff("meno", r.drop(1))
        else -> RigaDiff("contesto", r.removePrefix(" "))
    }
}

/** «modificato · +3 −1 · da salvare»: la riga di un file. */
fun rigaFile(f: FileCambiato): String =
    "${f.stato} · " + (if (f.binario == true) "binario" else "+${f.piu} −${f.meno}") + " · " + (if (f.salvato) "in commit" else "da salvare")

/**
 * Quanto puo' crescere la linguetta aperta, in dp, prima di scorrere (0.39.1):
 * le Domande hanno piu' posto. Il testo di una domanda non si taglia mai: oltre
 * questa altezza scorre.
 */
fun altezzaLinguetta(chiave: String?): Int = if (chiave == "domande" || chiave == "istruzioni") 420 else 260
