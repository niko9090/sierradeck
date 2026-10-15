package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PC 0.72.0: la chat governata da un autopilota sta sempre in un riquadro del
 * suo workspace; il sottofondo solo se Nicholas lo chiede. L'app legge
 * l'interruttore dal dettaglio e lo cambia con /api/autopilota/sottofondo; le
 * chat in sottofondo restano con «in sottofondo» e Guarda (0.69.0).
 */
class SottofondoSoloSuRichiestaTest {
    @Test
    fun `l'interruttore acceso arriva dal dettaglio`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """{"id":"ap-1","stato":"lavoro","sottofondo":true}""")
        assertEquals(true, d.sottofondo)
    }

    @Test
    fun `assente vale spento, anche con un PC vecchio`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """{"id":"ap-1","stato":"lavoro"}""")
        assertNull(d.sottofondo)
        assertTrue(d.sottofondo != true)
    }
}
