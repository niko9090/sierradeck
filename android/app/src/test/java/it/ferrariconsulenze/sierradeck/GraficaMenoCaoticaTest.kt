package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Grafica meno caotica (0.82.0), come sul PC e sulla pagina: niente «Adesso ·
 * 0» sotto «Al lavoro · 0», niente «fermo» ripetuto sotto la testata.
 */
class GraficaMenoCaoticaTest {
    @Test
    fun adessoVuotoNonSiMostraSeCeAlLavoro() {
        assertFalse(RegolePanoramica.mostraAdesso(0, conAlLavoro = true))
        assertTrue(RegolePanoramica.mostraAdesso(2, conAlLavoro = true))
        // Un PC della 0.78 non manda «Al lavoro»: «Adesso» resta, anche vuoto.
        assertTrue(RegolePanoramica.mostraAdesso(0, conAlLavoro = false))
    }

    @Test
    fun rigaDalVivoSenzaLaParolaDelloStato() {
        val v = StatoDalVivo(etichetta = "fermo", da = "22 min", ultimaAzione = "ha adottato una chat")
        assertEquals("ha adottato una chat · da 22 min", RegolePanoramica.rigaDalVivoSenzaStato(v))
        assertEquals("da 3 min · ⚠ nessun segno da 10 min", RegolePanoramica.rigaDalVivoSenzaStato(StatoDalVivo("al lavoro", "3 min", "", "nessun segno da 10 min")))
        assertEquals("", RegolePanoramica.rigaDalVivoSenzaStato(StatoDalVivo(etichetta = "fermo")))
    }
}
