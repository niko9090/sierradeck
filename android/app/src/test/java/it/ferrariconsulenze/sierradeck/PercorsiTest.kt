package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import it.ferrariconsulenze.sierradeck.rete.Percorsi
import it.ferrariconsulenze.sierradeck.schermate.vecchie.chiave

/**
 * La scelta della strada verso il PC (k-50): sulla stessa WiFi senza VPN si usa
 * l'indirizzo di casa, fuori casa Tailscale. Indirizzi di esempio (documentazione),
 * mai quelli di una rete vera.
 */
class PercorsiTest {

    private val casa = "http://192.168.10.5:47640"
    private val altraCasa = "http://10.20.30.40:47640"
    private val vpn = "http://100.100.1.2:47640"

    @Test
    fun `la rete di casa viene prima di Tailscale`() {
        val c = Percorsi.candidati(vpn, listOf(casa), emptyList(), null)
        assertEquals(listOf(casa, vpn), c)
    }

    @Test
    fun `salvato con Tailscale e wifi di casa senza Tailscale - la rete di casa si prova per prima`() {
        // L'identita e' l'indirizzo Tailscale dell'accoppiamento; il PC ha raccontato anche quelli di casa.
        val c = Percorsi.candidati(vpn, listOf(casa, altraCasa), emptyList(), null)
        assertEquals(casa, c.first())
        // Con la sola impronta giusta sulla rete di casa, e Tailscale muto, si sceglie casa.
        val scelto = Percorsi.scegli(c, mapOf(casa to "abc", vpn to null), "abc")
        assertEquals(casa, scelto)
    }

    @Test
    fun `l ultimo che ha risposto va avanti a parita di strada`() {
        val c = Percorsi.candidati(casa, listOf(altraCasa), emptyList(), altraCasa)
        assertEquals(listOf(altraCasa, casa), c)
    }

    @Test
    fun `l ultimo buono non scavalca la rete di casa`() {
        val c = Percorsi.candidati(vpn, listOf(casa), emptyList(), vpn)
        assertEquals(listOf(casa, vpn), c)
    }

    @Test
    fun `gli indirizzi pubblici non si provano mai`() {
        val c = Percorsi.candidati(casa, listOf("http://203.0.113.9:47640", "http://8.8.8.8:47640", "192.0.2.1:99999x"), listOf("http://198.51.100.7:47640"), null)
        assertEquals(listOf(casa), c)
    }

    @Test
    fun `i confini delle reti private`() {
        assertEquals(listOf("http://172.16.0.1:47640", "http://172.31.0.1:47640"),
            Percorsi.candidati("172.16.0.1", listOf("172.31.0.1", "172.32.0.1", "172.15.0.1"), emptyList(), null))
    }

    @Test
    fun `senza porta si mette quella di sempre e i doppioni spariscono`() {
        val c = Percorsi.candidati("192.168.10.5", listOf(casa, "192.168.10.5"), listOf(casa), null)
        assertEquals(listOf(casa), c)
    }

    @Test
    fun `gli scoperti con l mDNS entrano fra i candidati`() {
        val c = Percorsi.candidati(vpn, emptyList(), listOf(casa), null)
        assertEquals(listOf(casa, vpn), c)
    }

    @Test
    fun `si sceglie il primo che risponde con l impronta giusta`() {
        val risposte = mapOf<String, String?>(casa to null, altraCasa to "giusta", vpn to "giusta")
        assertEquals(altraCasa, Percorsi.scegli(listOf(casa, altraCasa, vpn), risposte, "giusta"))
    }

    @Test
    fun `un indirizzo che risponde ma e un altro PC non vale`() {
        // Un 192.168.x.x qualunque sulla WiFi di un bar: risponde, ma non e il tuo computer.
        val risposte = mapOf<String, String?>(casa to "di-un-altro", vpn to "giusta")
        assertEquals(vpn, Percorsi.scegli(listOf(casa, vpn), risposte, "giusta"))
    }

    @Test
    fun `senza impronta nota non si da la chiave a nessuno`() {
        assertFalse(Percorsi.stessoPc("", ""))
        assertFalse(Percorsi.stessoPc("", "qualcosa"))
        assertFalse(Percorsi.stessoPc("giusta", null))
        assertFalse(Percorsi.stessoPc("giusta", ""))
        assertTrue(Percorsi.stessoPc("giusta", "giusta"))
        assertNull(Percorsi.scegli(listOf(casa), mapOf<String, String?>(casa to ""), ""))
    }

    @Test
    fun `nessuno risponde nessuno scelto`() {
        assertNull(Percorsi.scegli(listOf(casa, vpn), mapOf<String, String?>(casa to null, vpn to null), "giusta"))
    }

    @Test
    fun `come si e collegati in due parole`() {
        assertEquals("in WiFi", Percorsi.comeCollegato("lan"))
        assertEquals("via VPN", Percorsi.comeCollegato("tailscale"))
        assertNull(Percorsi.comeCollegato("drive"))
        assertNull(Percorsi.comeCollegato(null))
    }

    @Test
    fun `dopo un giro non se ne rifa un altro a raffica, salvo cambio di rete`() {
        assertTrue(Percorsi.eOraDiProvare(0L, 1_000L, false))
        assertFalse(Percorsi.eOraDiProvare(10_000L, 11_000L, false))
        assertTrue(Percorsi.eOraDiProvare(10_000L, 10_000L + Percorsi.PAUSA_FRA_GIRI_MS, false))
        assertTrue(Percorsi.eOraDiProvare(10_000L, 10_100L, true))
    }

    @Test
    fun `il permesso per la rete locale serve da Android 16`() {
        assertFalse(Percorsi.serveLaReteLocale(34))
        assertFalse(Percorsi.serveLaReteLocale(35))
        assertTrue(Percorsi.serveLaReteLocale(36))
    }

    @Test
    fun `un annuncio in rete vale solo con impronta e indirizzo privato`() {
        assertTrue(Percorsi.annuncioValido("abc", casa))
        assertTrue(Percorsi.annuncioValido("abc", vpn))
        assertFalse(Percorsi.annuncioValido("", casa))
        assertFalse(Percorsi.annuncioValido("abc", "http://203.0.113.9:47640"))
    }
}
