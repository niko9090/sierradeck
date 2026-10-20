package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** PC 0.82.0: il colore fisso di cosa fa una chat e la riga di ogni agente, come sul PC e nella pagina. */
class RegoleAgentiTest {
    @Test
    fun `otto attività, ognuna con colore e simbolo suoi`() {
        assertEquals(listOf("sviluppo", "interfaccia", "collaudo", "revisione", "rilascio", "aspetta", "ferma", "finita"), TabellaAttivita.ordine)
        val att = TabellaAttivita.ordine.map { TabellaAttivita.attivita.getValue(it) }
        assertEquals(8, att.map { TabellaAttivita.colori.getValue(it.colore) }.toSet().size)
        assertEquals(8, att.map { it.icona }.toSet().size)
        assertNotEquals(TabellaAttivita.attivita.getValue("revisione").colore, TabellaAttivita.attivita.getValue("aspetta").colore)
    }

    @Test
    fun `legge l'attività, cosa fa e da quanto dal PC`() {
        val x = Api.json.decodeFromString(Specialista.serializer(), """{"id":"c-2","ruolo":"Revisione","colore":"rosa","compito":"rivedi","stato":"aspetta una risposta","attivo":false,"ultimaAzione":"","attivita":"aspetta","cosa":"rilegge il lavoro di Sviluppo: «il motore»","quanto":"da 3 min"}""")
        assertEquals("aspetta", Attivita.diSpecialista(x))
        assertEquals("aspetta te · da 3 min", RegoleAgenti.statoEQuanto(x))
        assertEquals(0xFFF283C0, Attivita.argb(x.colore))
        val r = Api.json.decodeFromString(RigaAlLavoro.serializer(), """{"id":"p-1","chi":"Collaudo","ruolo":"collaudo","cosa":"prova: «x»","quanto":"adesso","aspettaTe":false,"attivita":"collaudo"}""")
        assertEquals("collaudo", Attivita.diRiga(r))
        assertEquals("al lavoro", Attivita.parolaStato("collaudo"))
    }

    @Test
    fun `da un PC di prima l'attività si ricava da ruolo e stato`() {
        val lavora = Specialista(ruolo = "Collaudo", colore = "verde", stato = "al lavoro", attivo = true)
        assertEquals("collaudo", Attivita.diSpecialista(lavora))
        assertEquals("al lavoro", RegoleAgenti.statoEQuanto(lavora))
        assertEquals("finita", Attivita.diSpecialista(lavora.copy(attivo = false, chiusa = true)))
        assertEquals("aspetta", Attivita.diSpecialista(lavora.copy(attivo = false, stato = "aspetta una risposta")))
        assertEquals("ferma", Attivita.diSpecialista(lavora.copy(attivo = false, stato = "in pausa per i limiti del piano")))
        assertEquals("sviluppo", Attivita.diSpecialista(Specialista(ruolo = "Chat unica", stato = "al lavoro", attivo = true)))
        assertEquals("aspetta", Attivita.diRiga(RigaAlLavoro(aspettaTe = true, ruolo = "sviluppo")))
        assertEquals("rilascio", Attivita.diRiga(RigaAlLavoro(ruolo = "rilascio")))
    }

    @Test
    fun `un colore sconosciuto resta grigio`() {
        assertEquals(TabellaAttivita.colori.getValue("quieto"), Attivita.argb("arcobaleno"))
        assertEquals(TabellaAttivita.colori.getValue("quieto"), Attivita.argb(null))
    }
}
