package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Le parole di stato nelle righe strette (0.43.0): brevi sotto i 380 dp, intere sopra. */
class ParolaRigaTest {
    @Test
    fun `sotto i 380 dp la parola e breve, sopra resta intera`() {
        val guidata = leggiChat(chiede = false, aspetta = false, governata = true, viva = true)
        assertEquals("al lavoro · la guida un autopilota", parolaPerRiga(guidata, 420))
        assertEquals("lavora · AP", parolaPerRiga(guidata, 330))
        assertEquals("ferma · AP", parolaPerRiga(leggiChat(chiede = false, aspetta = true, governata = true, viva = true), 330))
        assertEquals("scegli tu", parolaPerRiga(leggiChat(chiede = true, aspetta = false, governata = false, viva = true), 330))
    }

    @Test
    fun `ogni parola breve sta in dodici lettere`() {
        for (chiede in listOf(true, false)) for (aspetta in listOf(true, false)) for (governata in listOf(true, false)) for (viva in listOf(true, false)) {
            val p = parolaPerRiga(leggiChat(chiede, aspetta, governata, viva), 320)
            assertTrue(p, p.length <= 12)
        }
    }
}
