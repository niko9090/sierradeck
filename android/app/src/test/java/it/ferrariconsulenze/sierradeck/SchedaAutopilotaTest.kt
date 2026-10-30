package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

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
    fun `la linguetta Domande c'e solo con domande, per prima, e una nuova la fa avanti`() {
        assertEquals("domande", linguetteAutopilota(2).first())
        assertFalse("domande" in linguetteAutopilota(0))
        assertTrue("file" in linguetteAutopilota(0))
        assertTrue(domandaArrivata(null, listOf(domanda)))
        assertFalse(domandaArrivata(listOf("d:d1"), listOf(domanda)))
        assertTrue(domandaArrivata(listOf("d:d1"), listOf(domanda, via)))
        assertTrue(etichettaOrigine(via).contains("aspetta il tuo via"))
    }

    @Test
    fun `i file e il diff si leggono dal computer`() {
        val f = Api.json.decodeFromString(
            FileAutopilota.serializer(),
            """{"gruppi":[{"chiave":"principale","nome":"Cartella del progetto","cartella":"C:/p","base":"dal commit da cui è partito","file":[{"percorso":"a.ts","stato":"modificato","piu":2,"meno":1,"salvato":false}]}]}"""
        )
        assertEquals("modificato · +2 −1 · da salvare", rigaFile(f.gruppi[0].file[0]))
        assertEquals(listOf("blocco", "meno", "piu"), righeDiff("@@ -1 +1 @@\n-vecchia\n+nuova").map { it.tipo })
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
    fun `la riga riassuntiva dice percentuale, richieste e specialisti, prima le domande`() {
        assertEquals("42% · 2 richieste aperte · 1 specialista", RiassuntoAutopilota.di(41.6, 2, 1, 0))
        assertEquals("1 domanda per te · nessuna percentuale · sta pensando", RiassuntoAutopilota.di(null, 0, 0, 1, pensa = true))
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

    @Test
    fun `sopra la casella solo la conversazione, e la casella sopra la tastiera`() {
        // c-509, Nicholas (21/10): «non si vede nulla, troppe info che occupano tutto lo schermo».
        val k = java.io.File("src/main/java/it/ferrariconsulenze/sierradeck/DettaglioAutopilota.kt").readText()
        assertTrue(k.contains("Column(Modifier.fillMaxSize().imePadding())"))
        assertTrue(k.contains("var riassuntoAperto by remember(breve.id) { mutableStateOf(false) }"))
        // Le parti stanno nella riga aperta, non più in una seconda lista sotto la chat.
        assertFalse(k.contains("Modifier.weight(0.8f)"))
        assertTrue(k.indexOf("if (riassuntoAperto) LazyColumn") < k.indexOf("} else LazyColumn"))
        // La Panoramica sta solo nella riga aperta (prima era anche sopra la conversazione).
        val conversazione = k.substring(k.indexOf("} else LazyColumn"), k.indexOf("la casella: sempre in basso"))
        assertFalse(conversazione.contains("PanoramicaVista"))
        val app = java.io.File("src/main/java/it/ferrariconsulenze/sierradeck/App.kt").readText()
        assertTrue(app.contains(".consumeWindowInsets(pad)"))
        assertTrue(java.io.File("src/main/AndroidManifest.xml").readText().contains("adjustResize"))
    }
}
