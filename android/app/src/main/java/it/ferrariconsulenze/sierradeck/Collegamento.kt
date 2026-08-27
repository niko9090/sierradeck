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

    fun dimentica() {
        preferenze.edit().clear().apply()
    }

    /**
     * Rimette in forma quello che l'utente digita.
     *
     * Chi scrive un indirizzo su un telefono scrive `192.168.1.7`, non
     * `http://192.168.1.7:47640`. Chiedergli la forma esatta sarebbe chiedergli
     * di conoscere una cosa che il programma sa già.
     */
    private fun pulisci(grezzo: String): String {
        val testo = grezzo.trim().removeSuffix("/")
        if (testo.isEmpty()) return ""
        val conSchema = if (testo.startsWith("http://") || testo.startsWith("https://")) {
            testo
        } else {
            "http://$testo"
        }
        // Senza porta si assume la nostra: è quella che il programma usa se
        // nessuno gliene ha chiesta un'altra.
        val senzaSchema = conSchema.substringAfter("://")
        return if (senzaSchema.contains(':')) conSchema else "$conSchema:$PORTA_PREDEFINITA"
    }

    companion object {
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
