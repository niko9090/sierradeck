package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.Base64

/**
 * I file dal telefono (PC 0.50.0, app 2.50.0): limiti uguali al PC, pezzi e
 * ripresa, ordine del «Manda a…», rifiuti, e l'invio contro un PC finto in
 * memoria con la rete che cade a metà.
 */
class AllegatiTest {
    private val ts = File("../../src/shared/allegati.ts").readText()

    @Test
    fun `limiti e tipi vietati uguali a quelli del PC`() {
        assertTrue(ts.contains("ALLEGATO_MAX_BYTE = 100 * 1024 * 1024"))
        assertEquals(100L * 1024 * 1024, Allegati.MAX_BYTE)
        assertTrue(ts.contains("PEZZO_BYTE = 96 * 1024"))
        assertEquals(96 * 1024, Allegati.PEZZO_BYTE)
        val blocco = ts.substringAfter("ESTENSIONI_VIETATE").substringAfter("= [").substringBefore("]")
        val delPc = Regex("'([^']+)'").findAll(blocco).map { it.groupValues[1] }.toSet()
        assertEquals(delPc, Allegati.VIETATE)
    }

    @Test
    fun `le rotte dei file passano dal ponte`() {
        for (r in listOf("/api/allegati/inizia", "/api/allegati/pezzo", "/api/allegati/stato", "/api/allegati/fine")) assertTrue(r, r in Ponte.ROTTE)
    }

    @Test
    fun `controllo prima di mandare - programma, troppo grande, ok`() {
        assertNotNull(Allegati.controlla("setup.EXE", 10))
        assertTrue(Allegati.controlla("video.mp4", Allegati.MAX_BYTE + 1)!!.contains("100 MB"))
        assertNull(Allegati.controlla("video.mp4", Allegati.MAX_BYTE))
        assertNull(Allegati.controlla("foto.jpg", 0))
        assertNotNull(Allegati.controlla(" ", 1))
    }

    @Test
    fun `pezzi, percento, impronta e lettura a pezzi`() {
        assertEquals(0L to 10, Allegati.prossimoPezzo(0, 10))
        assertEquals(96L * 1024 to 5, Allegati.prossimoPezzo(96L * 1024, 96L * 1024 + 5))
        assertNull(Allegati.prossimoPezzo(10, 10))
        assertEquals(25, Allegati.percento(50, 200))
        assertEquals(100, Allegati.percento(0, 0))
        val dati = ByteArray(1000) { it.toByte() }
        val (sha, n) = Allegati.impronta(ByteArrayInputStream(dati))
        assertEquals(1000L, n)
        assertEquals(MessageDigest.getInstance("SHA-256").digest(dati).joinToString("") { "%02x".format(it) }, sha)
        val s = ByteArrayInputStream(dati)
        Allegati.salta(s, 990)
        assertArrayEquals(dati.copyOfRange(990, 1000), Allegati.leggiPezzo(s, 50))
    }

    @Test
    fun `Manda a - prima le recenti, poi questo PC, gli autopiloti, gli altri PC`() {
        val qui = Stato(
            chat = listOf(Chat(id = "p-1", titolo = "Clienti", sessione = "s-1"), Chat(id = "p-2", titolo = "Segreta", pin = "chiusa")),
            autopiloti = listOf(AutopilotaBreve(id = "a-1", nome = "Rilascio", stato = "lavoro"), AutopilotaBreve(id = "a-2", nome = "Vecchio", stato = "finito"))
        )
        val lap = PcPonte("lap", "LAPTOP")
        val tutte = Allegati.destinazioni(qui, listOf(lap to Stato(chat = listOf(Chat(id = "p-1", titolo = "Sito", sessione = "s-9")))))
        assertEquals(listOf("Clienti", "Segreta", "Rilascio", "Sito"), tutte.map { it.titolo })
        assertTrue(tutte[1].protetta)
        assertEquals("lap", tutte[3].pcId)
        // La chat «Sito» del portatile usata un'ora fa, l'autopilota ieri: vengono prima, la più recente in cima.
        val ordinate = Allegati.ordina(tutte, mapOf("lap|chat|s-9" to 2_000L, "|autopilota|a-1" to 1_000L))
        assertEquals(listOf("Sito", "Rilascio", "Clienti", "Segreta"), ordinate.map { it.titolo })
    }

    @Test
    fun `condivisione - solo content di un'altra app, mai i file privati di SierraDeck`() {
        assertTrue(Condivisione.ammessa("content", "com.google.android.apps.photos.contentprovider"))
        assertFalse(Condivisione.ammessa("file", null))
        assertFalse(Condivisione.ammessa("content", "it.ferrariconsulenze.sierradeck.file"))
        assertFalse(Condivisione.ammessa("content", null))
    }

    @Test
    fun `il manifesto accetta Condividi per ogni tipo di file, uno o tanti`() {
        val m = File("src/main/AndroidManifest.xml").readText()
        assertTrue(m.contains("android.intent.action.SEND\""))
        assertTrue(m.contains("android.intent.action.SEND_MULTIPLE\""))
        assertTrue(m.contains("android:mimeType=\"*/*\""))
    }

    /* ─── l'invio, contro un PC finto ─── */

