package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * L'ultima installazione sul computer non e' riuscita (0.39.2): l'app lo
 * legge dallo stato dell'aggiornamento e lo dice, anche dentro «Installa».
 */
class TentativoFallitoTest {

    private val json = """{"fase":"pronto","versione":"0.39.1","tentativoFallito":{"versione":"0.39.0","da":"0.38.2","quando":"2026-10-02T09:32:21Z",
        "titolo":"Ho provato a installare la 0.39.0 alle 11:32, ma sei ancora sulla 0.38.2.",
        "motivo":"Il motivo più probabile è una protezione di Windows (Smart App Control o l’antivirus).",
        "strade":["Scaricala a mano","Riprova da «Installa»","La firma del codice: la decide Nicholas"],
        "pagina":"https://github.com/niko9090/sierradeck/releases/tag/v0.39.0"},"campoNuovo":1}"""

    private val a = Api.json.decodeFromString(Aggiornamento.serializer(), json)

    @Test
    fun `arriva dallo stato dell aggiornamento`() {
        val f = a.tentativoFallito!!
        assertEquals("0.39.0", f.versione)
        assertEquals("0.38.2", f.da)
        assertEquals(3, f.strade.size)
    }

    @Test
    fun `il testo dice cosa, perche e le strade numerate`() {
        val t = testoTentativoFallito(a.tentativoFallito!!)
        assertTrue(t.startsWith("Ho provato a installare la 0.39.0"))
        assertTrue(t.contains("Smart App Control"))
        assertTrue(t.contains("\nCosa puoi fare:\n1. Scaricala a mano\n2. Riprova"))
        assertTrue(t.contains("3. La firma del codice"))
    }

    @Test
    fun `dentro Installa sta davanti alle note, e senza tentativo non cambia niente`() {
        val n = NoteAggiornamento(versione = "0.39.1", avviso = "GitHub non risponde.")
        val con = conTentativoFallito(n, a.tentativoFallito)
        assertTrue(con.avviso!!.startsWith("Ho provato a installare la 0.39.0"))
        assertTrue(con.avviso!!.contains("https://github.com/niko9090/sierradeck/releases/tag/v0.39.0"))
        assertTrue(con.avviso!!.endsWith("GitHub non risponde."))
        assertEquals(n, conTentativoFallito(n, null))
    }

    @Test
    fun `un computer vecchio non lo manda`() {
        assertNull(Api.json.decodeFromString(Aggiornamento.serializer(), """{"fase":"pronto"}""").tentativoFallito)
    }
}
