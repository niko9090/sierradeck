package it.glos.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La regola che decide se l'app apre un indirizzo.
 *
 * Esiste perché la stessa regola, scritta in `network-security-config`, non
 * corrispondeva a niente: le eccezioni erano nomi di dominio che nessun
 * indirizzo poteva soddisfare, restava il divieto, e l'app non riusciva ad
 * aprire né la rete di casa né la VPN. Un difetto muto, che si è visto solo
 * come «il computer non risponde».
 */
class IndirizziTest {

    @Test
    fun `la rete di casa va bene`() {
        assertTrue(Indirizzi.privato("192.168.1.7"))
        assertTrue(Indirizzi.privato("10.0.0.42"))
        assertTrue(Indirizzi.privato("172.16.5.1"))
        assertTrue(Indirizzi.privato("172.31.255.254"))
    }

    @Test
    fun `la VPN a maglia va bene, ed e meta del motivo per cui l app esiste`() {
        // Tailscale e ZeroTier vivono in 100.64-100.127: da fuori sembra
        // Internet, ma è una rete privata dentro un tunnel cifrato.
        assertTrue(Indirizzi.privato("100.64.0.1"))
        assertTrue(Indirizzi.privato("100.101.102.103"))
        assertTrue(Indirizzi.privato("100.127.255.254"))
    }

    @Test
    fun `internet no`() {
        // Ci si parlerebbe in chiaro, attraverso Internet, e il computer di
        // casa non sta lì.
        assertFalse(Indirizzi.privato("8.8.8.8"))
        assertFalse(Indirizzi.privato("100.63.0.1"))
        assertFalse(Indirizzi.privato("100.128.0.1"))
        assertFalse(Indirizzi.privato("172.15.0.1"))
        assertFalse(Indirizzi.privato("172.32.0.1"))
        assertFalse(Indirizzi.privato("193.168.1.1"))
    }

    @Test
    fun `quello che non e un indirizzo non passa`() {
        assertFalse(Indirizzi.privato("esempio.it"))
        assertFalse(Indirizzi.privato("192.168.1"))
        assertFalse(Indirizzi.privato("192.168.1.999"))
        assertFalse(Indirizzi.privato(""))
        // Tranne il computer stesso, che serve a chi prova l'app in locale.
        assertTrue(Indirizzi.privato("localhost"))
    }

    @Test
    fun `trova l host dentro un indirizzo completo`() {
        assertEquals("192.168.1.7", Indirizzi.hostDi("http://192.168.1.7:47640"))
        assertEquals("192.168.1.7", Indirizzi.hostDi("192.168.1.7"))
        assertEquals("100.64.0.1", Indirizzi.hostDi("http://100.64.0.1:47640/#codice=123456"))
    }

    @Test
    fun `un indirizzo di casa completo e accettabile`() {
        assertTrue(Indirizzi.accettabile("http://192.168.1.7:47640"))
        assertTrue(Indirizzi.accettabile("http://100.64.0.1:47640"))
        assertFalse(Indirizzi.accettabile("http://93.184.216.34:47640"))
    }
}
