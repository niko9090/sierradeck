package it.glos.sierradeck

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Prove sul controllo della versione nuova.
 *
 * Servono a stabilire, con numeri veri e con il JSON vero di GitHub, se
 * l'app puo' proporre una versione che e' gia' installata.
 */
class AggiornamentiTest {

    // La stessa espressione di Aggiornamenti.VERSIONE_NEL_NOME (li' e' privata).
    private val versioneNelNome = Regex("""SierraDeck-([0-9]+\.[0-9]+\.[0-9]+)\.apk""")

    /** Il JSON vero di `releases/latest` al 13/08/2026 (v0.9.23), ridotto ai campi che l'app legge. */
    private val releaseVera = """
        {
          "tag_name": "v0.9.23",
          "assets": [
            {"name": "latest.yml", "browser_download_url": "https://github.com/niko9090/sierradeck/releases/download/v0.9.23/latest.yml"},
            {"name": "SierraDeck-1.3.0.apk", "browser_download_url": "https://github.com/niko9090/sierradeck/releases/download/v0.9.23/SierraDeck-1.3.0.apk"},
            {"name": "SierraDeck-Setup-0.9.23.exe", "browser_download_url": "https://github.com/niko9090/sierradeck/releases/download/v0.9.23/SierraDeck-Setup-0.9.23.exe"},
            {"name": "SierraDeck-Setup-0.9.23.exe.blockmap", "browser_download_url": "https://github.com/niko9090/sierradeck/releases/download/v0.9.23/SierraDeck-Setup-0.9.23.exe.blockmap"}
          ]
        }
    """.trimIndent()

    @Test
    fun `la stessa versione non e' piu' nuova`() {
        assertFalse("1.3.0 non deve risultare piu' nuova di 1.3.0", Aggiornamenti.piuNuova("1.3.0", "1.3.0"))
    }

    @Test
    fun `una versione precedente vede quella nuova`() {
        assertTrue(Aggiornamenti.piuNuova("1.2.0", "1.3.0"))
        assertTrue(Aggiornamenti.piuNuova("0.9.0", "0.10.0"))
        assertFalse(Aggiornamenti.piuNuova("1.3.0", "1.2.9"))
        assertFalse(Aggiornamenti.piuNuova("1.3.0", "1.3"))
        assertFalse(Aggiornamenti.piuNuova("1.3.0", ""))
    }

    /** Quale nome file trova per primo nella release vera, e cosa decide di conseguenza. */
    @Test
    fun `sul release vero trova l'apk e non propone niente a chi ha gia' 1_3_0`() {
        val allegati = JSONObject(releaseVera).getJSONArray("assets")
        var primoTrovato: String? = null
        var versione: String? = null
        for (i in 0 until allegati.length()) {
            val nomeFile = allegati.getJSONObject(i).optString("name")
            val trovata = versioneNelNome.find(nomeFile)?.groupValues?.get(1) ?: continue
            primoTrovato = nomeFile
            versione = trovata
            break
        }
        assertEquals("SierraDeck-1.3.0.apk", primoTrovato)
        assertEquals("1.3.0", versione)
        assertFalse(
            "con BuildConfig.VERSION_NAME = 1.3.0 non deve proporre niente",
            Aggiornamenti.piuNuova("1.3.0", versione!!)
        )
    }

    /**
     * Il codice di produzione vero, contro GitHub vero.
     *
     * Se `quandoTrovata` scatta con «1.3.0» avendo gia' la 1.3.0, il difetto e'
     * qui dentro; se non scatta, il difetto e' altrove.
     */
    @Test
    fun `controlla contro GitHub vero`() {
        for (mia in listOf("1.3.0", "1.2.0")) {
            val aspetta = CountDownLatch(1)
            var proposta: Pair<String, String>? = null
            Aggiornamenti.controlla(mia) { nome, apk ->
                proposta = nome to apk
                aspetta.countDown()
            }
            aspetta.await(25, TimeUnit.SECONDS)
            println("VERO mia=$mia -> proposta=$proposta")
        }
    }

    /**
     * La stessa richiesta che fa `Scaricamento.apk`, contro l'indirizzo vero.
     *
     * L'indirizzo di GitHub e' un 302 verso un altro host: qui si vede se
     * `HttpURLConnection` lo segue da solo, o se il download muore in silenzio.
     */
    @Test
    fun `l'apk di GitHub si scarica seguendo il redirect`() {
        val indirizzo =
            "https://github.com/niko9090/sierradeck/releases/download/v0.9.23/SierraDeck-1.3.0.apk"
        val connessione = (java.net.URL(indirizzo).openConnection() as java.net.HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 15_000
            readTimeout = 60_000
        }
        val codice = connessione.responseCode
        var presi = 0L
        if (codice == 200) {
            connessione.inputStream.use { dentro ->
                val pezzo = ByteArray(64 * 1024)
                while (true) {
                    val letti = dentro.read(pezzo)
                    if (letti <= 0) break
                    presi += letti
                }
            }
        }
        connessione.disconnect()
        println("SCARICO codice=$codice url finale=${connessione.url} byte=$presi")
        assertEquals(200, codice)
        assertTrue("deve superare il megabyte del controllo di Scaricamento", presi > 1_000_000)
    }
}
