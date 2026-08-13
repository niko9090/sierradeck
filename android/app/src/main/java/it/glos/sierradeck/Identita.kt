package it.glos.sierradeck

/**
 * Come l'app si presenta alla pagina che serve.
 *
 * Una WebView, di suo, è indistinguibile da un browser: non è mai in
 * display-mode standalone e il suo user agent è quello di Chrome. La pagina del
 * Client non aveva quindi **nessun** modo di sapere di girare dentro l'app — e
 * infatti offriva di «scaricare l'app per Android» proprio a chi l'aveva già
 * aperta davanti, con un tasto che lì dentro non poteva funzionare.
 *
 * Basta una firma in coda allo user agent. Da lì la pagina sa due cose: che è
 * dentro l'app, e **quale versione** — così può tacere quando non c'è niente di
 * più nuovo da proporre.
 */
object Identita {

    /** Il nome che la pagina cerca per riconoscerci. */
    const val NOME = "SierraDeck"

    /**
     * Lo user agent da usare: quello di sistema, più la nostra firma.
     *
     * Si aggiunge, non si sostituisce: dentro quella stringa c'è la versione di
     * Android e del motore, e una pagina che serve un browser vecchio ne ha
     * bisogno. Se la firma c'è già non si raddoppia — `apriPagina` può essere
     * chiamata più volte nella vita dell'app.
     */
    fun userAgent(base: String?, versione: String): String {
        val firma = "$NOME/$versione"
        val pulito = (base ?: "").trim()
        return when {
            pulito.isEmpty() -> firma
            pulito.contains(firma) -> pulito
            else -> "$pulito $firma"
        }
    }
}
