package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Il Punto in cima alla conversazione dell'autopilota (PC 0.84.3): l'app
 * legge le righe scritte dal PC, con il segnale di ogni chat nei colori del
 * PC, e le dice con le stesse parole della pagina. Con un PC più vecchio il
 * campo manca.
 */
class PuntoAutopilotaTest {
    @Test
    fun `il Punto come lo manda il PC`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","stato":"lavoro","punto":{
              "passo":"Lavora: 1 di 3 criteri soddisfatti",
              "chat":[{"id":"c-2","chi":"Interfaccia","compito":"La pagina","testo":"nessun segno da 20 min","tono":"ferma","colore":"rosso",
                       "segnale":{"tipo":"bloccata","parola":"bloccata: manca la chiave","colore":"rosso","simbolo":"■"}},
                      {"id":"c-1","chi":"Sviluppo","compito":"Il menu","testo":"al lavoro","tono":"lavoro","colore":"verde"}],
              "finite":2,"fatto":["Il motore"],"fattoTotale":1,"dopo":["Le notifiche"],"dopoTotale":3,"daTe":[],
              "limiti":"Limiti del piano: 5 ore 42%. Solo per informazione: le chat non si fermano per questo.",
              "aiuto":"Il punto della situazione"}}
        """)
        val p = d.punto!!
        assertEquals("Lavora: 1 di 3 criteri soddisfatti", p.passo)
        assertEquals("rosso", p.chat[0].colore)
        assertEquals("rosso", p.chat[0].segnale?.colore)
        assertEquals("■", p.chat[0].segnale?.simbolo)
        assertNull(p.chat[1].segnale)
        assertEquals("2 chat finite", RighePunto.finite(p.finite))
        assertEquals("Il motore", RighePunto.lista(p.fatto, p.fattoTotale))
        assertEquals("Le notifiche e altri 2", RighePunto.lista(p.dopo, p.dopoTotale))
        assertEquals("niente, va avanti da solo.", RighePunto.daTe(p))
    }

    @Test
    fun `le richieste di Nicholas in cima, con lo stato del PC`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","stato":"lavoro","punto":{"passo":"Lavora",
              "richieste":[{"id":"r-2","giorno":"23/10","titolo":"Le risposte prese davvero","stato":"in-corso","parola":"in corso","colore":"blu"},
                           {"id":"r-1","giorno":"22/10","titolo":"Togli il freno","stato":"fatta","parola":"fatta nella versione 0.84.2","colore":"verde"}],
              "richiesteTotale":3}}
        """)
        val p = d.punto!!
        assertEquals(2, p.richieste.size)
        assertEquals("blu", p.richieste[0].colore)
        assertEquals("23/10 · Le risposte prese davvero — in corso", RighePunto.richiesta(p.richieste[0]))
        assertEquals("22/10 · Togli il freno — fatta nella versione 0.84.2", RighePunto.richiesta(p.richieste[1]))
        assertEquals(" e un altro", RighePunto.altri(p.richiesteTotale, p.richieste.size))
        // Un PC di prima della 0.85.0: nessuna richiesta, il Punto si legge lo stesso.
        assertEquals(0, Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """{"id":"ap-1","stato":"lavoro","punto":{"passo":"Lavora"}}""").punto!!.richieste.size)
    }

    @Test
    fun `cosa serve da Nicholas, e un PC vecchio senza Punto`() {
        assertEquals("Il tuo via, per cominciare.", RighePunto.daTe(PuntoAutopilota(daTe = listOf("Il tuo via, per cominciare."))))
        assertNull(RighePunto.lista(emptyList(), 0))
        assertNull(RighePunto.finite(0))
        assertEquals("1 chat finita", RighePunto.finite(1))
        assertNull(Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """{"id":"ap-1","stato":"lavoro"}""").punto)
    }
}
