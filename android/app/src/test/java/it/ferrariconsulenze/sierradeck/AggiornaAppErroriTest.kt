package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.altro.MotiviAggiornamentoPc
import it.ferrariconsulenze.sierradeck.sottofondo.Aggiornamenti
import it.ferrariconsulenze.sierradeck.sottofondo.Scaricamento
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Perche' «non riesco ad aggiornare» non deve restare muto: ogni errore
 * possibile dice in italiano semplice cosa non va e cosa fare.
 */
class AggiornaAppErroriTest {

    @Test
    fun `il file dell'app pubblicato oggi si legge e punta al posto ammesso`() {
        val corpo = """{"versione":"3.0.3","apk":"https://github.com/niko9090/sierradeck/releases/download/app-android/SierraDeck-3.0.3.apk","note":["x"]}"""
        val p = Aggiornamenti.leggiFileApp(corpo)
        assertEquals("3.0.3", p?.versione)
        assertTrue(Aggiornamenti.apkAmmesso(p!!.apk))
    }

    @Test
    fun `404 e 403 dicono cosa fare e non solo il numero`() {
        assertTrue(Scaricamento.motivoRisposta(404).contains("Riprova"))
        assertTrue(Scaricamento.motivoRisposta(403).contains("WiFi"))
        assertTrue(Scaricamento.motivoRisposta(503).contains("problema"))
        assertTrue(Scaricamento.motivoRisposta(418).contains("418"))
    }

    @Test
    fun `senza rete si dice di controllare la connessione`() {
        assertTrue(Scaricamento.motivoEccezione(java.net.UnknownHostException("github.com")).contains("connessione"))
        assertTrue(Scaricamento.motivoEccezione(java.net.SocketTimeoutException()).contains("lenta"))
        assertTrue(Scaricamento.motivoEccezione(java.io.IOException("reset")).contains("riprova"))
        assertTrue(Scaricamento.motivoEccezione(IllegalStateException("boh")).contains("boh"))
    }

    @Test
    fun `il permesso mancante dice dove andare`() {
        assertTrue(Scaricamento.SERVE_PERMESSO.contains("Consenti"))
        assertTrue(Scaricamento.SERVE_PERMESSO.contains("Riprova"))
    }

    @Test
    fun `la striscia compare con la versione trovata, e non cancella quella gia' su`() {
        val trovata = Aggiornamenti.Esito.Trovata("3.1.0", "https://github.com/niko9090/sierradeck/releases/download/app-android/SierraDeck-3.1.0.apk")
        assertEquals("3.1.0", Aggiornamenti.perLaStriscia(trovata, null)?.first)
        val gia = "3.0.9" to "https://github.com/niko9090/sierradeck/releases/download/app-android/SierraDeck-3.0.9.apk"
        assertEquals(gia, Aggiornamenti.perLaStriscia(trovata, gia))
        assertNull(Aggiornamenti.perLaStriscia(Aggiornamenti.Esito.GiaAggiornata, null))
        assertNull(Aggiornamenti.perLaStriscia(Aggiornamenti.Esito.NonRiuscita("x"), null))
    }

    @Test
    fun `cerca sul computer distingue il PC vecchio dal PC irraggiungibile`() {
        assertTrue(MotiviAggiornamentoPc.cerca(Api.Errore(404, "")).contains("non sa ancora cercare"))
        assertTrue(MotiviAggiornamentoPc.cerca(Api.Errore(401, "")).contains("accoppia"))
        assertFalse(MotiviAggiornamentoPc.cerca(java.net.ConnectException("rifiutata")).contains("non sa ancora cercare"))
        assertTrue(MotiviAggiornamentoPc.cerca(java.net.ConnectException("rifiutata")).contains("Non raggiungo"))
        assertTrue(MotiviAggiornamentoPc.cerca(Api.Errore(500, "")).contains("500"))
    }
}
