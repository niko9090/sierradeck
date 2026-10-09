package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * «Mi collego a NOME-PC…» (app 2.52.1): i passi dell'animazione ricavati
 * dagli eventi, gli stessi scenari di `tests/shared/tentativi.test.ts`.
 */
class TentativiTest {
    private fun stati(v: VistaCollegamento) = v.passi.map { "${it.strada}:${it.stato}" }

    @Test
    fun `mi collego - i tentativi in ordine, poi la strada buona`() {
        var e = listOf<EventoTentativo>(EventoTentativo.Provo("lan", 0))
        var v = Tentativi.passi("PC-ESEMPIO", e)
        assertEquals("provo", v.fase)
        assertEquals("Mi collego a PC-ESEMPIO…", v.titolo)
        assertEquals("provo rete di casa", v.sotto)
        assertEquals(listOf("lan:provo", "tailscale:attesa", "webrtc:attesa", "drive:attesa"), stati(v))
        e = e + EventoTentativo.Fallita("lan", 5000, "non ha risposto in 5 secondi") + EventoTentativo.Provo("tailscale", 5000)
        v = Tentativi.passi("PC-ESEMPIO", e)
        assertEquals("provo Tailscale", v.sotto)
        e = e + EventoTentativo.Riuscita("tailscale", 5100, 84)
        v = Tentativi.passi("PC-ESEMPIO", e)
        assertEquals("collegato", v.fase)
        assertEquals("Collegato a PC-ESEMPIO", v.titolo)
        assertEquals("Tailscale · 84 ms", v.sotto)
        assertEquals(listOf("lan:fallita", "tailscale:ok", "webrtc:inutile", "drive:inutile"), stati(v))
        assertEquals("non ha risposto in 5 secondi", v.passi[0].motivo)
    }

    @Test
    fun `se fallisce - il motivo, mai una schermata vuota`() {
        val v = Tentativi.passi("PC-ESEMPIO", listOf(
            EventoTentativo.Provo("lan", 0), EventoTentativo.Fallita("lan", 1, "rifiutato"),
            EventoTentativo.Salta("tailscale", "nessun indirizzo Tailscale"), EventoTentativo.Salta("webrtc", "dal telefono no"),
            EventoTentativo.Fallito(2, "nessuna strada ha risposto")
        ))
        assertEquals("fallito", v.fase)
        assertEquals("Non riesco a collegarmi a PC-ESEMPIO", v.titolo)
        assertEquals("nessuna strada ha risposto", v.sotto)
        assertEquals(listOf("lan:fallita", "tailscale:salta", "webrtc:salta", "drive:salta"), stati(v))
    }

    @Test
    fun `dal ponte - ricavati dalla macchina della linea`() {
        val su = Linea.passo(Linea.NUOVA, EventoLinea.Ok(1000, 120, "webrtc"))
        val v = Tentativi.passi("PC-ESEMPIO", Tentativi.daLinea(su, 0))
        assertEquals(listOf("lan:fallita", "tailscale:salta", "webrtc:ok", "drive:inutile"), stati(v))
        assertEquals(120L, v.ritardoMs)
        val giu = Linea.passo(Linea.NUOVA, EventoLinea.Errore(1000, "irraggiungibile", "non risponde"))
        assertEquals("fallito", Tentativi.passi("PC-ESEMPIO", Tentativi.daLinea(giu, 0)).fase)
        val apre = Linea.passo(Linea.NUOVA, EventoLinea.Errore(1000, "collegando", "apro WebRTC"))
        assertEquals(listOf("lan:fallita", "tailscale:fallita", "webrtc:provo", "drive:attesa"), stati(Tentativi.passi("PC-ESEMPIO", Tentativi.daLinea(apre, 0))))
        assertEquals(listOf("lan:provo", "tailscale:attesa", "webrtc:attesa", "drive:attesa"), stati(Tentativi.passi("PC-ESEMPIO", Tentativi.daLinea(Linea.NUOVA, 0))))
    }

    @Test
    fun `a linea caduta - conto alla rovescia e colore`() {
        val su = Linea.passo(Linea.NUOVA, EventoLinea.Ok(0, 30, "lan"))
        assertNull(Tentativi.rovescia(su, 0))
        // Giù solo dopo tre fallimenti e 20 s di silenzio (app 2.56.0).
        var giu = su
        for (t in listOf(10_000L, 16_000L, 22_000L)) giu = Linea.passo(giu, EventoLinea.Errore(t, "irraggiungibile"))
        assertEquals("riprovo fra 1 s" to "ambra", Tentativi.rovescia(giu, 22_000))
        var l = giu
        repeat(3) { l = Linea.passo(l, EventoLinea.Errore(l.prossimoIl!!, "irraggiungibile")) }
        assertEquals("rosso", Tentativi.rovescia(l, l.prossimoIl!! - 4500)?.second)
        assertEquals("riprovo fra 5 s", Tentativi.rovescia(l, l.prossimoIl!! - 4500)?.first)
    }
}
