package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import it.ferrariconsulenze.sierradeck.nucleo.Battuta
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.nucleo.Panoramica

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
    fun `un PC piu' vecchio non manda il riassunto`() {
        assertEquals(null, Api.json.decodeFromString(Panoramica.serializer(), "{\"workspace\":\"w\",\"schede\":[]}").alLavoro)
    }

}
