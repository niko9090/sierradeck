package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.security.MessageDigest
import kotlin.random.Random

/**
 * La sezione File e i file dal PC al telefono (app 2.54.0), sulle risposte
 * di un computer alla 0.54.0 fatte dalle rotte vere su dati d'esempio
 * (`tests/shared/file-telefono-app.test.ts` controlla che siano le stesse).
 */
class FileTelefonoTest {
    private val fx: JsonObject = Api.json.parseToJsonElement(
        javaClass.classLoader!!.getResource("file/file-0.54.json")!!.readText()
    ).jsonObject

    private fun sha(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    private fun tmp(): File = Files.createTempDirectory("sd-file-").toFile()

    @Test
    fun `tipo di anteprima, MIME e grandezze - uguali al PC`() {
        for (r in fx["regole"]!!.jsonArray) {
            val o = r.jsonObject
            val nome = o["nome"]!!.jsonPrimitive.content
            assertEquals(nome, o["tipo"]!!.jsonPrimitive.content, FileVista.tipo(nome))
            assertEquals(nome, o["mime"]!!.jsonPrimitive.content, FileVista.mime(nome))
        }
        for (m in fx["misure"]!!.jsonArray) {
            val o = m.jsonObject
            assertEquals(o["testo"]!!.jsonPrimitive.content, FileVista.misura(o["byte"]!!.jsonPrimitive.long))
        }
    }

    @Test
    fun `le risposte del PC si leggono - progetti, cartelle, un pezzo di file, le consegne`() {
        val progetti = Api.json.decodeFromJsonElement(ProgettiFile.serializer(), fx["progetti"]!!)
        assertEquals(listOf("Esempio"), progetti.progetti.map { it.nome })
        val el = Api.json.decodeFromJsonElement(ElencoFile.serializer(), fx["elenco"]!!)
        assertEquals(listOf("src", "LEGGIMI.md"), el.voci.map { it.nome })
        assertTrue(el.voci[0].cartella)
        assertNull(el.su)
        val src = Api.json.decodeFromJsonElement(ElencoFile.serializer(), fx["elencoSrc"]!!)
        assertEquals("", src.su)
        assertEquals("src/index.ts", src.voci.single().percorso)
        val p = Api.json.decodeFromJsonElement(PezzoFile.serializer(), fx["leggi"]!!)
        assertEquals("export const x = 1\n", String(Scaricatore.decodifica(p.dati)))
        assertEquals(p.byte, Scaricatore.decodifica(p.dati).size.toLong())
        val c = Api.json.decodeFromJsonElement(Consegne.serializer(), fx["consegne"]!!).consegne.single()
        assertEquals("LEGGIMI.md", c.nome)
        assertEquals("chat", c.da)
        val pz = Api.json.decodeFromJsonElement(PezzoConsegna.serializer(), fx["pezzoConsegna"]!!)
        assertEquals(c.sha256, sha(Scaricatore.decodifica(pz.dati)))
        assertEquals("Hai ricevuto LEGGIMI.md (10 byte) da PC-ESEMPIO, chiesto dalla chat «Relazioni». Nota: da leggere", FileVista.testoNotifica(c))
    }

    /** Un PC finto: dà i pezzi di `dati`, e fa cadere la rete alle chiamate in `cade`. */
    private class PcFinto(val dati: ByteArray, val cade: Set<Int> = emptySet(), val rifiuto: Api.Errore? = null) {
        var chiamate = 0
        val chiesti = mutableListOf<Long>()
        suspend fun pezzo(da: Long): Pair<ByteArray, Long> {
            chiamate += 1
            chiesti += da
            rifiuto?.let { throw it }
            if (chiamate in cade) throw IOException("rete caduta")
            val fine = minOf(dati.size.toLong(), da + FileVista.PEZZO_BYTE).toInt()
            return dati.copyOfRange(da.toInt(), fine) to dati.size.toLong()
        }
    }

    @Test
    fun `scarica a pezzi - la rete cade, riprende da dov'era, l'impronta torna`() = runBlocking {
        val dati = Random(7).nextBytes(FileVista.PEZZO_BYTE * 3 + 11)
        val pc = PcFinto(dati, cade = setOf(2, 3))
        val attese = mutableListOf<Long>()
        val parte = File(tmp(), "a.part")
        val e = Scaricatore.scarica(parte, { pc.pezzo(it) }, sha(dati), attendi = { attese += it })
        assertTrue(e is Scaricatore.Esito.Fatto)
        assertTrue(parte.readBytes().contentEquals(dati))
        // Dopo la caduta si richiede lo stesso punto, non da capo.
        assertEquals(listOf(0L, FileVista.PEZZO_BYTE.toLong(), FileVista.PEZZO_BYTE.toLong(), FileVista.PEZZO_BYTE.toLong()), pc.chiesti.take(4))
        assertEquals(listOf(1000L, 4000L), attese)
    }

    @Test
    fun `l'app chiusa a metà - il giro dopo riparte dalla parte già scaricata`() = runBlocking {
        val dati = Random(3).nextBytes(FileVista.PEZZO_BYTE * 2 + 5)
        val parte = File(tmp(), "b.part")
        parte.writeBytes(dati.copyOfRange(0, FileVista.PEZZO_BYTE))
        val pc = PcFinto(dati)
        val e = Scaricatore.scarica(parte, { pc.pezzo(it) }, sha(dati))
        assertTrue(e is Scaricatore.Esito.Fatto)
        assertEquals(FileVista.PEZZO_BYTE.toLong(), pc.chiesti.first())
        assertTrue(parte.readBytes().contentEquals(dati))
    }

    @Test
    fun `rifiuti - annullato dal PC (410) si dice subito, l'impronta sbagliata butta la parte, la rete che non torna si arrende e tiene la parte`() = runBlocking {
        val annullato = Scaricatore.scarica(File(tmp(), "c.part"), { PcFinto(ByteArray(10), rifiuto = Api.Errore(410, """{"errore":"Il PC ha annullato l’invio di questo file."}""")).pezzo(it) })
        assertEquals(410, (annullato as Scaricatore.Esito.Fallito).codice)
        assertEquals("Il PC ha annullato l’invio di questo file.", annullato.messaggio)
        val parte = File(tmp(), "d.part")
        val sbagliata = Scaricatore.scarica(parte, { PcFinto(ByteArray(10) { 1 }).pezzo(it) }, "0".repeat(64))
        assertEquals(422, (sbagliata as Scaricatore.Esito.Fallito).codice)
        assertFalse(parte.exists())
        val dati = Random(5).nextBytes(FileVista.PEZZO_BYTE + 1)
        val viva = File(tmp(), "e.part")
        val sempreGiu = PcFinto(dati, cade = (2..100).toSet())
        val giu = Scaricatore.scarica(viva, { sempreGiu.pezzo(it) }, attendi = { })
        assertEquals(0, (giu as Scaricatore.Esito.Fallito).codice)
        // Quello che era arrivato resta: al ritorno della rete si riparte da lì.
        assertEquals(FileVista.PEZZO_BYTE.toLong(), viva.length())
    }

    @Test
    fun `anteprima di un testo lungo - si ferma al massimo`() = runBlocking {
        val dati = ByteArray((FileVista.ANTEPRIMA_TESTO_BYTE * 2).toInt()) { 'a'.code.toByte() }
        val parte = File(tmp(), "f.part")
        val e = Scaricatore.scarica(parte, { PcFinto(dati).pezzo(it) }, massimo = FileVista.ANTEPRIMA_TESTO_BYTE)
        assertTrue(e is Scaricatore.Esito.Fatto)
        assertTrue(parte.length() >= FileVista.ANTEPRIMA_TESTO_BYTE && parte.length() < FileVista.ANTEPRIMA_TESTO_BYTE + FileVista.PEZZO_BYTE)
    }

    @Test
    fun `nomi salvati sul telefono - mai fuori dalla cartella, mai sopra un altro`() {
        assertEquals("passwd", FileVista.nomeSicuro("../../etc/passwd"))
        assertEquals("win.ini", FileVista.nomeSicuro("..\\..\\Windows\\win.ini"))
        assertEquals("file", FileVista.nomeSicuro(".."))
        assertEquals("a_b.txt", FileVista.nomeSicuro("a:b.txt"))
        val ci = setOf("foto.jpg", "foto (2).jpg")
        assertEquals("foto (3).jpg", FileVista.nomeLibero("foto.jpg") { it in ci })
        assertEquals("nuovo.md", FileVista.nomeLibero("nuovo.md") { it in ci })
        assertEquals(listOf("Esempio" to "", "src" to "src", "main" to "src/main"), FileVista.briciole("Esempio", "src/main"))
    }

    @Test
    fun `il PIN - un progetto chiuso dice quale chat sbloccare`() {
        val r = FileVista.rifiutoPin(Api.Errore(423, """{"errore":"Progetto protetto: la chat «Riservata» di questo progetto ha il PIN.","pin":"chiusa","chat":"p-2"}"""))
        assertEquals("p-2", r?.chat)
        assertTrue(r!!.errore.startsWith("Progetto protetto"))
        assertNull(FileVista.rifiutoPin(Api.Errore(403, "{}")))
        assertNull(FileVista.rifiutoPin(IOException("giù")))
    }

    @Test
    fun `carica in una cartella - il PC riceve progetto e cartella, non una chat`() = runBlocking {
        val visti = mutableListOf<Pair<String, JsonObject>>()
        val t = object : Trasporto {
            override suspend fun chiama(percorso: String, corpo: JsonObject): String {
                visti += percorso to corpo
                return when (percorso) {
                    "/api/allegati/inizia" -> """{"ricevuti":0,"pezzo":98304}"""
                    "/api/allegati/pezzo" -> """{"ricevuti":${corpo["da"]!!.jsonPrimitive.long + 3}}"""
                    else -> """{"arrivato":true,"nome":"a.txt","percorso":"docs/a.txt"}"""
                }
            }
        }
        val s = SorgenteFile("a.txt", 3, null) { "abc".byteInputStream() }
        val e = Invio.manda(t, s, DestinazioneFile("cartella", "C:\\Progetti\\Esempio", "Esempio", cartella = "docs"), "", "carica-0001")
        assertEquals("docs/a.txt", (e as EsitoInvio.Arrivato).percorso)
        val inizio = visti.first { it.first == "/api/allegati/inizia" }.second
        assertEquals("C:\\Progetti\\Esempio", inizio["progetto"]?.jsonPrimitive?.contentOrNull)
        assertEquals("docs", inizio["cartella"]?.jsonPrimitive?.contentOrNull)
        assertNull(inizio["chat"])
    }

    @Test
    fun `le rotte nuove passano dal ponte, e un PC di prima spegne la sezione con la spiegazione`() {
        for (r in listOf("/api/file/progetti", "/api/file/elenco", "/api/file/leggi", "/api/consegne", "/api/consegne/pezzo", "/api/consegne/ricevuta")) assertTrue(r, r in Ponte.ROTTE)
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.FILE, "0.53.0"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.FILE, "0.54.0"))
        assertEquals("La sezione File e i file dal PC al telefono arriva aggiornando PC-ESEMPIO alla 0.54.0.", FunzioniPc.testoMancante(FunzionePc.FILE, "PC-ESEMPIO"))
        assertTrue(fx["regole"] is JsonArray)
    }
}
