package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.io.BufferedInputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket

/**
 * Un PC finto per i test (app 2.55.0): un socket vero su 127.0.0.1 con le
 * poche righe di HTTP che servono. Passa a `risposta` la rotta e il corpo
 * JSON e rimanda quello che dice lei. L'`Api` dell'app gli parla come a un PC.
 * (Il server HTTP del JDK non c'è nei test di Android: si fa a mano, come in
 * `PonteTest`.)
 */
class PcFintoHttp(private val risposta: (String, JsonObject) -> Pair<Int, String>) {
    private val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    val porta: Int get() = socket.localPort

    init {
        Thread {
            while (!socket.isClosed) {
                val c = try { socket.accept() } catch (_: Exception) { break }
                c.use { servi(it) }
            }
        }.apply { isDaemon = true }.start()
    }

    private fun servi(conn: Socket) {
        val inp = BufferedInputStream(conn.getInputStream())
        fun riga(): String {
            val b = StringBuilder()
            while (true) {
                val x = inp.read()
                if (x == -1 || x == '\n'.code) break
                if (x != '\r'.code) b.append(x.toChar())
            }
            return b.toString()
        }
        val percorso = riga().split(' ').getOrElse(1) { "/" }
        var lunghezza = 0
        while (true) {
            val h = riga()
            if (h.isEmpty()) break
            if (h.lowercase().startsWith("content-length:")) lunghezza = h.substringAfter(':').trim().toInt()
        }
        val dati = ByteArray(lunghezza)
        var letti = 0
        while (letti < lunghezza) { val n = inp.read(dati, letti, lunghezza - letti); if (n < 0) break; letti += n }
        val testo = String(dati, Charsets.UTF_8)
        val corpo = if (testo.isBlank()) JsonObject(emptyMap()) else Api.json.parseToJsonElement(testo).jsonObject
        val (stato, uscita) = risposta(percorso, corpo)
        val b = uscita.toByteArray(Charsets.UTF_8)
        val out = conn.getOutputStream()
        out.write("HTTP/1.1 $stato X\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${b.size}\r\nConnection: close\r\n\r\n".toByteArray())
        out.write(b)
        out.flush()
    }

    fun chiudi() = socket.close()
}
