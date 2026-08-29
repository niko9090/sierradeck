package it.ferrariconsulenze.sierradeck

import android.content.Context

/**
 * Dove sta il computer e con quale chiave ci si parla.
 *
 * Due dati soli, e non c'è ragione di averne di più: l'indirizzo lo digiti una
 * volta, la chiave arriva dall'accoppiamento a sei cifre e non scade. Tutto il
 * resto — quali chat, quali autopiloti — lo racconta il computer ogni volta,
 * perché è l'unico che lo sa davvero.
 *
 * La chiave sta nelle preferenze private dell'app: su Android nessun'altra app
 * può leggerle, ed è la stessa protezione che il sistema dà alle password
 * salvate dai browser.
 */
class Collegamento(contesto: Context) {

    private val preferenze = contesto.getSharedPreferences("sierradeck", Context.MODE_PRIVATE)

    var indirizzo: String
        get() = preferenze.getString(CHIAVE_INDIRIZZO, "") ?: ""
        set(valore) = preferenze.edit().putString(CHIAVE_INDIRIZZO, pulisci(valore)).apply()

    var chiave: String
        get() = chiaveDi(indirizzo)
        set(valore) = ricordaChiave(indirizzo, valore)

    /**
     * La chiave di un indirizzo preciso.
     *
     * Una per indirizzo e non una sola: il computer di casa e quello raggiunto
     * in VPN sono due accoppiamenti diversi, e tornare dall'uno all'altro non
     * deve costare sei cifre ogni volta. Quello che si è già fatto una volta
     * non si chiede due volte.
     */
    /**
     * Quanto grande si legge il terminale, in `sp`.
     *
     * Sta qui e non sul computer perche' e' una cosa dello **schermo che hai in
     * mano**: lo stesso banco si guarda su un telefono piccolo e su un tablet, e
     * la misura giusta non e' la stessa. Il computer non deve saperne niente.
     */
    /**
     * Il controllo continuo: cinque secondi invece di due minuti.
     *
     * Spento di partenza, e non è un dettaglio: acceso obbliga Android a
     * mostrare una riga fissa nelle notifiche, e una riga che nessuno ha
     * chiesto è esattamente ciò che questa app non deve fare. Lo si accende
     * quando si sta aspettando qualcosa **adesso**.
     */
    var controlloContinuo: Boolean
        get() = preferenze.getBoolean(CHIAVE_CONTINUO, false)
        set(valore) = preferenze.edit().putBoolean(CHIAVE_CONTINUO, valore).apply()

    var dimensioneTerminale: Int
        get() = preferenze.getInt(CHIAVE_DIMENSIONE, DIMENSIONE_PREDEFINITA).coerceIn(DIMENSIONE_MIN, DIMENSIONE_MAX)
        set(valore) = preferenze.edit()
            .putInt(CHIAVE_DIMENSIONE, valore.coerceIn(DIMENSIONE_MIN, DIMENSIONE_MAX))
            .apply()

    fun chiaveDi(indirizzo: String): String =
        preferenze.getString("$CHIAVE_SEGRETO:$indirizzo", "") ?: ""

    fun ricordaChiave(indirizzo: String, chiave: String) {
        if (indirizzo.isBlank() || chiave.isBlank()) return
        preferenze.edit().putString("$CHIAVE_SEGRETO:$indirizzo", chiave.trim()).apply()
        val noti = indirizziNoti().toMutableList()
        if (!noti.contains(indirizzo)) {
            noti.add(0, indirizzo)
            // Otto bastano: oltre non è più una scelta, è un elenco da leggere.
            preferenze.edit().putString(NOTI, noti.take(8).joinToString("|")).apply()
        }
    }

    /** Gli indirizzi con cui ci si è già collegati, dal più recente. */
    fun indirizziNoti(): List<String> =
        (preferenze.getString(NOTI, "") ?: "").split("|").filter { it.isNotBlank() }

    /** C'è tutto quello che serve per parlare con il computer? */
    val pronto: Boolean
        get() = indirizzo.isNotEmpty()

