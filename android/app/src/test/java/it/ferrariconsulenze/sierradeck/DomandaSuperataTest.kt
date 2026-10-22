package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Una domanda chiusa perché non serve più (PC 0.84.1): nessuno ha risposto.
 * Arriva come `superata` con il motivo, non come `risposta`, così l'app non
 * scrive «risposta dall'autopilota» sotto una domanda a cui non ha risposto nessuno.
 */
class DomandaSuperataTest {

    @Test
    fun `la scheda di una domanda superata porta il motivo e nessuna risposta`() {
        val json = """{"chi":"App Android","domanda":"Pubblico adesso la 0.81.1?","superata":"la 0.81.1 è già pubblicata"}"""
        val s = Api.json.decodeFromString(SchedaDomanda.serializer(), json)
        assertNull(s.risposta)
        assertEquals("la 0.81.1 è già pubblicata", s.superata)
    }

    @Test
    fun `un PC di prima senza il campo si legge come prima`() {
        val json = """{"chi":"App Android","domanda":"Uso la porta 8080?","risposta":"Sì, usa la 8080."}"""
        val s = Api.json.decodeFromString(SchedaDomanda.serializer(), json)
        assertEquals("Sì, usa la 8080.", s.risposta)
        assertNull(s.superata)
    }
}
