package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Le domande in cima ad Adesso (app 2.83.0): quali si vedono, e cosa fa il
 * tocco su una scelta. Le regole sono in `DomandeAdesso`, pure.
 */
class DomandeAdessoTest {
    private fun conv(chiave: String, chiede: Boolean = true, vista: String? = null, scheda: SchedaDomanda? = null, scelte: ScelteConversazione? = null, via: String = "rispondi") =
        Conversazione(
            chiave = chiave, chiede = chiede, scheda = scheda, scelte = scelte,
            vista = vista?.let { StatoVistaDrive(id = it) }, risposta = ViaRisposta(via = via, domanda = "d-$chiave")
        )

    @Test
    fun `in cima solo chi aspetta te, con Tutte anche chi ha finito`() {
        val tutte = listOf(conv("a"), conv("b", chiede = false, vista = "finito"), conv("c", vista = "permesso"))
        assertEquals(listOf("a", "c"), DomandeAdesso.inCima(tutte, ancheFinite = false).map { it.chiave })
        assertEquals(3, DomandeAdesso.inCima(tutte, ancheFinite = true).size)
    }

    @Test
    fun `una domanda nuova nella stessa chat ha una chiave nuova`() {
        val prima = conv("a", scheda = SchedaDomanda(domanda = "Procedo?"))
        val dopo = conv("a", scheda = SchedaDomanda(domanda = "E adesso?"))
        assertNotEquals(DomandeAdesso.chiave(prima), DomandeAdesso.chiave(dopo))
        assertTrue(DomandeAdesso.chiave(prima) in DomandeAdesso.chiaviVive(null, listOf(prima)))
    }

    @Test
    fun `un tocco risponde, sceglie nell elenco della chat o manda il testo`() {
        val si = SceltaScheda(testo = "Sì")
        val chat = conv("a", scelte = ScelteConversazione(chat = "p-1", opzioni = listOf(Opzione(numero = 1, testo = "Sì"))))
        assertEquals(DomandeAdesso.Tocco.Scegli("p-1", "Sì"), DomandeAdesso.tocco(chat, si))
        val domanda = conv("b")
        val t = DomandeAdesso.tocco(domanda, si)
        assertTrue(t is DomandeAdesso.Tocco.Rispondi)
        assertEquals("d-b", (t as DomandeAdesso.Tocco.Rispondi).via.domanda)
        // «Scrivi tu» non manda niente: apre il campo.
        assertEquals(DomandeAdesso.Tocco.Scrivi, DomandeAdesso.tocco(domanda, SceltaScheda(testo = "Scrivi tu", libera = true)))
    }

    @Test
    fun `Adesso mette le domande in cima agli autopiloti`() {
        val adesso = File("src/main/java/it/ferrariconsulenze/sierradeck/Adesso.kt").readText()
        assertTrue(adesso.contains("domandeInCima(api, domande)"))
        val lavori = File("src/main/java/it/ferrariconsulenze/sierradeck/Lavori.kt").readText()
        // La testa viene prima di tutto il resto della lista.
        assertTrue(lavori.indexOf("testa()") in 0 until lavori.indexOf("key = \"su-pc\""))
        // Le domande sono del PC accoppiato: non sopra gli autopiloti di un altro PC (Revisione c-46).
        assertTrue(lavori.contains("if (su == null) testa()"))
        // Si leggono fuori dalla lista (scorrendo non si fermano), e non dentro un autopilota.
        assertTrue(adesso.contains("if (!dettaglio) PolsoDomande(api, domande, DomandeAdesso.firma(stato))"))
        val cima = File("src/main/java/it/ferrariconsulenze/sierradeck/DomandeAdesso.kt").readText()
        assertTrue(!cima.contains("item(key = \"domande-polso\")"))
        // Dentro un autopilota la banda delle urgenze torna anche in Adesso.
        val app = File("src/main/java/it/ferrariconsulenze/sierradeck/App.kt").readText()
        assertTrue(app.contains("if (posto.voce != VoceBarra.ADESSO || adessoDettaglio) BandaUrgenze("))
    }

    @Test
    fun `nessun file Kotlin oltre 800 righe`() {
        val troppo = File("src/main/java").walk().filter { it.extension == "kt" }.filter { it.readLines().size > 800 }.map { it.name }.toList()
        assertEquals(emptyList<String>(), troppo)
    }
}