    /**
     * Smette di usare **questo** computer, senza toccare gli altri.
     *
     * Prima era `clear()`, cioè si buttava via tutto: le chiavi di ogni
     * computer accoppiato, l'elenco di quelli noti, la misura del carattere.
     * Con un computer solo la differenza non si vedeva; con tre in casa
     * «scollegati da questo» voleva dire perdere anche gli altri due, e
     * rifare tre accoppiamenti col QR per averne cambiato uno.
     *
     * La chiave di questo computer **resta**: si torna alla schermata
     * d'ingresso, ma sceglierlo di nuovo dall'elenco non richiede un nuovo
     * codice. Per togliere davvero un accesso c'è `Postazioni.dimentica`, che
     * è un gesto esplicito e cancella anche la chiave.
     */
    fun dimentica() {
        preferenze.edit().remove(CHIAVE_INDIRIZZO).apply()
    }

    /** Toglie la chiave di un indirizzo: l'accesso a quel computer finisce qui. */
    fun scordaChiaveDi(indirizzo: String) {
        val restanti = indirizziNoti().filter { it != indirizzo }
        preferenze.edit()
            .remove("$CHIAVE_SEGRETO:$indirizzo")
            .putString(NOTI, restanti.joinToString("|"))
            .apply()
        if (this.indirizzo == indirizzo) preferenze.edit().remove(CHIAVE_INDIRIZZO).apply()
    }


    companion object {
        /**
         * Rimette in forma quello che l'utente digita.
         *
         * Chi scrive un indirizzo su un telefono scrive `192.168.1.7`, non
         * `http://192.168.1.7:47640`. Chiedergli la forma esatta sarebbe chiedergli
         * di conoscere una cosa che il programma sa già.
         */
        fun pulisci(grezzo: String): String {
            val testo = grezzo.trim().removeSuffix("/")
            if (testo.isEmpty()) return ""
            val conSchema = if (testo.startsWith("http://") || testo.startsWith("https://")) {
                testo
            } else {
                "http://$testo"
            }
            // Senza porta si assume la nostra: è quella che il programma usa se
            // nessuno gliene ha chiesta un'altra.
            //
            // La porta va guardata **solo nell'autorità**, cioè nel pezzo fra lo
            // schema e la prima barra. Prima si guardava tutto: un indirizzo con un
            // percorso dietro — «192.168.1.5/deck» — non conteneva due punti, e la
            // porta finiva in fondo a tutto: «http://192.168.1.5/deck:47640», che
            // non è un indirizzo di niente. Al contrario, due punti dentro un
            // frammento o una query facevano credere che la porta ci fosse già, e
            // si finiva sulla 80.
            val schema = conSchema.substringBefore("://")
            val senzaSchema = conSchema.substringAfter("://")
            val taglio = senzaSchema.indexOfFirst { it == '/' || it == '?' || it == '#' }
            val autorita = if (taglio == -1) senzaSchema else senzaSchema.substring(0, taglio)
            val resto = if (taglio == -1) "" else senzaSchema.substring(taglio)
            return if (haPorta(autorita)) conSchema else "$schema://$autorita:$PORTA_PREDEFINITA$resto"
        }

        /**
         * Se l'autorità porta già una porta.
         *
         * Un indirizzo IPv6 è pieno di due punti e sta fra parentesi quadre: la
         * porta, se c'è, viene **dopo** la quadra chiusa.
         */
        private fun haPorta(autorita: String): Boolean {
            val dopoQuadra = autorita.lastIndexOf(']')
            return if (dopoQuadra >= 0) autorita.indexOf(':', dopoQuadra) >= 0
            else autorita.contains(':')
        }

        const val PORTA_PREDEFINITA = 47640
        private const val CHIAVE_INDIRIZZO = "indirizzo"
        private const val CHIAVE_SEGRETO = "chiave"
        private const val NOTI = "indirizzi-noti"
        private const val CHIAVE_DIMENSIONE = "dimensione-terminale"
        private const val CHIAVE_CONTINUO = "controllo-continuo"
        const val DIMENSIONE_PREDEFINITA = 13
        // Sotto i nove non si legge, sopra i ventidue ci stanno sei parole per
        // riga: fuori da questi due non e' piu' una scelta, e' un guasto.
        const val DIMENSIONE_MIN = 9
        const val DIMENSIONE_MAX = 22
    }
}
