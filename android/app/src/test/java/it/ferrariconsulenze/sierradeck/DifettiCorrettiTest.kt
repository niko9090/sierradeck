package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.Json
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * I difetti noti dell'app, con una prova ciascuno.
 *
 * Sono tutti della stessa famiglia: cose che funzionano nel caso normale e
 * sbagliano in quello storto — l'indirizzo con un percorso dietro, due
 * autopiloti invece di uno, un aggiornamento che non viene da dove deve.
 */
class DifettiCorrettiTest {

    // ── L'indirizzo del computer ──────────────────────────────────────────

    @Test
    fun `la porta va dopo l host, non in fondo al percorso`() {
        // Il difetto: `senzaSchema.contains(':')` guardava tutto l'indirizzo, e
        // con un percorso dietro la porta finiva in coda —
        // «http://192.168.1.5/deck:47640», che non e' l'indirizzo di niente.
        assertEquals(
            "http://192.168.1.5:47640/deck",
            Collegamento.pulisci("192.168.1.5/deck")
        )
    }

    @Test
    fun `due punti in un frammento non fanno credere che la porta ci sia`() {
        // L'altro verso dello stesso difetto: il codice del QR arriva col
        // cancelletto, e i due punti li' dentro facevano finire sulla 80.
        assertEquals(
            "http://casa:47640/#codice=1:2",
            Collegamento.pulisci("casa/#codice=1:2")
        )
    }

    @Test
    fun `una porta scritta davvero si rispetta`() {
        assertEquals("http://casa:8080", Collegamento.pulisci("casa:8080"))
        assertEquals("http://casa:8080/deck", Collegamento.pulisci("casa:8080/deck"))
    }

    @Test
    fun `il caso normale resta quello di prima`() {
        assertEquals("http://192.168.1.7:47640", Collegamento.pulisci("192.168.1.7"))
        assertEquals("https://casa.mia:47640", Collegamento.pulisci("https://casa.mia"))
        assertEquals("", Collegamento.pulisci("   "))
    }

    @Test
    fun `un indirizzo IPv6 non e scambiato per uno con la porta`() {
        // E' pieno di due punti e sta fra quadre: la porta, se c'e', viene dopo
        // la quadra chiusa.
        assertEquals("http://[::1]:47640", Collegamento.pulisci("[::1]"))
        assertEquals("http://[::1]:8080", Collegamento.pulisci("[::1]:8080"))
    }

    // ── Da dove arriva un aggiornamento ───────────────────────────────────

    @Test
    fun `un APK si prende solo dalle nostre pubblicazioni, e solo cifrato`() {
        // E' l'unica cosa che questa app installa: su `http` chi sta sulla
        // stessa rete puo' sostituire il file mentre passa, e quello che si
        // installa non e' piu' quello che si e' scelto.
        assertTrue(
            Aggiornamenti.apkAmmesso(
                "https://github.com/niko9090/sierradeck/releases/download/v1/SierraDeck-2.0.0.apk"
            )
        )
        assertFalse(
            Aggiornamenti.apkAmmesso(
                "http://github.com/niko9090/sierradeck/releases/download/v1/SierraDeck-2.0.0.apk"
            )
        )
        assertFalse(Aggiornamenti.apkAmmesso("https://altrove.example/SierraDeck-2.0.0.apk"))
        assertFalse(
            Aggiornamenti.apkAmmesso(
                "https://github.com/qualcunaltro/roba/releases/download/v1/SierraDeck-2.0.0.apk"
            )
        )
        assertFalse(Aggiornamenti.apkAmmesso(""))
    }

    @Test
    fun `un allegato che non viene da li non viene nemmeno proposto`() {
        val corpo = """
            [{"assets":[
              {"name":"SierraDeck-9.9.9.apk","browser_download_url":"http://altrove.example/x.apk"},
              {"name":"SierraDeck-2.0.0.apk","browser_download_url":"https://github.com/niko9090/sierradeck/releases/download/v1/SierraDeck-2.0.0.apk"}
            ]}]
        """.trimIndent()
        // La versione piu' alta e' la 9.9.9, ma arriva da un posto qualunque:
        // proporla vorrebbe dire proporre di installare quello.
        assertEquals("2.0.0", Aggiornamenti.piuRecenteFra(corpo)?.first)
    }

    // ── I numeri delle notifiche ──────────────────────────────────────────

