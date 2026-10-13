package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** PC 0.70: la catena di Account e Drive che manda il PC in /api/account. */
class AccountCatenaTest {
    @Test
    fun `legge la catena e il prossimo passo`() {
        val a = Api.json.decodeFromString(Account.serializer(), """{"entrato":true,"email":"p@esempio.it","catena":{"tessere":[{"id":"account","titolo":"Account","vista":{"id":"entrato","parola":"entrato","colore":"verde"},"sotto":"p@esempio.it"},{"id":"drive","titolo":"Drive","vista":{"id":"scollegato","parola":"scollegato","colore":"rosso"}}],"prossimo":{"id":"connetti","testo":"Collega il Drive"}}}""")
        assertEquals(listOf("entrato", "scollegato"), a.catena?.tessere?.map { it.vista?.parola })
        assertEquals("Prossimo passo, sul computer: Collega il Drive", passoAccount(a))
    }

    @Test
    fun `un PC di prima senza catena non dice niente in più`() {
        val a = Api.json.decodeFromString(Account.serializer(), """{"entrato":true,"email":"p@esempio.it"}""")
        assertNull(a.catena)
        assertNull(passoAccount(a))
    }
}
