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
        assertEquals("/api/autopilota/vai" to mapOf("autopilota" to "ap"), richiestaScheda(via, "ap", "Vai"))
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
    fun `la riga riassuntiva dice stato, criteri, chat e giri, prima le domande`() {
        val criteri = listOf(Criterio(soddisfatto = true), Criterio(), Criterio())
        assertEquals("al lavoro · criteri 1/3 · 2 chat · 5 giri", RiassuntoAutopilota.di("lavoro", criteri, 2, 5, 0))
        assertEquals("1 domanda per te · fermo · 1 giro", RiassuntoAutopilota.di("sospeso", emptyList(), 0, 1, 1))
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
