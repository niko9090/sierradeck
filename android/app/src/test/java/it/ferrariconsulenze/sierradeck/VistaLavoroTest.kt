package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.AdessoTelefono
import it.ferrariconsulenze.sierradeck.nucleo.Aggiornamento
import it.ferrariconsulenze.sierradeck.nucleo.AutopilotaBreve
import it.ferrariconsulenze.sierradeck.nucleo.Battuta
import it.ferrariconsulenze.sierradeck.nucleo.ComponiLavoro
import it.ferrariconsulenze.sierradeck.nucleo.ComponiWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.Conversazione
import it.ferrariconsulenze.sierradeck.nucleo.Decisa
import it.ferrariconsulenze.sierradeck.nucleo.DomandaBolla
import it.ferrariconsulenze.sierradeck.nucleo.Linea
import it.ferrariconsulenze.sierradeck.nucleo.RichiestaCoda
import it.ferrariconsulenze.sierradeck.nucleo.RigaChat
import it.ferrariconsulenze.sierradeck.nucleo.SceltaScheda
import it.ferrariconsulenze.sierradeck.nucleo.SchedaDomanda
import it.ferrariconsulenze.sierradeck.nucleo.SpecialistaOrchestratore
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.nucleo.TipoDomanda
import it.ferrariconsulenze.sierradeck.nucleo.ViaRisposta
import it.ferrariconsulenze.sierradeck.nucleo.VistaAttesa
import it.ferrariconsulenze.sierradeck.nucleo.VistaCoda
import it.ferrariconsulenze.sierradeck.nucleo.VistaOrchestratore
import it.ferrariconsulenze.sierradeck.nucleo.VoceAttesa
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VistaLavoroTest {
    private fun conv(chiave: String, scelte: List<SceltaScheda>, chiede: Boolean = true, decisa: Decisa? = null) =
        Conversazione(chiave = chiave, tipo = "autopilota", titolo = "Sito", chiede = chiede,
            risposta = ViaRisposta(via = "rispondi", domanda = "q-$chiave"),
            scheda = SchedaDomanda(chi = "Sito", domanda = "Pubblico?", scelte = scelte, decisa = decisa))

    @Test fun lineaDaiDati() {
        assertEquals(Linea.COLLEGO, ComponiLavoro.componi(null, 0, true, emptyList(), emptyMap(), 0).linea)
        val vuota = ComponiLavoro.componi(Stato(), 10, true, emptyList(), emptyMap(), 0)
        assertEquals(Linea.VECCHI, vuota.linea)
        assertTrue(vuota.nessunWorkspace)
        assertEquals(Linea.OK, ComponiLavoro.componi(Stato(), 10, false, emptyList(), emptyMap(), 0).linea)
    }

    @Test fun consensoConConfermaSuSempre() {
        val c = conv("a", listOf(SceltaScheda("Sì, sempre"), SceltaScheda("Sì, questa volta", consigliata = true), SceltaScheda("No")))
        val d = ComponiLavoro.componi(Stato(), 1, false, listOf(c), emptyMap(), 0).domande.single()
        assertEquals(TipoDomanda.CONSENSO, d.tipo)
        assertEquals(listOf("No", "Sì, questa volta", "Sì, sempre"), d.scelte.map { it.testo })
        assertTrue(d.scelte.last().conConferma)
        assertTrue(d.scelte.none { it.consigliata })
    }

    @Test fun chiuseFuoriRispostaDaQuiResta() {
        val aperta = conv("a", listOf(SceltaScheda("Sì"), SceltaScheda("No")))
        val chiusa = conv("b", listOf(SceltaScheda("Sì")), decisa = Decisa("programma", "Sì", ""))
        val v = ComponiLavoro.componi(Stato(), 1, false, listOf(aperta, chiusa), emptyMap(), 0)
        assertEquals(listOf("a"), v.domande.map { it.chiave })
        val dopo = ComponiLavoro.componi(Stato(), 1, false, listOf(aperta.copy(chiede = false)), mapOf("a" to "Sì"), 0)
        assertEquals("Sì", dopo.domande.single().risposta)
    }

    @Test fun versioneProntaESchede() {
        val s = Stato(autopiloti = listOf(AutopilotaBreve(id = "1", workspace = "Sito", adesso = AdessoTelefono("Al lavoro", "lavora"))),
            aggiornamento = Aggiornamento(fase = "pronto", versione = "0.101.0"))
        val v = ComponiLavoro.componi(s, 1, false, emptyList(), emptyMap(), 0)
        assertEquals("0.101.0", v.versionePronta)
        assertEquals("Sito", v.schede.single().nome)
    }

    @Test fun stradaDellaRisposta() {
        val (rotta, corpo) = ComponiLavoro.strada(ViaRisposta(via = "rispondi", domanda = "q1"), "Sì")
        assertEquals("/api/rispondi", rotta)
        assertEquals("{\"domanda\":\"q1\",\"risposta\":\"Sì\"}", corpo)
    }

    @Test fun chatDelWorkspace() {
        val b = listOf(
            Battuta(da = "tu", testo = "Fai il sito"),
            Battuta(da = "nota", testo = "letto il codice"),
            Battuta(da = "nota", testo = "provato"),
            Battuta(da = "nota", testo = "Fatto: la pagina", tono = "fine"),
            Battuta(da = "lui", testo = "Pubblico?", domanda = DomandaBolla("q1", listOf("Sì", "No"), consigliata = "Sì", rischiosa = true)),
            Battuta(da = "lui", testo = "Unisco?", decisa = Decisa("programma", "Sì", ""))
        )
        val r = ComponiWorkspace.chat(b, 0)
        assertEquals(listOf(RigaChat.Bolla::class, RigaChat.Successo::class, RigaChat.Traguardo::class, RigaChat.Domanda::class, RigaChat.Decisa::class), r.map { it::class })
        assertEquals(2, (r[1] as RigaChat.Successo).note.size)
        assertEquals("Aspetta te: non scelgo io al posto tuo", (r[3] as RigaChat.Domanda).rigaSotto)
        assertEquals("Ha scelto il programma: Sì", (r[4] as RigaChat.Decisa).riga)
    }

    @Test fun chiLavoraDallaListaOppureDagliSpecialisti() {
        val attesa = VistaAttesa(
            alLavoro = listOf(VoceAttesa(id = "x", workspace = "Sito", tipo = "sviluppatore", titolo = "k3 fai la barra", minutiStimati = 5.0)),
            inFila = listOf(VoceAttesa(id = "y", workspace = "Sito", titoloParole = "Prova la barra", ruoloParole = "Collaudo", posizione = 2), VoceAttesa(id = "z", workspace = "Altro"))
        )
        val r = ComponiWorkspace.chiLavora("Sito", attesa, null)
        assertEquals(listOf("x", "y"), r.map { it.id })
        assertEquals("Fai la barra", r[0].titolo)
        assertEquals("in fila, 2°", r[1].stato)
        val o = ComponiWorkspace.chiLavora("Sito", null, VistaOrchestratore(specialisti = listOf(SpecialistaOrchestratore(id = "s", ruolo = "revisore", compito = "rivedi", stato = "lavoro"))))
        assertEquals("Revisione", o.single().ruolo)
        assertEquals("al lavoro", o.single().stato)
    }

    @Test fun richiesteInParole() {
        val r = ComponiWorkspace.richieste(VistaCoda(richieste = listOf(RichiestaCoda("r-1", "fatto", stato = "fatta", percento = 100.0), RichiestaCoda("r-2", "r-2 la barra", stato = "in-corso", percento = 40.4, titoloParole = "La barra"))))
        assertEquals(listOf("La barra", "Fatto"), r.map { it.titolo })
        assertEquals("in corso", r[0].stato)
        assertNull(ComponiWorkspace.testa(null, "id", null).percento)
    }

    @Test fun salvaliEUnisciEPiuTardi() {
        val c = conv("u", listOf(SceltaScheda("Salvali e unisci"), SceltaScheda("Lascia stare")))
        assertEquals(TipoDomanda.UNISCI, ComponiLavoro.componi(Stato(), 1, false, listOf(c), emptyMap(), 0).domande.single().tipo)
        val ora = 1_000_000L
        assertTrue(it.ferrariconsulenze.sierradeck.schermate.altro.PiuTardi.nascosta(ora + it.ferrariconsulenze.sierradeck.schermate.altro.PiuTardi.UN_GIORNO, ora + 1))
        assertTrue(!it.ferrariconsulenze.sierradeck.schermate.altro.PiuTardi.nascosta(ora, ora + 1))
    }
}