    @Test
    fun `le famiglie di avviso non si sovrappongono`() {
        // Erano 100, 500 e 900 con dodici bit sopra: bande larghe 4096 distanti
        // 400, cioe' sovrapposte per quasi tutta la lunghezza. Un autopilota
        // finito e uno fermo potevano cadere sullo stesso numero, e il secondo
        // avviso cancellava il primo.
        val famiglie = listOf(
            Avvisi.ID_DOMANDA, Avvisi.ID_FINITO, Avvisi.ID_FERMO, Avvisi.ID_ASPETTA
        )
        for (f in famiglie) {
            for (g in famiglie) {
                if (f == g) continue
                // Nessuna impronta puo' portare una famiglia dentro un'altra.
                assertTrue(
                    "le bande $f e $g si toccano",
                    kotlin.math.abs(f - g) > 0xFFFF
                )
            }
        }
    }

    @Test
    fun `due domande aperte danno due notifiche, non una`() {
        // Con l'id fisso, la seconda domanda cancellava la prima: restava senza
        // risposta perche' nessuno la vedeva.
        assertNotEquals(
            Avvisi.idAvviso(Avvisi.ID_DOMANDA, "d-1"),
            Avvisi.idAvviso(Avvisi.ID_DOMANDA, "d-2")
        )
    }

    @Test
    fun `lo stesso avviso tiene lo stesso numero fra un giro e l altro`() {
        // Altrimenti ogni controllo lascerebbe una notifica in piu' invece di
        // sostituire quella di prima.
        assertEquals(
            Avvisi.idAvviso(Avvisi.ID_FERMO, "ap-7"),
            Avvisi.idAvviso(Avvisi.ID_FERMO, "ap-7")
        )
    }

    // ── Le scelte del terminale ───────────────────────────────────────────

    /** Come lo legge l'app vera: quello che non conosce non la fa cadere. */
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    @Test
    fun `un computer che non manda le scelte non rompe la chat`() {
        // E' il caso normale per chi aggiorna il telefono prima del computer:
        // senza il valore predefinito, la lettura fallirebbe **tutta** e al
        // posto della conversazione ci sarebbe una schermata vuota.
        val vecchio = """{"chat":"p-1","totale":2,"da":0,"righe":["a"],"grezze":["a"]}"""
        val storia = json.decodeFromString<Storia>(vecchio)
        assertEquals(null, storia.scelte)
        assertEquals(1, storia.grezze.size)
    }

    @Test
    fun `le scelte arrivano con l opzione su cui e fermo il cursore`() {
        val nuovo = """{"chat":"p-1","totale":4,"da":0,"righe":[],"grezze":[],
          "scelte":{"corrente":1,"opzioni":[
            {"numero":1,"testo":"Si, riprendi","scelta":false},
            {"numero":2,"testo":"No, comincia da capo","scelta":true}]}}"""
        val storia = json.decodeFromString<Storia>(nuovo)
        assertEquals(2, storia.scelte?.opzioni?.size)
        assertEquals(1, storia.scelte?.corrente)
        assertEquals(true, storia.scelte?.opzioni?.get(1)?.scelta)
        // Il testo e' quello che l'app rimanda indietro quando lo tocchi: non
        // la posizione, che il computer ricalcola sullo schermo di adesso.
        assertEquals("No, comincia da capo", storia.scelte?.opzioni?.get(1)?.testo)
    }

    @Test
    fun `due autopiloti in stati diversi non si cancellano a vicenda`() {
        val stato = JSONObject(
            """
            {"autopiloti":[
              {"id":"ap-1","nome":"Uno","stato":"finito"},
              {"id":"ap-2","nome":"Due","stato":"sospeso","motivoSospensione":"guarda qui"}
            ]}
            """.trimIndent()
        )
        val visti = mutableSetOf<String>()
        // Primo giro: si tace su cio' che e' gia' successo.
        Avvisi.daAnnunciare(stato, visti, primoGiro = true)
        val avvisi = Avvisi.daAnnunciare(stato, mutableSetOf(), primoGiro = false)
        assertEquals(2, avvisi.size)
        assertNotEquals(avvisi[0].id, avvisi[1].id)
    }

    @Test
    fun `un apk arrivato a meta non si presenta all installazione`() {
        // Il flusso che si chiude prima non solleva niente: restava un file
        // corto, e Android lo rifiutava parlando di pacchetto corrotto — cioe'
        // mandando a cercare il guasto dalla parte sbagliata.
        assertEquals(false, Scaricamento.completo(15_000_000L, 9_000_000L))
        assertEquals(true, Scaricamento.completo(15_000_000L, 15_000_000L))
        // Senza `Content-Length` non c'e' niente da confrontare: si passa.
        assertEquals(true, Scaricamento.completo(-1L, 9_000_000L))
        assertEquals(true, Scaricamento.completo(0L, 0L))
    }
}
