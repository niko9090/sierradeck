package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.schermate.notifiche.RegoleNotifiche
import it.ferrariconsulenze.sierradeck.schermate.notifiche.Rimedio
import it.ferrariconsulenze.sierradeck.sottofondo.AvvisoPc
import it.ferrariconsulenze.sierradeck.sottofondo.AzioneAvviso
import it.ferrariconsulenze.sierradeck.sottofondo.BersaglioAvviso
import it.ferrariconsulenze.sierradeck.sottofondo.ChiusuraAvviso
import it.ferrariconsulenze.sierradeck.sottofondo.Destinazione
import it.ferrariconsulenze.sierradeck.sottofondo.Gesto
import it.ferrariconsulenze.sierradeck.sottofondo.RegoleAvvisi
import it.ferrariconsulenze.sierradeck.sottofondo.StatoAscolto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le regole delle notifiche sul telefono (app 2.100.0): un canale per tipo,
 * niente quando l'app è davanti, un suono solo in 20 s, la chiusura che
 * toglie, «Ho scelto io», i tasti, dove porta il tocco, la riga di stato.
 */
class RegoleAvvisiTest {
    private val t0 = 1_000_000L
    private fun avviso(id: String = "domanda:d1", tipo: String = "domanda", cosa: String = "domanda", suona: Boolean = true, azioni: List<AzioneAvviso> = emptyList(), chiuso: ChiusuraAvviso? = null) =
        AvvisoPc(n = 1, id = id, tipo = tipo, titolo = "Notte chiede", testo = "Unisco?", sotto = "Consigliata: Sì", bersaglio = BersaglioAvviso(cosa, "d1"), azioni = azioni, suona = suona, chiuso = chiuso)

    @Test
    fun `un canale nuovo per tipo, i vecchi da cancellare`() {
        assertEquals(listOf("domande-2", "fermo", "fatto", "sapere"), listOf("domanda", "fermo", "fatto", "sapere").map { RegoleAvvisi.canale(it) })
        assertEquals("sapere", RegoleAvvisi.canale("sconosciuto"))
        assertEquals(listOf("domande", "presenza", "ascolto"), RegoleAvvisi.CANALI_VECCHI)
        // App 3.0.2: la riga fissa visibile se ne va con il suo canale; quella nuova è invisibile.
        assertEquals("ascolto-nascosto", RegoleAvvisi.CANALE_ASCOLTO)
    }

    @Test
    fun `suona solo se lo dice il PC e non ha suonato nei 20 s prima`() {
        assertEquals(Gesto.Mostra(true), RegoleAvvisi.gesto(avviso(), false, null, t0))
        assertEquals(Gesto.Mostra(false), RegoleAvvisi.gesto(avviso(suona = false), false, null, t0))
        assertEquals(Gesto.Mostra(false), RegoleAvvisi.gesto(avviso(), false, t0 - 19_999, t0))
        assertEquals(Gesto.Mostra(true), RegoleAvvisi.gesto(avviso(), false, t0 - 20_000, t0))
    }

    @Test
    fun `con l'app davanti niente notifiche, tranne la prova`() {
        assertEquals(Gesto.Niente, RegoleAvvisi.gesto(avviso(), true, null, t0))
        assertEquals(Gesto.Mostra(true), RegoleAvvisi.gesto(avviso(id = "prova:123", tipo = "sapere", cosa = "aggiornamenti"), true, null, t0))
        // Una chiusura toglie comunque quella vecchia.
        assertEquals(Gesto.Togli, RegoleAvvisi.gesto(avviso(chiuso = ChiusuraAvviso(come = "risposta")), true, null, t0))
    }

    @Test
    fun `chiuso toglie, scelto dal programma diventa Ho scelto io in silenzio`() {
        for (come in listOf("risposta", "ritirata", "scaduta")) assertEquals(Gesto.Togli, RegoleAvvisi.gesto(avviso(chiuso = ChiusuraAvviso(come = come)), false, null, t0))
        assertEquals(Gesto.Sostituisci("Notte chiede", "Ho scelto io: Sì"), RegoleAvvisi.gesto(avviso(chiuso = ChiusuraAvviso(come = "programma", testo = "Sì")), false, null, t0))
        val senzaTesto = avviso(azioni = listOf(AzioneAvviso("Unisci", "Unisci")), chiuso = ChiusuraAvviso(come = "programma"))
        assertEquals(Gesto.Sostituisci("Notte chiede", "Ho scelto io: Unisci"), RegoleAvvisi.gesto(senzaTesto, false, null, t0))
    }

