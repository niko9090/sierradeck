package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.BufferedInputStream
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket

/**
 * Il ponte (PC 0.48.0, app 2.48.0): le chat degli altri PC dal vivo
 * attraverso il PC accoppiato. Il PC finto qui sotto risponde a
 * `/api/ponte` con la risposta vera di `/api/stato` di un PC (0.42.0, da
 * `src/test/resources/pc/`): è quella che il ponte gira intera.
 */
class PonteTest {
    private fun risorsa(p: String): String = javaClass.classLoader!!.getResource(p)!!.readText()

    @Test
    fun `le rotte del ponte sono le stesse del PC`() {
        val ts = File("../../src/shared/ponte-telefono.ts").readText()
        val blocco = ts.substringAfter("ROTTE_PONTE").substringAfter("= [").substringBefore("]")
        val delPc = Regex("'([^']+)'").findAll(blocco).map { it.groupValues[1] }.toSet()
        assertEquals(delPc, Ponte.ROTTE)
    }

    @Test
    fun `il corpo del ponte porta il PC, la rotta e il corpo dentro`() {
        val c = Api.json.parseToJsonElement(Ponte.corpo("lap", "/api/scrivi", """{"chat":"p-1","testo":"continua"}""")).jsonObject
        assertEquals("lap", c["pc"]!!.jsonPrimitive.content)
        assertEquals("/api/scrivi", c["percorso"]!!.jsonPrimitive.content)
        assertEquals("continua", c["corpo"]!!.jsonObject["testo"]!!.jsonPrimitive.content)
        assertFalse(Api.json.parseToJsonElement(Ponte.corpo("lap", "/api/stato", null)).jsonObject.containsKey("corpo"))
    }

    /** Un PC accoppiato finto (un socket e poche righe di HTTP): registra cosa gli arriva e risponde come il ponte. */
    private class PcFinto(val risposta: (String) -> Pair<Int, String>, val arrivati: MutableList<String>) {
        val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        val porta: Int get() = socket.localPort

        init {
            Thread {
                while (!socket.isClosed) {
                    val c = try { socket.accept() } catch (_: Exception) { break }
                    c.use { conn -> servi(conn) }
                }
            }.apply { isDaemon = true }.start()
        }

        private fun servi(conn: java.net.Socket) {
            val inp = BufferedInputStream(conn.getInputStream())
            fun riga(): String {
                val b = StringBuilder()
                while (true) {
                    val x = inp.read()
                    if (x < 0 || x == 10) break
                    if (x != 13) b.append(x.toChar())
                }
                return b.toString()
            }
            val prima = riga().split(' ')
            val intest = mutableMapOf<String, String>()
            while (true) {
                val r = riga()
                if (r.isEmpty()) break
                val i = r.indexOf(':')
                if (i > 0) intest[r.substring(0, i).trim().lowercase()] = r.substring(i + 1).trim()
            }
            val n = intest["content-length"]?.toIntOrNull() ?: 0
            val buf = ByteArray(n)
            var letti = 0
            while (letti < n) {
                val k = inp.read(buf, letti, n - letti)
                if (k < 0) break
                letti += k
            }
            val corpo = buf.decodeToString()
            synchronized(arrivati) { arrivati.add("${prima.getOrNull(0)} ${prima.getOrNull(1)} ${intest["x-sierradeck-chiave"]} $corpo") }
            val (codice, testo) = risposta(corpo)
            val b = testo.toByteArray()
            val out = conn.getOutputStream()
            out.write("HTTP/1.1 $codice X\r\nContent-Type: application/json\r\nContent-Length: ${b.size}\r\nConnection: close\r\n\r\n".toByteArray())
            out.write(b)
            out.flush()
        }

        fun stop() = socket.close()
    }

    @Test
    fun `attraverso il ponte le chat di un altro PC si leggono come quelle di casa`() = runBlocking {
        val arrivati = mutableListOf<String>()
        val statoVero = risorsa("pc/0.42.0/stato.json")
        val s = PcFinto({ 200 to statoVero }, arrivati)
        try {
            val api = Api("http://127.0.0.1:${s.porta}", "chiave-del-telefono").suPc("lap")
            val stato = api.stato()
            assertTrue(stato.chat.isNotEmpty())
            assertEquals(1, arrivati.size)
            val a = arrivati[0]
            assertTrue(a, a.startsWith("POST /api/ponte chiave-del-telefono "))
            assertTrue(a, a.contains("\"pc\":\"lap\"") && a.contains("\"percorso\":\"/api/stato\""))
        } finally {
            s.stop()
        }
    }

    @Test
    fun `il Drive, gli aggiornamenti e l'account di un altro PC non partono nemmeno`() = runBlocking {
        // Dalla 2.55.0 la gestione di chat, workspace e autopiloti passa (AzioniTelefonoTest);
        // il resto si fa da quel PC.
        val arrivati = mutableListOf<String>()
        val s = PcFinto({ 200 to "{}" }, arrivati)
        try {
            val api = Api("http://127.0.0.1:${s.porta}", "k").suPc("lap")
            val azioni = listOf<suspend () -> Unit>(
                { api.installaAggiornamento() }, { api.esciAccount() }, { api.driveAnnulla() }, { api.cercaAggiornamentoPc() }
            )
            for (azione in azioni) {
                try { azione(); fail("doveva essere rifiutata") } catch (e: Api.Errore) { assertEquals(403, e.codice) }
            }
            assertTrue(arrivati.isEmpty())
        } finally {
            s.stop()
        }
    }

    @Test
    fun `con un PC accoppiato prima della 0_48 il tasto non c'e' e un 404 si spiega`() = runBlocking {
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.PONTE, "0.47.0"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.PONTE, "0.48.0"))
        val arrivati = mutableListOf<String>()
        // La risposta di una rotta che un PC vecchio non conosce: uguale dalla 0.5.
        val s = PcFinto({ 404 to """{"errore":"non trovato"}""" }, arrivati)
        try {
            Api("http://127.0.0.1:${s.porta}", "k").suPc("lap").stato()
            fail("doveva fallire")
        } catch (e: Api.Errore) {
            assertTrue(FunzioniPc.mancaSulPc(e))
        } finally {
            s.stop()
        }
    }
}
