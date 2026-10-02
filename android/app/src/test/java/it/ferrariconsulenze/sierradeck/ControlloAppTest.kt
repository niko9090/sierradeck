package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'app cerca da sola la versione nuova (0.43.0, app 2.46.0): il confronto
 * delle versioni e la decisione di notificare, una volta sola per versione.
 */
class ControlloAppTest {
    @Test
    fun `il confronto e numero per numero, non alfabetico`() {
        assertTrue(Aggiornamenti.piuNuova("2.45.0", "2.46.0"))
        assertTrue(Aggiornamenti.piuNuova("2.9.0", "2.10.0"))
        assertFalse(Aggiornamenti.piuNuova("2.46.0", "2.46.0"))
        assertFalse(Aggiornamenti.piuNuova("2.46.0", "2.45.9"))
        assertTrue(Aggiornamenti.piuNuova("2.46", "2.46.1"))
    }

    @Test
    fun `si notifica una versione piu nuova, una volta sola`() {
        assertTrue(ControlloApp.daNotificare("2.45.0", "2.46.0", null))
        assertFalse(ControlloApp.daNotificare("2.45.0", "2.46.0", "2.46.0"))
        // Una piu' nuova ancora si annuncia, anche se la precedente era gia' stata detta.
        assertTrue(ControlloApp.daNotificare("2.45.0", "2.47.0", "2.46.0"))
        // Mai per la stessa o per una piu' vecchia, mai senza risposta.
        assertFalse(ControlloApp.daNotificare("2.46.0", "2.46.0", null))
        assertFalse(ControlloApp.daNotificare("2.46.0", "2.45.0", null))
        assertFalse(ControlloApp.daNotificare("2.46.0", null, null))
    }

    @Test
    fun `il file dell app con le note, e quello vecchio senza`() {
        val nuovo = ControlloApp.leggi("""{"versione":"2.46.0","apk":"https://github.com/niko9090/sierradeck/releases/download/v0.43.0/SierraDeck-2.46.0.apk","programma":"0.43.0","note":["L'app cerca da sola","",  "Compatibile"]}""")!!
        assertEquals("2.46.0", nuovo.versione)
        assertEquals("0.43.0", nuovo.programma)
        assertEquals(listOf("L'app cerca da sola", "Compatibile"), nuovo.note)
        val vecchio = ControlloApp.leggi("""{"versione":"2.45.0","apk":"https://github.com/niko9090/sierradeck/releases/download/v0.42.0/SierraDeck-2.45.0.apk"}""")!!
        assertTrue(vecchio.note.isEmpty())
        assertNull(vecchio.programma)
        // Un APK da un posto non ammesso non si propone mai.
        assertNull(ControlloApp.leggi("""{"versione":"9.9.9","apk":"https://altrove.example/x.apk"}"""))
    }

    @Test
    fun `il testo della notifica porta le note, corte`() {
        val t = ControlloApp.testoNotifica(AppPubblicata("2.46.0", "x", "0.43.0", listOf("uno", "due", "tre", "quattro", "x".repeat(400))))
        assertTrue(t.startsWith("SierraDeck 2.46.0 per il telefono (con il programma 0.43.0)."))
        assertTrue(t.contains("• uno"))
        assertFalse(t.contains("quattro"))
        assertTrue(ControlloApp.testoNotifica(AppPubblicata("2.46.0", "x", null, emptyList())).contains("Scarica e installa"))
    }
}
