package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Le correzioni di velocità della 0.83.0, una per una: ognuna ha cambiato un
 * numero misurato sull'emulatore (rapporto-0-83-0.md), e nessuna deve tornare
 * indietro senza che qualcuno se ne accorga.
 */
class AvvioVelocitaTest {
    private val cartella = File("src/main/java/it/ferrariconsulenze/sierradeck")
    private val sorgenti = cartella.listFiles { f -> f.name.endsWith(".kt") }!!.sortedBy { it.name }.joinToString("\n") { it.readText() }
    private val app = File(cartella, "App.kt").readText()
    private val api = File(cartella, "Api.kt").readText()

    @Test
    fun `la scheda Mi collego compare solo se il collegamento tarda`() {
        assertTrue(AvvioCollegamento.MOSTRA_DOPO_MS in 500L..1500L)
        // Mai vista: si chiude subito, niente salto dell'elenco.
        assertEquals(0L, AvvioCollegamento.attesaPrimaDiChiudere(schedaVista = false))
        // Vista: il tempo di leggere «Collegato», come prima (1,2 s + 1,3 s).
        assertEquals(2500L, AvvioCollegamento.attesaPrimaDiChiudere(schedaVista = true))
        assertTrue(app.contains("schedaTent = schermataViaggio"))
        assertTrue(app.contains("delay(AvvioCollegamento.MOSTRA_DOPO_MS); schedaTent = true"))
        // I tempi fissi di prima, sempre e comunque, non ci sono più.
        assertFalse(app.contains("delay(1300)"))
    }

    @Test
    fun `lo stato della prova della chiave si usa subito`() {
        assertTrue(app.contains("if (stato == null || daCopia) { stato = letto; daCopia = false }"))
    }

    @Test
    fun `prima dello stato l'elenco dice che carica, non che e' vuoto`() {
        assertEquals("Carico le chat dal computer…", ElencoVuoto.testo(caricato = false))
        assertEquals("Nessuna chat sul computer.", ElencoVuoto.testo(caricato = true))
        assertTrue(sorgenti.contains("caricato = stato != null"))
    }

    @Test
    fun `lo stato si decodifica fuori dal thread dello schermo`() {
        assertTrue(api.contains("withContext(Dispatchers.Default) { json.decodeFromString<Stato>(testo) }"))
        assertTrue(api.contains("withContext(Dispatchers.Default) { json.decodeFromString<Domande>(testo) }"))
        val ronda = app.indexOf("Ronda.consuma(contesto")
        assertTrue(ronda > 0)
        assertTrue(app.lastIndexOf("withContext(Dispatchers.Default)", ronda) > app.lastIndexOf("api.statoConTesto()", ronda))
    }

    @Test
    fun `l'APK di rilascio passa da R8 con i nomi veri`() {
        val gradle = File("build.gradle.kts").readText()
        assertTrue(gradle.contains("isMinifyEnabled = true"))
        assertTrue(gradle.contains("isShrinkResources = true"))
        assertTrue(File("proguard-rules.pro").readText().lines().any { it.trim() == "-dontobfuscate" })
    }
}
