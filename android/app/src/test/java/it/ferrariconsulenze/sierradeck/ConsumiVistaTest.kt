package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/** PC 0.70: il contesto di una chat con la sua parola, decisa dal PC. */
class ConsumiVistaTest {
    @Test
    fun `la parola del PC prima del contesto, e senza parola come prima`() {
        val c = Api.json.decodeFromString(ChatConsumo.serializer(), """{"sessione":"s1","titolo":"Lavoro","contestoEtichetta":"92% · 184k di 200k token","vista":{"id":"riassumi","parola":"riassumi","colore":"rosso"}}""")
        assertEquals("Lavoro: riassumi · 92% · 184k di 200k token", rigaContesto(c))
        assertEquals("Lavoro: contesto non ancora letto", rigaContesto(ChatConsumo(sessione = "s1", titolo = "Lavoro")))
    }
}
