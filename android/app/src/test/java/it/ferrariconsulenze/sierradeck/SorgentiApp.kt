package it.ferrariconsulenze.sierradeck

import java.io.File

/**
 * I sorgenti Kotlin dell'app, tutti insieme, per i test che guardano il codice.
 *
 * Dalla 0.83.0 i file grandi sono divisi in pezzi sotto le 800 righe, e una
 * funzione può cambiare file senza cambiare: un test che cerca una riga deve
 * trovarla nell'app, non in un nome di file.
 */
object SorgentiApp {
    val cartella = File("src/main/java/it/ferrariconsulenze/sierradeck")

    fun tutte(): String =
        cartella.listFiles { f -> f.name.endsWith(".kt") }!!.sortedBy { it.name }.joinToString("\n") { it.readText() }
}
