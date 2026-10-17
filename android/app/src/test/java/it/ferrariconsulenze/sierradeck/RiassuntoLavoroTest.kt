package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il riassunto della dashboard dell'autopilota (PC 0.79.0) sui casi scritti dal
 * PC con le sue funzioni vere (`tests/shared/riassunto-lavoro.test.ts`): le
 * righe come arrivano in `/api/panoramica`, gli stessi testi.
 */
class RiassuntoLavoroTest {
    private val casi: JsonObject = Api.json.parseToJsonElement(
        javaClass.classLoader!!.getResource("riassunto/lavoro-0.79.json")!!.readText()
    ).jsonObject
    private val ora = casi["ora"]!!.jsonPrimitive.long
    private val righe: List<RigaLavoro> = casi["righe"]!!.jsonArray.map { Api.json.decodeFromJsonElement(RigaLavoro.serializer(), it) }

    @Test
    fun `i testi fissi sono quelli del PC`() {
        val t = casi["testiFissi"]!!.jsonObject
        assertEquals(t["titolo"]!!.jsonPrimitive.content, RegoleRiassunto.TITOLO)
        assertEquals(t["vuoto"]!!.jsonPrimitive.content, RegoleRiassunto.VUOTO)
        assertEquals(t["aspettaTe"]!!.jsonPrimitive.content, RegoleRiassunto.ASPETTA_TE)
        assertEquals(t["aiuto"]!!.jsonPrimitive.content, RegoleRiassunto.AIUTO)
    }

    @Test
    fun `ogni riga si legge come sul PC`() {
        val attesi = casi["testi"]!!.jsonArray.map { it.jsonPrimitive.content }
        assertEquals(attesi, righe.map { RegoleRiassunto.testo(it, ora) })
    }

    @Test
    fun `il simbolo dice lo stato anche senza i colori, come sul PC`() {
        val attesi = casi["simboli"]!!.jsonArray.map { it.jsonPrimitive.content }
        assertEquals(attesi, righe.map { RegoleRiassunto.simbolo(it) })
        // Un PC della prima 0.79.0 senza «lavora»: la riga lavora.
        assertEquals("●", RegoleRiassunto.simbolo(Api.json.decodeFromString(RigaLavoro.serializer(), """{"id":"c-1"}""")))
    }

    @Test
    fun `sul telefono prima chi aspetta te, al più tre in vista`() {
        val (inVista, altre) = RegoleRiassunto.inVista(righe)
        assertEquals("Collaudo", inVista.first().nomeRuolo)
        assertTrue(inVista.first().aspettaTe)
        assertEquals(0, altre)
        val tante = (1..5).map { RigaLavoro(id = "c-$it", nomeRuolo = "Sviluppo", cosa = "lavora") }
        assertEquals(3 to 2, RegoleRiassunto.inVista(tante).let { it.first.size to it.second })
    }

    @Test
    fun `la Panoramica di un PC più vecchio senza «lavoro» si legge lo stesso`() {
        val p = Api.json.decodeFromString(Panoramica.serializer(), """{"workspace":"w","schede":[]}""")
        assertEquals(emptyList<RigaLavoro>(), p.lavoro)
        val nuova = Api.json.decodeFromString(Panoramica.serializer(), """{"workspace":"w","schede":[],"lavoro":[{"id":"c-1","nomeRuolo":"Sviluppo","cosa":"fa girare i test","aspettaTe":false,"chat":"p-1","campoNuovo":1}]}""")
        assertEquals("p-1", nuova.lavoro.single().chat)
    }
}
