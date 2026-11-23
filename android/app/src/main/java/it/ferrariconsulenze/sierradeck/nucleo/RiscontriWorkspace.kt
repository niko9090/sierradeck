package it.ferrariconsulenze.sierradeck.nucleo

/**
 * Piccole regole della pagina di un workspace, senza Compose (provate in
 * `RiscontriWorkspaceTest`): quando la chat deve scorrere da sola, cosa si
 * scrive se una lettura fallisce, come si dice l'esito di una mossa.
 */
object RiscontriWorkspace {
    /** Quante righe dal fondo contano ancora come «sono in fondo». */
    private const val MARGINE = 2

    /**
     * La chat deve scendere alle righe nuove? Sì alla prima lettura e quando chi
     * legge è già in fondo; no se è salito a rileggere (prima lo riportava giù
     * a ogni riga nuova e il testo scappava).
     */
    fun scendi(primaVolta: Boolean, ultimoVisibile: Int, totaleVecchio: Int): Boolean {
        if (primaVolta) return true
        if (totaleVecchio <= 0) return true
        return ultimoVisibile >= totaleVecchio - 1 - MARGINE
    }

    /** Cosa dire in una chat senza righe. null = ci sono righe da disegnare. */
    fun fraseChatVuota(caricata: Boolean, nonLeggo: Boolean, righe: Int): String? = when {
        righe > 0 -> null
        caricata -> "Ancora niente: scrivigli cosa vuoi fare."
        nonLeggo -> "Non riesco a leggere la chat. Riprovo da solo."
        else -> "Leggo la chat…"
    }

    /** Cosa dire nella lettura di uno specialista: null = ci sono righe. */
    fun fraseSpecialista(righe: List<String>?, nonLeggo: Boolean): String? = when {
        righe == null -> if (nonLeggo) "Non riesco a leggere. Riprovo da solo." else "Leggo…"
        righe.isEmpty() -> "Non ha ancora scritto niente."
        else -> null
    }

    /** Esito di una mossa («Precedenza», «Ferma»): mai lasciare il vecchio mentre ne parte una nuova. */
    fun esitoMossa(presa: Boolean?): String = when (presa) {
        null -> "Mando…"
        true -> "Fatto."
        false -> "Il computer non l’ha presa. Riprova fra poco."
    }
}
