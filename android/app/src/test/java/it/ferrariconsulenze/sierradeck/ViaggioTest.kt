package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il cambio di computer a tutto schermo (app 2.52.3): i passi dettagliati,
 * i motivi e cosa fare, il testo di «Copia i dettagli», «Torna al PC di prima».
 * Solo nomi e indirizzi di esempio.
 */
class ViaggioTest {
    private val b = "http://192.168.1.20:7420"
    private val base = Viaggio("PC-ESEMPIO", "PC-PRIMA", 1_000_000L, listOf(b), emptyList())
    private fun ids(p: List<PassoViaggio>) = p.map { "${it.id}:${it.stato}" }

    @Test
    fun `i passi sono sempre sette, in ordine`() {
        val p = Viaggi.passi(base.copy(eventi = listOf(EventoTentativo.Provo("lan", 1_000_000L)), dettagli = mapOf("lan" to DettaglioStrada(b, 1_000_000L))), 1_000_400L)
        assertEquals(listOf("stacco:ok", "indirizzi:ok", "lan:provo", "tailscale:attesa", "webrtc:attesa", "chiave:attesa", "collegato:attesa"), ids(p))
        assertEquals("192.168.1.20", p[2].indirizzo)
        assertEquals(400L, p[2].durataMs)
        assertTrue(p[0].motivo!!.contains("PC-PRIMA"))
        assertEquals("provo", Viaggi.fase(p))
    }

    @Test
    fun `tutto bene - strada, chiave verificata, collegato`() {
        val v = base.copy(
            eventi = listOf(EventoTentativo.Provo("lan", 1_000_000L), EventoTentativo.Riuscita("lan", 1_000_050L, 50)),
            dettagli = mapOf("lan" to DettaglioStrada(b, 1_000_000L, 1_000_050L)),
            chiave = DettaglioStrada(b, 1_000_050L, 1_000_120L), chiaveOk = true
        )
        val p = Viaggi.passi(v, 1_000_200L)
        assertEquals(listOf("stacco:ok", "indirizzi:ok", "lan:ok", "tailscale:salta", "webrtc:salta", "chiave:ok", "collegato:ok"), ids(p))
        assertEquals(50L, p[2].durataMs)
        assertEquals(70L, p[5].durataMs)
        // Le strade non servite non hanno «cosa fare»: non sono errori.
        assertNull(p[3].cosaFare)
        assertEquals("collegato", Viaggi.fase(p))
    }

    @Test
    fun `ogni errore ha il suo motivo per esteso e cosa fare`() {
        val v = base.copy(
            eventi = listOf(
                EventoTentativo.Provo("lan", 1_000_000L), EventoTentativo.Fallita("lan", 1_005_000L, "non ha risposto in 5 secondi"),
                EventoTentativo.Salta("tailscale", "nessun indirizzo Tailscale salvato per questo computer"),
                EventoTentativo.Salta("webrtc", "dal telefono il ponte verso gli altri PC si apre dalla scheda Computer, «Altri computer»"),
                EventoTentativo.Fallito(1_005_000L, "nessuna strada ha risposto")
            ),
            dettagli = mapOf("lan" to DettaglioStrada(b, 1_000_000L, 1_005_000L, "non ha risposto in 5 secondi"))
        )
        val p = Viaggi.passi(v, 1_006_000L)
        assertEquals(listOf("stacco:ok", "indirizzi:ok", "lan:fallita", "tailscale:salta", "webrtc:salta", "chiave:salta", "collegato:fallita"), ids(p))
        assertEquals(5000L, p[2].durataMs)
        assertTrue(p[2].cosaFare!!.contains("stesso wifi"))
        assertTrue(p[3].cosaFare!!.contains("Tailscale"))
        assertTrue(p[4].cosaFare!!.contains("Altri computer"))
        assertTrue(p[6].motivo!!.contains("non torno da solo"))
        assertEquals("fallito", Viaggi.fase(p))
        // La chiave rifiutata ha il suo «cosa fare».
        val k = Viaggi.passi(base.copy(
            eventi = listOf(EventoTentativo.Provo("lan", 1_000_000L), EventoTentativo.Riuscita("lan", 1_000_050L, 50)),
            chiave = DettaglioStrada(b, 1_000_050L, 1_000_090L, "il computer ha risposto 401: questa chiave non la riconosce"), chiaveOk = false
        ), 1_000_100L)
        assertEquals("fallita", k[5].stato)
        assertTrue(k[5].cosaFare!!.contains("accoppiamento"))
        assertEquals("fallita", k[6].stato)
        // Nessun indirizzo: il passo degli indirizzi fallisce, con cosa fare.
        val vuoto = Viaggi.passi(base.copy(indirizzi = emptyList()), 1_000_000L)
        assertEquals("fallita", vuoto[1].stato)
        assertNotNull(vuoto[1].cosaFare)
    }

    @Test
    fun `copia i dettagli - tutti i passi con orari, indirizzi, tempi e motivi`() {
        val v = base.copy(
            eventi = listOf(EventoTentativo.Provo("lan", 1_000_000L), EventoTentativo.Fallita("lan", 1_005_000L, "non ha risposto in 5 secondi"), EventoTentativo.Fallito(1_005_000L, "nessuna strada ha risposto")),
            dettagli = mapOf("lan" to DettaglioStrada(b, 1_000_000L, 1_005_000L, "non ha risposto in 5 secondi"))
        )
        val t = Viaggi.testo(v, "0.52.3", "7 ott alle 10:00", 1_006_000L)
        val righe = t.lines()
        assertTrue(righe[0].contains("collegamento a PC-ESEMPIO (SierraDeck 0.52.3)"))
        assertTrue(t.contains("esito: non collegato"))
        assertTrue(t.contains("Ultima risposta di PC-ESEMPIO: 7 ott alle 10:00"))
        assertTrue(t.contains("✗ Rete di casa: non riuscito · indirizzo 192.168.1.20 · 5000 ms · non ha risposto in 5 secondi"))
        assertTrue(t.contains("    Cosa fare: "))
        assertTrue(Regex("\\[\\d{2}:\\d{2}:\\d{2}] ").containsMatchIn(t))
        assertEquals(7, righe.count { it.contains(": fatto") || it.contains(": non riuscito") || it.contains(": saltato") || it.contains(": in attesa") || it.contains(": in corso") })
    }

    @Test
    fun `torna al PC di prima - una scelta come le altre, mai da sola`() {
        val a = "http://192.168.1.10:7420"
        val (s1, m1) = Selezione.tocca(Selezione.iniziale(a), b)
        m1 as MossaSelezione.Collegati
        assertEquals(a, s1.precedente)
        // B fallisce: resta su B.
        val fallito = Selezione.esito(s1, m1.gen, b, false)
        assertEquals(b, fallito.scelto)
        // Solo se lo chiedi: verso A, solo gli indirizzi di A, con un tentativo nuovo.
        val (s2, m2) = Selezione.tornaIndietro(fallito)
        m2 as MossaSelezione.Collegati
        assertEquals(a, s2.scelto)
        assertEquals(listOf(a), m2.indirizzi)
        assertTrue(m2.gen > m1.gen)
        // Senza un PC di prima non succede niente.
        assertEquals(MossaSelezione.Niente, Selezione.tornaIndietro(Selezione.iniziale(a)).second)
    }
}
