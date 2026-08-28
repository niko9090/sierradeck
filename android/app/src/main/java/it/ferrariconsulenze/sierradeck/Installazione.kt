package it.ferrariconsulenze.sierradeck

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Che il computer si stia aggiornando, ricordato **sul telefono**.
 *
 * Deve stare qui e non sul computer per una ragione ovvia appena la si dice: il
 * computer, mentre si aggiorna, **è spento**. Non c'è nessuno a cui chiedere a
 * che punto è. L'unico che può raccontare quei trenta secondi è chi guarda, e
 * l'unica cosa che può fare è ricordarsi che sono cominciati.
 *
 * Vive in due posti insieme, e servono tutti e due:
 *
 * - **in memoria, come stato di Compose**, perché la schermata deve comparire
 *   nell'istante in cui si preme «Installa». La prima versione teneva il dato
 *   solo nelle preferenze e lo leggeva una volta sola, dentro un `remember`:
 *   premere il tasto scriveva su disco e nessuno se ne accorgeva. L'unica
 *   strada che restava era vedere passare la fase «installo» in un giro di
 *   polling da due secondi — cioè un testa o croce contro un computer che sta
 *   già chiudendo. E infatti non si vedeva niente.
 * - **nelle preferenze**, perché sopravviva alla chiusura dell'app: si preme
 *   «Installa», si mette via il telefono, e riaprendolo si vuole ancora sapere
 *   com'è finita.
 */
object Installazione {

    private const val CHIAVE_DA = "installazione-da"
    private const val CHIAVE_VERSIONE = "installazione-versione-prima"

    /**
     * Oltre questo non è più un'installazione, è una cosa andata storta.
     *
     * Dieci minuti sono larghi apposta: l'installer copia file, aspetta che il
     * programma vecchio muoia, a volte aggiorna anche Claude Code nello stesso
     * viaggio. Ma non sono infiniti — una schermata che dice «sto installando»
     * per sempre è peggio di una che ammette di non sapere.
     */
    const val TROPPO_MS = 10 * 60 * 1000L

    /** Quando è cominciata, o `null`. È stato di Compose: chi la guarda si ridisegna. */
    var da: Long? by mutableStateOf(null)
        private set

    /** Che versione aveva il computer prima: serve a riconoscere che è cambiata. */
    var versionePrima: String by mutableStateOf("")
        private set

    private var lette = false

    private fun prefs(contesto: Context) =
        contesto.getSharedPreferences("sierradeck", Context.MODE_PRIVATE)

    /**
     * Riprende quello che c'era scritto, una volta sola per avvio dell'app.
     *
     * Va chiamata prima di guardare `da`: senza, un'installazione cominciata e
     * poi interrotta dalla chiusura dell'app sarebbe dimenticata proprio nel
     * momento in cui serve saperla.
     */
    fun riprendi(contesto: Context) {
        if (lette) return
        lette = true
        val quando = prefs(contesto).getLong(CHIAVE_DA, 0L)
        if (quando <= 0L) return
        if (System.currentTimeMillis() - quando > TROPPO_MS) {
            finita(contesto)
            return
        }
        da = quando
        versionePrima = prefs(contesto).getString(CHIAVE_VERSIONE, "") ?: ""
    }

    /** Segna che è cominciata adesso, ricordando che versione c'era prima. */
    fun iniziata(contesto: Context, versionePrimaDiOra: String?) {
        lette = true
        val adesso = System.currentTimeMillis()
        da = adesso
        versionePrima = versionePrimaDiOra ?: ""
        prefs(contesto).edit()
            .putLong(CHIAVE_DA, adesso)
            .putString(CHIAVE_VERSIONE, versionePrima)
            .apply()
    }

    fun finita(contesto: Context) {
        da = null
        versionePrima = ""
        prefs(contesto).edit().remove(CHIAVE_DA).remove(CHIAVE_VERSIONE).apply()
    }

    /** Scaduta da sola: dieci minuti sono la fine della pazienza, non un errore. */
    fun scaduta(): Boolean {
        val quando = da ?: return false
        return System.currentTimeMillis() - quando > TROPPO_MS
    }
}