    /** Il PC: tiene i byte arrivati per id; `cadeAl` = al pezzo n la risposta si perde (rete caduta). */
    private class PcFinto(val cadeAl: Int = -1, val rispostaInizia: Int = 200, val messaggio: String = "") : Trasporto {
        val arrivati = HashMap<String, ByteArrayOutputStream>()
        var byte = 0L
        var pezzi = 0
        var finito: JsonObject? = null
        var ultimaInizia: JsonObject? = null
        override suspend fun chiama(percorso: String, corpo: JsonObject): String {
            val id = corpo["id"]!!.jsonPrimitive.content
            return when (percorso) {
                "/api/allegati/inizia" -> {
                    ultimaInizia = corpo
                    if (rispostaInizia != 200) throw Api.Errore(rispostaInizia, """{"errore":"$messaggio","pin":"chiusa"}""")
                    byte = corpo["byte"]!!.jsonPrimitive.long
                    val b = arrivati.getOrPut(id) { ByteArrayOutputStream() }
                    """{"id":"$id","ricevuti":${b.size()},"pezzo":${Allegati.PEZZO_BYTE}}"""
                }
                "/api/allegati/pezzo" -> {
                    pezzi += 1
                    val b = arrivati[id]!!
                    val da = corpo["da"]!!.jsonPrimitive.long
                    if (da != b.size().toLong()) throw Api.Errore(409, """{"errore":"fuori posto","ricevuti":${b.size()}}""")
                    b.write(Base64.getDecoder().decode(corpo["dati"]!!.jsonPrimitive.content))
                    if (pezzi == cadeAl) throw IOException("Software caused connection abort")
                    """{"ricevuti":${b.size()}}"""
                }
                "/api/allegati/stato" -> """{"ricevuti":${arrivati[id]!!.size()},"byte":$byte}"""
                "/api/allegati/fine" -> {
                    finito = corpo
                    """{"arrivato":true,"nome":"foto.jpg","percorso":".sierradeck/allegati/2026-10-06/foto.jpg","avvisata":"chat"}"""
                }
                else -> throw Api.Errore(404, """{"errore":"non trovato"}""")
            }
        }
    }

    private fun sorgente(dati: ByteArray, nome: String = "foto.jpg") = SorgenteFile(nome, dati.size.toLong(), null) { ByteArrayInputStream(dati) }
    private val chat = DestinazioneFile("chat", "p-1", "Clienti")

    @Test
    fun `arriva intero a pezzi, con l'avanzamento e la nota`() = runBlocking {
        val pc = PcFinto()
        val dati = ByteArray(Allegati.PEZZO_BYTE * 2 + 77) { (it % 251).toByte() }
        val visti = mutableListOf<Int>()
        val e = Invio.manda(pc, sorgente(dati), chat, "quella di Rossi", "tabcdef123", attendi = {}) { r, b -> visti += Allegati.percento(r, b) }
        assertTrue(e is EsitoInvio.Arrivato)
        assertEquals("chat", (e as EsitoInvio.Arrivato).avvisata)
        assertArrayEquals(dati, pc.arrivati["tabcdef123"]!!.toByteArray())
        assertEquals("quella di Rossi", pc.ultimaInizia!!["nota"]!!.jsonPrimitive.content)
        assertEquals(100, visti.last())
        assertEquals(3, pc.pezzi)
    }

    @Test
    fun `la rete cade a metà - chiede al PC dove era e riparte da lì, senza buchi né doppioni`() = runBlocking {
        val pc = PcFinto(cadeAl = 2)
        val dati = ByteArray(Allegati.PEZZO_BYTE * 3 + 5) { (it * 7).toByte() }
        val e = Invio.manda(pc, sorgente(dati), chat, "", "tabcdef124", attendi = {})
        assertTrue(e is EsitoInvio.Arrivato)
        assertArrayEquals(dati, pc.arrivati["tabcdef124"]!!.toByteArray())
    }

    @Test
    fun `un riprova con lo stesso id riparte da dove era`() = runBlocking {
        val pc = PcFinto()
        val dati = ByteArray(Allegati.PEZZO_BYTE * 2) { 1 }
        pc.arrivati["tabcdef125"] = ByteArrayOutputStream().apply { write(dati, 0, Allegati.PEZZO_BYTE) }
        val e = Invio.manda(pc, sorgente(dati), chat, "", "tabcdef125", attendi = {})
        assertTrue(e is EsitoInvio.Arrivato)
        assertEquals(1, pc.pezzi)
        assertArrayEquals(dati, pc.arrivati["tabcdef125"]!!.toByteArray())
    }

    @Test
    fun `rifiuti - chat protetta 423, nome con un percorso 400, troppo grande prima di partire`() = runBlocking {
        val protetta = Invio.manda(PcFinto(rispostaInizia = 423, messaggio = "Chat protetta: inserisci il PIN."), sorgente(ByteArray(3)), chat, "", "tabcdef126", attendi = {})
        assertEquals(423, (protetta as EsitoInvio.Rifiutato).codice)
        assertTrue(protetta.messaggio.startsWith("Chat protetta: inserisci il PIN"))
        val traversal = Invio.manda(PcFinto(rispostaInizia = 400, messaggio = "Il nome contiene un percorso"), sorgente(ByteArray(3), "../../x.txt"), chat, "", "tabcdef127", attendi = {})
        assertEquals(400, (traversal as EsitoInvio.Rifiutato).codice)
        val pc = PcFinto()
        val grande = Invio.manda(pc, SorgenteFile("video.mp4", Allegati.MAX_BYTE + 1, null) { ByteArrayInputStream(ByteArray(0)) }, chat, "", "tabcdef128", attendi = {})
        assertEquals(413, (grande as EsitoInvio.Rifiutato).codice)
        assertNull(pc.ultimaInizia)
    }

    @Test
    fun `l'autopilota riceve il suo id, non quello di una chat`() = runBlocking {
        val pc = PcFinto()
        Invio.manda(pc, sorgente(ByteArray(5)), DestinazioneFile("autopilota", "a-1", "Rilascio"), "", "tabcdef129", attendi = {})
        assertEquals("a-1", pc.ultimaInizia!!["autopilota"]!!.jsonPrimitive.content)
        assertNull(pc.ultimaInizia!!["chat"])
    }
}
