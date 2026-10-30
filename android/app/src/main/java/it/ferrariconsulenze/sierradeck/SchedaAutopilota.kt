package it.ferrariconsulenze.sierradeck

/**
 * Le linguette «Domande», «Avanzamento» e «File» della scheda dell'autopilota
 * (0.38.0; autopilota unico PC 0.86.x), la parte pura: la stessa regola del PC
 * e della pagina (`domande-autopilota.ts`, `file-autopilota.ts`), provata
 * senza Compose.
 *
 * Nicholas (01/10): le domande di un autopilota si vedono in una linguetta
 * «Domande» con il numerino, una per volta, non nella chat; dopo la risposta
 * domanda e risposta entrano nella chat e la linguetta passa alla successiva o
 * si chiude. La linguetta «File» mostra i file cambiati, per chat, e il diff.
 */

/**
 * Come si risponde a una domanda della linguetta: percorso e corpo. L'autopilota
 * unico (PC 0.86.x) non ha più il via: quello che non è la risposta a una
 * domanda gli arriva come messaggio, «Vai» compreso.
 */
fun richiestaScheda(d: DomandaScheda, autopilota: String, testo: String): Pair<String, Map<String, String>> = when {
    d.tipo == "domanda" -> "/api/rispondi" to mapOf("domanda" to (d.idDomanda ?: ""), "risposta" to testo)
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
 * prima), «Avanzamento», «File». L'autopilota unico (PC 0.86.x) non ha più
 * obiettivo, criteri, compiti, decisioni e istruzioni.
 */
fun linguetteAutopilota(domande: Int): List<String> =
    (if (domande > 0) listOf("domande") else emptyList()) + listOf("avanzamento", "file")

/**
 * Le parti nel dettaglio in una pagina che scorre (2.83.0): prima le domande,
 * poi l'avanzamento; i File in fondo, perché si leggono dal PC solo quando ci
 * si arriva scorrendo.
 */
fun sezioniAutopilota(domande: Int): List<String> = linguetteAutopilota(domande)

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
fun altezzaLinguetta(chiave: String?): Int = if (chiave == "domande") 420 else 260

/**
 * La riga riassuntiva in cima all'autopilota (2.83.0, c-509; autopilota unico
 * PC 0.86.x): prima le domande, se ce ne sono; poi la percentuale del
 * workspace, le richieste aperte e gli specialisti al lavoro. Il tocco la apre.
 */
object RiassuntoAutopilota {
    fun di(percento: Double?, richiesteAperte: Int, specialisti: Int, domande: Int, pensa: Boolean = false): String {
        val pezzi = mutableListOf<String>()
        if (domande > 0) pezzi += if (domande == 1) "1 domanda per te" else "$domande domande per te"
        pezzi += if (percento != null) RegoleAvanzamento.percento(percento) else "nessuna percentuale"
        if (richiesteAperte > 0) pezzi += if (richiesteAperte == 1) "1 richiesta aperta" else "$richiesteAperte richieste aperte"
        if (specialisti > 0) pezzi += if (specialisti == 1) "1 specialista" else "$specialisti specialisti"
        if (pensa) pezzi += "sta pensando"
        return pezzi.joinToString(" · ")
    }
}
