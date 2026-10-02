package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * «Le domande sono tutte tagliate» (Nicholas, 02/10, 0.39.1): una domanda di
 * 3000 caratteri su piu' righe arriva intera dal computer fino a quello che
 * l'app mostra, nella linguetta «Domande» e nelle conversazioni.
 */
class DomandeIntereTest {

    private val lunga = (1..30).joinToString("\n") { "Riga $it: ${"parola ".repeat(13)}fine riga $it." }
    /** Come la scrive il computer nel JSON: virgolette, a capo e accenti escapati. */
    private val inJson = JsonPrimitive(lunga).toString()

    @Test
    fun `la misura e quella di una domanda lunga vera`() {
        assertTrue(lunga.length >= 3000)
        assertEquals(30, lunga.lines().size)
    }

    @Test
    fun `nella linguetta Domande arriva intera, con i suoi a capo`() {
        val json = """{"id":"ap-1","nome":"App Android","obiettivo":"o","domandeScheda":[{"chiave":"d:d1","tipo":"domanda","idDomanda":"d1","testo":$inJson,"opzioni":[],"origine":"lavoro"}]}"""
        val det = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), json)
        val d = det.domandeScheda.single()
        assertEquals(lunga, d.testo)
        assertEquals(lunga.lines(), d.testo.lines())
    }

    @Test
    fun `nelle conversazioni e nella vista di prima arriva intera`() {
        val json = """{"voci":[{"tipo":"autopilota","id":"d1","autopilotaId":"ap-1","autopilota":"App Android","origine":"lavoro","testo":$inJson}],
            "conversazioni":[{"chiave":"ap:ap-1","tipo":"autopilota","titolo":"App Android","chiede":true,
              "messaggi":[{"da":"lui","testo":$inJson,"tono":"domanda"}],"risposta":{"via":"rispondi","domanda":"d1"}}]}"""
        val dom = Api.json.decodeFromString(Domande.serializer(), json)
        assertEquals(lunga, dom.voci.single().testo)
        assertEquals(lunga, dom.conversazioni.single().messaggi.single().testo)
    }

    @Test
    fun `la linguetta Domande ha piu posto, e oltre scorre`() {
        assertEquals(420, altezzaLinguetta("domande"))
        assertEquals(260, altezzaLinguetta("file"))
        assertEquals(260, altezzaLinguetta(null))
    }
}
