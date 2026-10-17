package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PC 0.79.0: il riassunto «Al lavoro» accanto alla conversazione e le righe
 * corte dei traguardi, sui casi scritti dal PC con le sue funzioni vere
 * (`tests/shared/panoramica-al-lavoro.test.ts`).
 */
class PanoramicaAlLavoroTest {
    private val casi: JsonObject = Api.json.parseToJsonElement(
        javaClass.classLoader!!.getResource("panoramica/al-lavoro-0.79.json")!!.readText()
    ).jsonObject

    @Test
    fun `il riassunto arriva dal PC e si legge com'e'`() {
        val p = Api.json.decodeFromString(Panoramica.serializer(), casi["panoramica"]!!.toString())
        val righe = p.alLavoro!!
        assertEquals(3, righe.size)
        assertTrue(righe.first().aspettaTe)
        assertEquals(casi["titolo"]!!.jsonPrimitive.content, RegolePanoramica.titoloAlLavoro(righe))
        assertEquals(casi["sotto"]!!.jsonArray.map { it.jsonPrimitive.content }, righe.map { RegolePanoramica.sottoAlLavoro(it) })
    }

    @Test
    fun `le ore nell'ora del telefono, con la Z o con l'offset`() {
        val z = "2026-10-18T09:10:00.000Z"
        val atteso = java.time.Instant.parse(z).atZone(java.time.ZoneId.systemDefault()).toLocalTime().toString().take(5)
        assertEquals(atteso, oraLocale(z))
        assertEquals(atteso, oraLocale("2026-10-18T11:10:00+02:00"))
        assertEquals("", oraLocale("non è un'ora"))
        assertEquals("", oraLocale(null))
    }

    @Test
    fun `un PC piu' vecchio non manda il riassunto`() {
        assertEquals(null, Api.json.decodeFromString(Panoramica.serializer(), "{\"workspace\":\"w\",\"schede\":[]}").alLavoro)
    }

    @Test
    fun `le righe corte dei traguardi restano nella conversazione, le tecniche in Cosa e' successo`() {
        val battute = Api.json.decodeFromString(ListSerializer(Battuta.serializer()), casi["battute"]!!.toString())
        val (messaggi, eventi) = RegolePanoramica.separaConversazione(battute)
        assertEquals(casi["messaggi"]!!.jsonArray.map { it.jsonPrimitive.content }, messaggi.map { it.testo })
        assertEquals(casi["eventi"]!!.jsonArray.map { it.jsonPrimitive.content }, eventi.map { it.testo })
        assertTrue(messaggi.any { it.tono == "traguardo" })
    }
}
