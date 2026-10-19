package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Si vede sempre chi lavora (PC 0.69.0): l'app legge le parole decise dal PC
 * («al lavoro · da 12 min», «nessun segno da 10 min», lo stato di ogni
 * messaggio) e le chat in sottofondo. Con un PC più vecchio i campi mancano.
 */
class DalVivoTest {
    @Test
    fun `l'autopilota con il suo stato dal vivo`() {
        val a = Api.json.decodeFromString(AutopilotaBreve.serializer(), """
            {"id":"ap-1","nome":"Prova","stato":"lavoro","led":"led--lavoro",
             "dalVivo":{"etichetta":"al lavoro","da":"12 min","ultimaAzione":"scrive i test","senzaSegni":"nessun segno da 10 min"}}
        """)
        assertEquals("al lavoro", a.dalVivo?.etichetta)
        assertEquals("nessun segno da 10 min", a.dalVivo?.senzaSegni)
    }

    @Test
    fun `i messaggi verso la chat, con Manda adesso`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","stato":"lavoro","messaggi":[
              {"id":"m-1","testo":"controlla","stato":"in attesa","dettaglio":"in attesa da 3 min","mandaAdesso":true},
              {"id":"m-0","testo":"parti","stato":"consegnato","dettaglio":"consegnato alle 20:01"}]}
        """)
        assertEquals(2, d.messaggi.size)
        assertTrue(d.messaggi[0].mandaAdesso)
        assertEquals("consegnato alle 20:01", d.messaggi[1].dettaglio)
    }

    @Test
    fun `un PC vecchio non manda niente di nuovo, e va bene`() {
        val a = Api.json.decodeFromString(AutopilotaBreve.serializer(), """{"id":"ap-1","stato":"lavoro"}""")
        assertNull(a.dalVivo)
        val c = Api.json.decodeFromString(Chat.serializer(), """{"id":"sf-1","titolo":"x","sottofondo":{"id":"autopilota:ap-1","nome":"il suo autopilota"}}""")
        assertEquals("il suo autopilota", c.sottofondo?.nome)
    }
}

/** 0.80.0: «fermo» rosso anche nell'app, come `COLORE_DAL_VIVO` del PC; «finito» grigio. */
class TonoDalVivoTest {
    @Test
    fun `ogni parola con il colore del PC`() {
        assertEquals("verde", tonoDalVivo("al lavoro"))
        assertEquals("ambra", tonoDalVivo("aspetta te"))
        assertEquals("rosso", tonoDalVivo("fermo"))
        assertEquals("quieto", tonoDalVivo("finito"))
    }
}

/** 0.80.0: con l'autopilota fermo una sua chat «lavoro» non è al lavoro, come sul PC. */
class ChatGovernataTest {
    @Test
    fun `la chat di un autopilota fermo non e al lavoro`() {
        assertEquals("al lavoro", parolaChatGovernata("lavoro", "lavoro"))
        assertEquals("ferma: l’autopilota è fermo", parolaChatGovernata("sospeso", "lavoro"))
        assertEquals("ferma, aspetta una risposta", parolaChatGovernata("sospeso", "bloccata"))
        assertEquals("finita", parolaChatGovernata("lavoro", "finita"))
    }
}

/** 0.80.0, dalla Revisione: i casi che mancavano. */
class FermaCasiTest {
    private fun chat(id: String, chiede: Boolean = false, aspetta: Boolean = false, governata: Boolean = false, viva: Boolean = true) =
        Chat(id = id, titolo = id, chiede = chiede, aspetta = aspetta, governata = governata, viva = viva)

    @Test
    fun `una chat lavoro e al lavoro con l autopilota che gira, aspetta o si prepara, ferma se e finito o arreso`() {
        for (ap in listOf("lavoro", "attesa", "intervista")) assertEquals("al lavoro", parolaChatGovernata(ap, "lavoro"))
        for (ap in listOf("finito", "fallito", "pronto", "sospeso")) assertEquals("ferma: l’autopilota è fermo", parolaChatGovernata(ap, "lavoro"))
    }

    @Test
    fun `solo le scelte contano fra chi ti aspetta, non ferma, guidata e spenta no`() {
        val tutte = listOf(chat("a", aspetta = true), chat("b", aspetta = true, governata = true), chat("c", viva = false), chat("d", chiede = true))
        assertEquals(1, chatCheTiAspettano(tutte))
    }

    @Test
    fun `ferma resta ferma anche nella riga stretta`() {
        assertEquals("ferma", parolaPerRiga(leggiChat(chiede = false, aspetta = true, governata = false, viva = true), 320))
        assertEquals("ferma", parolaPerRiga(leggiChat(chiede = false, aspetta = true, governata = false, viva = true), 420))
    }
}
