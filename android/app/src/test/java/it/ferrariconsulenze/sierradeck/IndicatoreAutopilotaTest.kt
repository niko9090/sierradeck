package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * L'indicatore a colpo d'occhio (PC 0.85.0): l'app legge le tre righe scritte
 * dal PC e le dice con le stesse parole della pagina. Con un PC più vecchio
 * il campo manca e il Punto si legge lo stesso.
 */
class IndicatoreAutopilotaTest {
    @Test
    fun `le tre righe come le manda il PC, caso vero della chat muta 21 minuti`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","stato":"lavoro","punto":{"passo":"Lavora","indicatore":{
              "versione":"Prossima versione 0.85.0: 1 di 3 pezzi pronti · manca: Indicatore e altri 1 · circa 2 h",
              "fine":{"testo":"Fine del lavoro: 4 di 6 criteri · 3 compiti in coda · 1 chat al lavoro","percento":67},
              "andamento":{"livello":"fermo","colore":"rosso","simbolo":"■","testo":"Fermo: nessun segnale vero da 21 min · l’autopilota: la riprendo"},
              "dettaglio":["Sviluppo («Il menu»): file cambiati 21 min fa"],
              "aiuto":"Tre righe per capire a colpo d’occhio."}}}
        """)
        val i = d.punto!!.indicatore!!
        assertEquals("Prossima versione 0.85.0: 1 di 3 pezzi pronti · manca: Indicatore e altri 1 · circa 2 h", i.versione)
        assertEquals(0.67f, RigheIndicatore.frazione(i), 0.001f)
        assertEquals("rosso", i.andamento.colore)
        assertEquals("■ Fermo: nessun segnale vero da 21 min · l’autopilota: la riprendo", RigheIndicatore.andamento(i))
        assertEquals("Tre righe per capire a colpo d’occhio.\n\nChat per chat:\nSviluppo («Il menu»): file cambiati 21 min fa", RigheIndicatore.aiuto(i))
    }

    @Test
    fun `un PC più vecchio senza indicatore, e la barra sempre fra 0 e 1`() {
        assertNull(Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """{"id":"ap-1","stato":"lavoro","punto":{"passo":"Lavora"}}""").punto!!.indicatore)
        assertEquals(1f, RigheIndicatore.frazione(IndicatoreAutopilota(fine = FineIndicatore(percento = 140))), 0f)
        assertEquals("Spiegazione", RigheIndicatore.aiuto(IndicatoreAutopilota(aiuto = "Spiegazione")))
    }

    @Test
    fun `le promesse aperte come le manda il PC 0_85_1, e assenti con un PC più vecchio`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","stato":"lavoro","punto":{"passo":"Lavora","indicatore":{
              "versione":"Prossima versione 0.85.1","fine":{"testo":"Fine","percento":10},
              "andamento":{"livello":"va","colore":"verde","simbolo":"●","testo":"Va"},
              "promesse":["Ti ho promesso: la 0.85.1 pubblicata · entro il 24/10 03:12", "  "],
              "aiuto":"Tre righe."}}}
        """)
        assertEquals(listOf("Ti ho promesso: la 0.85.1 pubblicata · entro il 24/10 03:12"), RigheIndicatore.promesse(d.punto!!.indicatore!!))
        assertEquals(emptyList<String>(), RigheIndicatore.promesse(IndicatoreAutopilota()))
    }
}
