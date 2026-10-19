package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 2.80.0: con l'app dietro i controlli delle schermate chiedevano al PC ogni 2 s. */
class DavantiTest {
    @After fun rimetti() = Davanti.imposta(true)

    @Test fun `con l app dietro il controllo aspetta, e riparte quando torna davanti`() = runBlocking {
        var giri = 0
        Davanti.imposta(true)
        val ciclo = launch {
            while (true) {
                giri += 1
                Davanti.pausa(10)
            }
        }
        delay(120)
        Davanti.imposta(false)
        delay(40)
        val fermo = giri
        delay(200)
        assertEquals("dietro: nessun giro in più", fermo, giri)
        Davanti.imposta(true)
        withTimeout(2000) { while (giri == fermo) delay(5) }
        ciclo.cancel()
    }

    @Test fun `davanti la pausa è un semplice delay`() = runBlocking {
        Davanti.imposta(true)
        val inizio = System.currentTimeMillis()
        withTimeout(2000) { Davanti.pausa(20) }
        assertTrue(System.currentTimeMillis() - inizio >= 20)
    }
}
