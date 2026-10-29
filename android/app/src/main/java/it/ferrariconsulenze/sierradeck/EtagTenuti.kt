package it.ferrariconsulenze.sierradeck

/**
 * Le risposte tenute con il loro ETag (app 2.86.0, PC 0.86.0).
 *
 * Lo stato, la scheda dell'autopilota, le domande e la Panoramica si
 * rileggono ogni pochi secondi, e quasi sempre sono uguali a prima. Il PC
 * dalla 0.86.0 risponde con un ETag; rimandandolo in `If-None-Match`, se non
 * è cambiato niente risponde 304 senza corpo e qui si ridà il testo di prima:
 * niente byte sulla rete, niente da decodificare (lo `StatoSoloSeCambia` vede
 * lo stesso testo e salta tutto). Un PC più vecchio non manda l'ETag: allora
 * non si tiene niente e tutto va come prima.
 *
 * Poche voci, le più recenti: una per rotta e per scheda aperta, non un
 * archivio che cresce con ogni autopilota guardato.
 */
object EtagTenuti {
    /** Le rotte che il PC serve con l'ETag (`ROTTE_CON_ETAG` di client-server.ts). */
    val ROTTE = setOf("/api/stato", "/api/autopilota", "/api/domande", "/api/panoramica", "/api/autopiloti/altri")

    const val MASSIMO = 12

    private data class Voce(val etag: String, val testo: String)

    /** In ordine d'uso: la meno recente esce per prima. */
    private val voci = object : LinkedHashMap<String, Voce>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Voce>?): Boolean = size > MASSIMO
    }

    fun chiave(indirizzo: String, percorso: String, corpo: String?): String = "$indirizzo $percorso ${corpo ?: ""}"

    /** L'ETag da rimandare, se di quella richiesta si ha già la risposta. */
    @Synchronized fun etag(chiave: String): String? = voci[chiave]?.etag

    /** Il testo di prima, per un 304. */
    @Synchronized fun testo(chiave: String): String? = voci[chiave]?.testo

    /** Una risposta 200: con l'ETag la si tiene, senza si dimentica quella di prima. */
    @Synchronized fun tieni(chiave: String, etag: String?, testo: String) {
        if (etag.isNullOrBlank()) voci.remove(chiave) else voci[chiave] = Voce(etag, testo)
    }

    @Synchronized fun quante(): Int = voci.size

    @Synchronized fun svuota() = voci.clear()
}
