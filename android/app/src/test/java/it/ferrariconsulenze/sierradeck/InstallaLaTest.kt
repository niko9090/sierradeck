package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedInputStream
import java.net.InetAddress
import java.net.ServerSocket
import it.ferrariconsulenze.sierradeck.nucleo.AvanzamentoLa
import it.ferrariconsulenze.sierradeck.nucleo.StatoInstallaLa
import it.ferrariconsulenze.sierradeck.nucleo.VistaInstallaLa
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.altro.PcIndietro

/**
 * k-agg1: «Installa là» dal telefono su un PC diverso da quello collegato, e la
 * percentuale che si vede mentre scarica (anche da PC 0.117.x, che la scrivono
 * solo nella frase).
 */
class InstallaLaTest {
    /** Un PC accoppiato finto: registra la prima riga HTTP, la chiave e il corpo, e risponde `risposta`. */
    private class PcFinto(val risposta: String, val arrivati: MutableList<String>) {
        val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        val porta: Int get() = socket.localPort

        init {
            Thread {
                while (!socket.isClosed) {
                    val c = try { socket.accept() } catch (_: Exception) { break }
                    c.use { conn ->
                        val inp = BufferedInputStream(conn.getInputStream())
                        fun riga(): String {
                            val b = StringBuilder()
                            while (true) { val x = inp.read(); if (x < 0 || x == 10) break; if (x != 13) b.append(x.toChar()) }
                            return b.toString()
                        }
                        val prima = riga().split(' ')
                        var n = 0
                        while (true) {
                            val r = riga()
                            if (r.isEmpty()) break
                            if (r.lowercase().startsWith("content-length:")) n = r.substringAfter(':').trim().toInt()
                        }
                        val buf = ByteArray(n)
                        var letti = 0
                        while (letti < n) { val k = inp.read(buf, letti, n - letti); if (k < 0) break; letti += k }
                        synchronized(arrivati) { arrivati.add("${prima[0]} ${prima[1]} ${buf.decodeToString()}") }
                        val b = risposta.toByteArray()
                        val out = conn.getOutputStream()
                        out.write("HTTP/1.1 200 X\r\nContent-Type: application/json\r\nContent-Length: ${b.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        out.write(b)
                        out.flush()
                    }
                }
            }.apply { isDaemon = true }.start()
        }

        fun stop() = socket.close()
    }

    @Test
    fun `il comando arriva al PC accoppiato con il PC scelto nel corpo, anche da un'Api puntata su un altro PC`() = runBlocking {
        val arrivati = mutableListOf<String>()
        val s = PcFinto("""{"fatto":true}""", arrivati)
        try {
            // Prima della correzione: l'Api del ponte rifiutava «/api/installa-la» con un 403 senza che partisse niente.
            val api = Api("http://127.0.0.1:${s.porta}", "k").suPc("altro-pc")
            assertTrue(api.installaLa("portatile").fatto)
            assertEquals(1, arrivati.size)
            assertEquals("POST /api/installa-la {\"pc\":\"portatile\"}", arrivati[0])
        } finally {
            s.stop()
        }
    }

    @Test
    fun `lo stato dell'avanzamento si legge dal PC accoppiato anche con l'Api del ponte`() = runBlocking {
        val arrivati = mutableListOf<String>()
        val s = PcFinto("""{"avanzamenti":[{"pcId":"portatile","nome":"P","fase":"scarico","messaggio":"x","percento":37}]}""", arrivati)
        try {
            val stato = Api("http://127.0.0.1:${s.porta}", "k").suPc("altro-pc").installaLaStato()
            assertEquals("GET /api/installa-la/stato ", arrivati[0].substringBefore("{").let { it })
            assertEquals(37, VistaInstallaLa.percento(VistaInstallaLa.di(stato, "portatile")))
        } finally {
            s.stop()
        }
    }

    @Test
    fun `la percentuale si vede dal campo, e da un PC 0_117 si legge dalla frase`() {
        val nuovo = AvanzamentoLa("p", "P", "scarico", "P scarica la 0.118.0: 42%", percento = 42)
        assertEquals(42, VistaInstallaLa.percento(nuovo))
        val vecchio = AvanzamentoLa("p", "P", "scarico", "P scarica la 0.118.0: 7%")
        assertEquals(7, VistaInstallaLa.percento(vecchio))
        assertEquals(100, VistaInstallaLa.percento(AvanzamentoLa("p", "P", "scarico", "", percento = 250)))
        // Senza numero nella frase non si inventa: «scarica…» resta senza barra.
        assertNull(VistaInstallaLa.percento(AvanzamentoLa("p", "P", "scarico", "P scarica la 0.118.0…")))
        // Fuori dallo scaricamento la barra non c'è, anche se la frase ha un numero.
        assertNull(VistaInstallaLa.percento(AvanzamentoLa("p", "P", "attendo", "aspetta: 3 chat al 50%")))
        assertNull(VistaInstallaLa.percento(null))
    }

    @Test
    fun `l'avanzamento si sceglie per PC e il tasto resta fermo finche' lavora`() {
        val stato = StatoInstallaLa(listOf(
            AvanzamentoLa("a", "A", "fatto", "ok"),
            AvanzamentoLa("b", "B", "scarico", "scarica: 10%")
        ))
        assertFalse(VistaInstallaLa.inCorso(VistaInstallaLa.di(stato, "a")))
        assertTrue(VistaInstallaLa.inCorso(VistaInstallaLa.di(stato, "b")))
        assertNull(VistaInstallaLa.di(stato, "c"))
        assertFalse(VistaInstallaLa.inCorso(null))
    }

    @Test
    fun `un PC piu' vecchio dell'ultima uscita offre Installa la anche se il PC collegato e' alla sua stessa versione`() {
        val t = PcIndietro.testo("PORTATILE", "0.117.2", "0.117.2", "0.118.0")
        assertNotNull(t)
        assertTrue(t!!, t.contains("Installa là") && t.contains("0.118.0"))
        assertNull(PcIndietro.testo("PORTATILE", "0.118.0", "0.118.0", "0.118.0"))
        assertNull(PcIndietro.testo("PORTATILE", "0.117.2", "0.117.2", null))
    }
}
