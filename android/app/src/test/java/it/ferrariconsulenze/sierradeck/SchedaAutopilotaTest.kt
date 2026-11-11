package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import it.ferrariconsulenze.sierradeck.nucleo.AutopilotaDettaglio
import it.ferrariconsulenze.sierradeck.nucleo.AvanzamentoAutopilota
import it.ferrariconsulenze.sierradeck.nucleo.DomandaScheda
import it.ferrariconsulenze.sierradeck.nucleo.Domande
import it.ferrariconsulenze.sierradeck.nucleo.RegoleAvanzamento
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Ponte
import it.ferrariconsulenze.sierradeck.nucleo.chiave
import it.ferrariconsulenze.sierradeck.nucleo.richiestaScheda

/**
 * Le linguette «Domande» e «File» dell'autopilota nell'app (0.38.0): la stessa
 * regola del PC e della pagina.
 */
class SchedaAutopilotaTest {

    private val domanda = DomandaScheda(chiave = "d:d1", tipo = "domanda", idDomanda = "d1", testo = "Dove trovo la chiave?", origine = "lavoro")
    private val via = DomandaScheda(chiave = "via:ap", tipo = "via", testo = "Mi dai il via?", opzioni = listOf("Vai"), origine = "via")

    @Test
    fun `si risponde come sul PC`() {
        assertEquals("/api/rispondi" to mapOf("domanda" to "d1", "risposta" to "nel .env"), richiestaScheda(domanda, "ap", "nel .env"))
        // L'autopilota unico (PC 0.86.x) non ha il via: «Vai» è un messaggio come gli altri.
        assertEquals("/api/autopilota/dialogo" to mapOf("autopilota" to "ap", "testo" to "Vai"), richiestaScheda(via, "ap", "Vai"))
        assertEquals("/api/autopilota/dialogo" to mapOf("autopilota" to "ap", "testo" to "prima cambia x"), richiestaScheda(via, "ap", "prima cambia x"))
    }

    @Test
    fun `il dettaglio porta le domande della linguetta`() {
        val d = Api.json.decodeFromString(
            AutopilotaDettaglio.serializer(),
            """{"id":"ap","domandeScheda":[{"chiave":"d:d1","tipo":"domanda","idDomanda":"d1","testo":"x","opzioni":["sì","no"],"origine":"pubblica"}]}"""
        )
        assertEquals(listOf("sì", "no"), d.domandeScheda[0].opzioni)
    }

    @Test
    fun `l avanzamento arriva dal computer - orchestratore e coda, e un PC senza manda null`() {
        val a = Api.json.decodeFromString(
            AvanzamentoAutopilota.serializer(),
            """{"orchestratore":{"workspace":"Lavoro","attivo":true,"conAutopiloti":true,"modello":"opus","percento":40,"pensa":true,
               "specialisti":[{"id":"s1","ruolo":"sviluppatore","compito":"il lettore CSV","stato":"lavora","durata":"3 min"}],
               "vivo":true,"registro":[],"costo":{"oggiUsd":1.2,"turniOggi":3},"piano":{"totale":5,"uniti":2},"precedenti":[]},
               "coda":{"workspace":"Lavoro","totale":38.5,"richieste":[
                 {"id":"r-2","titolo":"Esportare","testo":"esporta","stato":"fatta","percento":100,"punti":[],"originali":[],"unioni":[],"compiti":[]},
                 {"id":"r-3","titolo":"Leggere i CSV","stato":"in-corso","percento":40}],"compattate":[]}}"""
        )
        assertEquals(40.0, a.percento!!, 0.0)
        assertEquals(2, a.orchestratore!!.piano.uniti)
        assertEquals("sviluppatore · il lettore CSV · lavora · 3 min", RegoleAvanzamento.rigaSpecialista(a.orchestratore!!.specialisti[0]))
        assertEquals(listOf("r-3", "r-2"), RegoleAvanzamento.ordinate(a.coda!!.richieste).map { it.id })
        assertEquals("r-3 · in corso · 40%", RegoleAvanzamento.rigaRichiesta(a.coda!!.richieste[1]))
        val vuoto = Api.json.decodeFromString(AvanzamentoAutopilota.serializer(), """{"orchestratore":null,"coda":null}""")
        assertEquals(null, vuoto.percento)
        // Solo la coda (un servizio senza orchestratore): la percentuale viene da lì.
        val soloCoda = Api.json.decodeFromString(AvanzamentoAutopilota.serializer(), """{"orchestratore":null,"coda":{"totale":12,"richieste":[]}}""")
        assertEquals(12.0, soloCoda.percento!!, 0.0)
        assertEquals("100%", RegoleAvanzamento.percento(130.0))
        assertTrue("/api/autopilota/avanzamento" in Ponte.ROTTE)
    }

}
