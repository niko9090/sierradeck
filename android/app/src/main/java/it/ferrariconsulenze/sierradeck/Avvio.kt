package it.ferrariconsulenze.sierradeck

/**
 * L'apertura dell'app (0.83.0): le regole di cosa si vede nei primi secondi.
 *
 * Misurato sull'emulatore con la 2.82.0: la prima riga di chat arrivava a 4,3 s
 * e la schermata smetteva di muoversi solo a 6,5 s, perché la scheda «Mi collego
 * a…» restava sopra l'elenco 2,5 s **dopo** che il collegamento era già riuscito,
 * e chiudendosi spostava tutto in su. E prima dello stato l'elenco diceva
 * «Nessuna chat sul computer», che non era vero.
 */
internal object AvvioCollegamento {
    /**
     * Quanto si aspetta prima di mostrare «Mi collego a…». Con il PC che risponde
     * subito (il caso di ogni giorno, in casa) la scheda non compare proprio;
     * compare se il collegamento tarda, e resta se non riesce.
     */
    const val MOSTRA_DOPO_MS = 1000L

    /**
     * Riuscito il collegamento, quanto lasciare la scheda prima di chiuderla:
     * zero se non si è mai vista (niente da confermare, niente salto), altrimenti
     * il tempo di leggere «Collegato».
     */
    fun attesaPrimaDiChiudere(schedaVista: Boolean): Long = if (schedaVista) 2500L else 0L
}

/** Cosa dice l'elenco delle chat quando è vuoto. */
internal object ElencoVuoto {
    fun testo(caricato: Boolean): String =
        if (caricato) "Nessuna chat sul computer." else "Carico le chat dal computer…"
}