    @Test
    fun `al massimo tre tasti, Scrivi quando resta posto`() {
        val due = avviso(azioni = listOf(AzioneAvviso("Sì", "Sì"), AzioneAvviso("No", "No")))
        assertEquals(listOf("Sì", "No", "Scrivi…"), RegoleAvvisi.tasti(due).map { it.etichetta })
        assertTrue(RegoleAvvisi.tasti(due).last().scrivi)
        val tre = avviso(azioni = listOf(AzioneAvviso("Sì, questa volta", "1"), AzioneAvviso("Sì, sempre", "2"), AzioneAvviso("No", "3"), AzioneAvviso("Forse", "4")))
        assertEquals(listOf("1", "2", "3"), RegoleAvvisi.tasti(tre).map { it.risposta })
        assertTrue(RegoleAvvisi.tasti(avviso(id = "fermo:a", tipo = "fermo", cosa = "workspace")).isEmpty())
        assertEquals(listOf("Scrivi…"), RegoleAvvisi.tasti(avviso(id = "chat:c:1", cosa = "chat")).map { it.etichetta })
        assertTrue(RegoleAvvisi.tasti(due.copy(chiuso = ChiusuraAvviso(come = "risposta"))).isEmpty())
    }

    @Test
    fun `a notifica chiusa si legge la cosa, aperta anche il sotto`() {
        assertEquals("Unisco?", RegoleAvvisi.testoCorto(avviso()))
        assertEquals("Unisco?\n\nConsigliata: Sì", RegoleAvvisi.testoLungo(avviso()))
        assertEquals("Consigliata: Sì", RegoleAvvisi.testoCorto(avviso().copy(testo = "")))
    }

    @Test
    fun `il tocco porta dove si risponde`() {
        assertEquals(Destinazione.Domanda("d1"), RegoleAvvisi.destinazione("domanda", "d1", "ap1"))
        assertEquals(Destinazione.Domanda(null), RegoleAvvisi.destinazione("domanda", "", null))
        assertEquals(Destinazione.Chat("c1"), RegoleAvvisi.destinazione("chat", "c1", null))
        assertEquals(Destinazione.Autopilota("ap1"), RegoleAvvisi.destinazione("workspace", "ws1", "ap1"))
        assertEquals(Destinazione.Lavori, RegoleAvvisi.destinazione("workspace", "ws1", null))
        assertEquals(Destinazione.Aggiornamenti, RegoleAvvisi.destinazione("aggiornamenti", "0.101.0", null))
        assertEquals(Destinazione.File, RegoleAvvisi.destinazione("file", "f1", null))
    }

    @Test
    fun `la riga fissa dice da quanto il PC ha risposto`() {
        // Il primo giro è un’attesa lunga: per 50 s il PC non risponde anche se va tutto bene.
        assertEquals("In ascolto", RegoleAvvisi.rigaAscolto(null, t0))
        assertEquals("In ascolto · ultimo contatto adesso", RegoleAvvisi.rigaAscolto(t0 - 30_000, t0))
        assertEquals("In ascolto · ultimo contatto 3 min fa", RegoleAvvisi.rigaAscolto(t0 - 3 * 60_000, t0 + 1))
        assertEquals("In ascolto · ultimo contatto 2 h fa", RegoleAvvisi.rigaAscolto(t0, t0 + 2 * 3_600_000))
    }

    @Test
    fun `la riga della schermata mette prima quello che blocca`() {
        val buono = StatoAscolto(ultimoContatto = t0 - 60_000, attivo = true)
        assertEquals(Rimedio.NESSUNO, RegoleNotifiche.rigaStato(true, true, false, buono, t0).rimedio)
        assertFalse(RegoleNotifiche.rigaStato(true, true, false, buono, t0).buona)
        assertEquals(Rimedio.PERMESSO, RegoleNotifiche.rigaStato(false, false, true, StatoAscolto(), t0).rimedio)
        assertEquals(Rimedio.RIACCENDI, RegoleNotifiche.rigaStato(true, false, true, StatoAscolto(), t0).rimedio)
        assertTrue(RegoleNotifiche.rigaStato(true, true, true, buono.copy(motivo = "spento"), t0).testo.endsWith("spento"))
        assertEquals(Rimedio.BATTERIA, RegoleNotifiche.rigaStato(true, false, true, buono, t0).rimedio)
        val ok = RegoleNotifiche.rigaStato(true, true, true, buono, t0)
        assertEquals("Avvisi attivi · ultimo contatto 1 min fa", ok.testo)
        assertTrue(ok.buona)
        assertTrue(RegoleNotifiche.rigaStato(true, true, true, buono.copy(vecchioPc = true), t0).testo.contains("aggiornato"))
    }

    @Test
    fun `la prova misura il suo tempo`() {
        assertNull(RegoleNotifiche.tempoProva(null, t0))
        assertNull(RegoleNotifiche.tempoProva(t0, t0 - 1))
        assertEquals("Arrivata in 1,4 s", RegoleNotifiche.tempoProva(t0, t0 + 1_400))
        assertEquals("Arrivata in 12 s", RegoleNotifiche.tempoProva(t0, t0 + 12_300))
        assertTrue(RegoleNotifiche.oraValida("07:30"))
        assertFalse(RegoleNotifiche.oraValida("24:00"))
        assertEquals("07:05", RegoleNotifiche.ora(7, 5))
    }
}
