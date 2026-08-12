package it.glos.sierradeck

import android.content.Context
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Cosa è andato storto l'ultima volta.
 *
 * Un'app che si chiude non lascia niente: torni alla schermata iniziale e vedi
 * la sua icona, e non c'è modo di sapere perché — a meno di collegare il
 * telefono a un computer e leggere i log di sistema, che nessuno fa.
 *
 * Qui l'errore viene scritto su un file prima che l'app muoia, e mostrato al
 * riavvio successivo. Non ripara niente: rende visibile quello che era muto, e
 * senza quello si tira a indovinare — cosa che è già costata parecchi giri.
 */
object Guasti {

    private const val FILE = "ultimo-guasto.txt"

    /**
     * Prende nota di ogni errore che ucciderebbe l'app.
     *
     * Si registra all'avvio, prima di qualunque altra cosa: un guasto che
     * capita mentre ci si registra non verrebbe preso da nessuno.
     */
    fun prendiNota(contesto: Context) {
        val precedente = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, errore ->
            try {
                val testo = StringWriter()
                errore.printStackTrace(PrintWriter(testo))
                File(contesto.filesDir, FILE).writeText(
                    "${errore.javaClass.simpleName}: ${errore.message}\n\n$testo"
                )
            } catch (e: Exception) {
                // Se non si riesce nemmeno a scrivere il guasto, non c'è altro
                // da fare: si lascia il campo a chi c'era prima di noi.
            }
            // Il gestore precedente chiude l'app come Android si aspetta: non
            // farlo lascerebbe un'applicazione viva e rotta, che è peggio.
            precedente?.uncaughtException(thread, errore)
        }
    }

    /** L'ultimo guasto, se ce n'è uno da raccontare. */
    fun ultimo(contesto: Context): String? {
        val file = File(contesto.filesDir, FILE)
        if (!file.exists()) return null
        return try {
            file.readText().take(1500)
        } catch (e: Exception) {
            null
        }
    }

    /** Letto e archiviato: non si ripresenta al prossimo avvio. */
    fun dimentica(contesto: Context) {
        try {
            File(contesto.filesDir, FILE).delete()
        } catch (e: Exception) {
            // Un file che non si cancella fa rivedere lo stesso messaggio: è il
            // danno più piccolo fra quelli possibili.
        }
    }
}
