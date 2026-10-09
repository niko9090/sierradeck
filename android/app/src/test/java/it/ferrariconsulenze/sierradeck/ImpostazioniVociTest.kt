package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Le impostazioni rifatte (app 2.56.0): la struttura è quella che il PC
 * scrive in `assets/impostazioni.json`; la ricerca dell'app deve trovare le
 * stesse voci della ricerca del PC, sugli stessi casi (`casi` nel file).
 */
class ImpostazioniVociTest {
    private val testo = File("src/main/assets/impostazioni.json").readText()
    private val s = ImpostazioniVoci.da(testo)

    @Test
    fun `Aggiornamenti in cima, poi le sezioni per argomento, ognuna con la sua spiegazione`() {
        assertEquals(listOf("Aggiornamenti", "Computer", "Chat e autopiloti", "Drive e salvataggi", "Aspetto", "Notifiche", "Info e aiuto"), s.sezioni.map { it.titolo })
        for (v in s.voci) assertTrue(v.id, v.spiega.length > 60)
        assertEquals("aggiornamenti", ImpostazioniVoci.cerca(s, "", "app").first().sezione)
    }

    @Test
    fun `la ricerca dell'app trova le stesse voci del PC`() {
        val casi = Api.json.parseToJsonElement(testo).jsonObject["casi"]!!.jsonArray
        assertTrue(casi.size > 20)
        for (c in casi) {
            val o = c.jsonObject
            val q = o["q"]!!.jsonPrimitive.content
            val dove = o["dove"]!!.jsonPrimitive.content
            val attese = o["trovate"]!!.jsonArray.map { it.jsonPrimitive.content }
            assertEquals("«$q» in $dove", attese, ImpostazioniVoci.cerca(s, q, dove).map { it.id })
        }
    }

    @Test
    fun `senza accenti e maiuscole, e le sezioni da mostrare`() {
        assertEquals("novita e", ImpostazioniVoci.normalizza("Novità È"))
        assertEquals(setOf("notifiche"), ImpostazioniVoci.sezioniVisibili(s, "controllo continuo"))
        assertTrue(ImpostazioniVoci.sezioniVisibili(s, "parola che non c'è").isEmpty())
    }

    @Test
    fun `copia i dettagli - versioni e collegamento, niente chiavi`() {
        val l = Linea.passo(Linea.NUOVA, EventoLinea.Ok(0, 40, "lan"))
        val t = Dettagli.testo("2.56.0", 100, "PC-ESEMPIO", "0.56.0", l, 1000)
        assertTrue(t.contains("App: 2.56.0 (codice 100)"))
        assertTrue(t.contains("Computer: PC-ESEMPIO, SierraDeck 0.56.0"))
        assertTrue(t.contains("Collegamento: collegato, strada rete di casa"))
        assertTrue(!t.contains("chiave", ignoreCase = true) || t.contains("Non ci sono chiavi"))
    }
}
