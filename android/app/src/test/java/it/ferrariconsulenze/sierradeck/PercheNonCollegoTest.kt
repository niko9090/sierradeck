package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * App 2.75.1: quando non si collega a nessun PC, il motivo probabile e il
 * rimedio. Il 14/10 la causa vera era Tailscale spento sul telefono.
 */
class PercheNonCollegoTest {
    private val spento = ReteTelefono(vpn = false, indirizzoTailscale = false, wifi = false)
    private val casa = ReteTelefono(vpn = false, indirizzoTailscale = false, wifi = true)
    private val conTailscale = ReteTelefono(vpn = true, indirizzoTailscale = true, wifi = false)

    @Test
    fun `PC solo su Tailscale e Tailscale spento sul telefono - Apri Tailscale`() {
        val d = PercheNonCollego.diagnosi(spento, listOf("http://100.64.0.20:47640"), false, emptyList())
        assertEquals(CasoNonCollego.TAILSCALE_SPENTO, d.caso)
        assertEquals("Tailscale è spento su questo telefono", d.titolo)
        assertEquals("apri-tailscale", d.azione)
        // Anche sul wifi di casa: il PC salvato è solo su Tailscale.
        assertEquals(CasoNonCollego.TAILSCALE_SPENTO, PercheNonCollego.diagnosi(casa, listOf("100.64.0.20"), false, emptyList()).caso)
    }

    @Test
    fun `PC sulla rete di casa e telefono con i dati mobili - fuori casa`() {
        val d = PercheNonCollego.diagnosi(spento, listOf("http://192.168.1.20:47640", "http://100.64.0.20:47640"), false, emptyList())
        assertEquals(CasoNonCollego.FUORI_CASA, d.caso)
        assertEquals("Non sei sulla rete di casa: accendi Tailscale", d.titolo)
        assertEquals("apri-tailscale", d.azione)
        assertTrue(d.dettagli.contains("dati mobili"))
    }

    @Test
    fun `il PC risponde ma rifiuta la chiave - Riprova e il punto interrogativo per ricollegare`() {
        val d = PercheNonCollego.diagnosi(conTailscale, listOf("100.64.0.20"), chiaveRifiutata = true, provate = emptyList())
        assertEquals(CasoNonCollego.CHIAVE, d.caso)
        assertEquals("Il PC risponde ma non riconosce questo telefono", d.titolo)
        assertEquals("riprova", d.azione)
        assertTrue(d.dettagli.contains("codice QR"))
    }

    @Test
    fun `Tailscale acceso o wifi di casa e nessuna risposta - Nessun PC risponde, con cosa ho provato`() {
        val d = PercheNonCollego.diagnosi(conTailscale, listOf("192.168.1.20", "100.64.0.20"), false, listOf("rete di casa 192.168.1.20", "Tailscale 100.64.0.20"))
        assertEquals(CasoNonCollego.NESSUNA_RISPOSTA, d.caso)
        assertEquals("Nessun PC risponde", d.titolo)
        assertTrue(d.dettagli.contains("Ho provato: rete di casa 192.168.1.20; Tailscale 100.64.0.20."))
        assertTrue(d.dettagli.contains("Tailscale sul telefono è acceso"))
        // Sul wifi con il PC su rete di casa e Tailscale: non si accusa la rete.
        assertEquals(CasoNonCollego.NESSUNA_RISPOSTA, PercheNonCollego.diagnosi(casa, listOf("192.168.1.20", "100.64.0.20"), false, emptyList()).caso)
    }

    @Test
    fun `Tailscale acceso basta a una VPN o a un indirizzo 100 punto x`() {
        assertTrue(ReteTelefono(vpn = true, indirizzoTailscale = false, wifi = false).tailscaleAcceso)
        assertTrue(ReteTelefono(vpn = false, indirizzoTailscale = true, wifi = false).tailscaleAcceso)
        assertEquals(CasoNonCollego.NESSUNA_RISPOSTA, PercheNonCollego.diagnosi(conTailscale, listOf("100.64.0.20"), false, emptyList()).caso)
    }
}
