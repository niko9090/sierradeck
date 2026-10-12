package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** PC 0.70: lo stato di un autopilota in una parola, deciso dal PC. */
class VistaAutopilotaTest {
    @Test
    fun `la vista del PC si legge, e la riga sotto dice da quanto e i criteri`() {
        val a = Api.json.decodeFromString(AutopilotaBreve.serializer(), """{"id":"ap-1","nome":"Riordina","stato":"fallito","vista":{"stato":{"id":"guasto","parola":"guasto","colore":"rosso","ragione":"x"},"criteri":{"fatti":1,"totali":2,"testo":"1/2"},"ultima":"ho provato","da":"6 min","azione":"riprendi"}}""")
        assertEquals("guasto", a.vista?.stato?.parola)
        assertEquals("da 6 min · criteri 1/2", sottoAutopilota(a.vista!!))
        // Un PC di prima: niente vista, l'app usa le sue parole come prima.
        assertNull(Api.json.decodeFromString(AutopilotaBreve.serializer(), """{"id":"ap-2","stato":"lavoro"}""").vista)
    }
}
