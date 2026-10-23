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
    fun `cosa serve da Nicholas, e un PC vecchio senza Punto`() {
        assertEquals("Il tuo via, per cominciare.", RighePunto.daTe(PuntoAutopilota(daTe = listOf("Il tuo via, per cominciare."))))
        assertNull(RighePunto.lista(emptyList(), 0))
        assertNull(RighePunto.finite(0))
        assertEquals("1 chat finita", RighePunto.finite(1))
        assertNull(Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """{"id":"ap-1","stato":"lavoro"}""").punto)
    }

    @Test
    fun `la velocità come la manda il PC 0_85_0, assente con un PC più vecchio`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","stato":"lavoro","punto":{"passo":"Lavora",
              "velocita":{"testo":"Dalla richiesta alla versione: 5 h 10 min (mediana di 4). Perso: pubblicazione 2 h.","aiuto":"Quanto ci mette una tua richiesta"}}}
        """)
        assertEquals("Dalla richiesta alla versione: 5 h 10 min (mediana di 4). Perso: pubblicazione 2 h.", d.punto?.velocita?.testo)
        assertEquals("Quanto ci mette una tua richiesta", d.punto?.velocita?.aiuto)
        assertNull(Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """{"id":"ap-1","stato":"lavoro","punto":{"passo":"Lavora"}}""").punto?.velocita)
    }
}
