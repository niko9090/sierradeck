package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.nio.file.Files
import it.ferrariconsulenze.sierradeck.nucleo.Allegati
import it.ferrariconsulenze.sierradeck.nucleo.DestinazioneFile
import it.ferrariconsulenze.sierradeck.nucleo.EsitoInvio
import it.ferrariconsulenze.sierradeck.nucleo.Invio
import it.ferrariconsulenze.sierradeck.nucleo.Scaricatore
import it.ferrariconsulenze.sierradeck.nucleo.SorgenteFile
import it.ferrariconsulenze.sierradeck.nucleo.Trasporto
import it.ferrariconsulenze.sierradeck.rete.Api

/** Invii e scaricamenti che non devono girare a vuoto né dire «fatto» a metà. */
class FileSenzaFineTest {
    private val chat = DestinazioneFile("chat", "c-1", "Prova")

    @Test
    fun `un file che si accorcia durante l invio si ferma con un motivo, non gira all infinito`() = runBlocking {
        var chiamate = 0
        val t = object : Trasporto {
            override suspend fun chiama(percorso: String, corpo: JsonObject): String {
                chiamate += 1
                check(chiamate < 50) { "gira a vuoto" }
                return if (percorso.endsWith("/inizia")) """{"ricevuti":0}""" else """{"ricevuti":0}"""
            }
        }
        // Dichiara 1000 byte ma il flusso ne ha 0.
        val s = SorgenteFile("a.txt", 1000, null) { ByteArrayInputStream(ByteArray(0)) }
        val e = Invio.manda(t, s, chat, "", "tprova1", attendi = {})
        assertTrue(e is EsitoInvio.Rifiutato)
        assertEquals(422, (e as EsitoInvio.Rifiutato).codice)
        assertEquals(Allegati.TESTO_FILE_CAMBIATO, e.messaggio)
    }

    @Test
    fun `un 409 che non fa avanzare non si ripete per sempre`() = runBlocking {
        var chiamate = 0
        val t = object : Trasporto {
            override suspend fun chiama(percorso: String, corpo: JsonObject): String {
                chiamate += 1
                check(chiamate < 100) { "gira a vuoto" }
                if (percorso.endsWith("/inizia")) return """{"ricevuti":0}"""
                throw Api.Errore(409, """{"errore":"fuori posto","ricevuti":0}""")
            }
        }
        val s = SorgenteFile("a.txt", 10, null) { ByteArrayInputStream(ByteArray(10)) }
        val e = Invio.manda(t, s, chat, "", "tprova2", attendi = {})
        assertTrue(e is EsitoInvio.Rifiutato)
        assertEquals(0, (e as EsitoInvio.Rifiutato).codice)
    }

    @Test
    fun `lo scaricamento che si ferma a metà non è fatto e conserva quanto arrivato`() = runBlocking {
        val parte = java.io.File(Files.createTempDirectory("sd-meta-").toFile(), "x.part")
        // Il PC dice 100 byte ma dopo 40 manda dati vuoti.
        val e = Scaricatore.scarica(parte, { da -> (if (da == 0L) ByteArray(40) else ByteArray(0)) to 100L }, attendi = {})
        assertTrue(e is Scaricatore.Esito.Fallito)
        assertEquals(0, (e as Scaricatore.Esito.Fallito).codice)
        assertEquals(40L, parte.length())
    }

    @Test
    fun `un file vuoto si scarica come fatto`() = runBlocking {
        val parte = java.io.File(Files.createTempDirectory("sd-vuoto-").toFile(), "v.part")
        val e = Scaricatore.scarica(parte, { ByteArray(0) to 0L }, attendi = {})
        assertTrue(e is Scaricatore.Esito.Fatto)
    }
}
