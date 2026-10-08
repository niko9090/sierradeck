package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il negozio dell'app (2.53.0) sulla risposta di un computer alla 0.53.0,
 * composta dalle funzioni vere del PC sulle risposte vere di Claude Code
 * 2.1.294 (`tests/shared/negozio-app.test.ts` controlla che sia la stessa),
 * e su quella di un computer di prima.
 */
class NegozioVistaTest {
    private fun nuovo(): DatiNegozio = Api.json.decodeFromString(
        DatiNegozio.serializer(),
        javaClass.classLoader!!.getResource("negozio/api-negozio-0.53.json")!!.readText()
    )

    @Test
    fun `lo stato scritto dal computer arriva intero - etichetta, tono e spiegazione`() {
        val d = nuovo()
        val saluta = d.plugin.first { it.id == "saluta@prova-mkt" }
        assertTrue(saluta.installato)
        assertTrue(saluta.aggiornamento)
        assertEquals("1.1.0", saluta.versioneNuova)
        val s = NegozioVista.stato(saluta)
        assertEquals("aggiornamento disponibile", s.etichetta)
        assertEquals("attesa", s.tono)
        assertTrue(s.spiegazione.contains("1.1.0"))
        assertEquals(3, d.totalePlugin)
        assertEquals(1, NegozioVista.daAggiornare(d))
    }

    @Test
    fun `MCP - da approvare, errore col motivo, connesso, e quelli di claude ai in sola lettura`() {
        val d = nuovo()
        val condiviso = d.mcp.first { it.nome == "condiviso" }
        assertTrue(NegozioVista.daApprovare(condiviso))
        assertEquals("da approvare", NegozioVista.stato(condiviso).etichetta)
        val rotto = d.mcp.first { it.nome == "rotto" }
        assertEquals("errore", NegozioVista.stato(rotto).tono)
        assertTrue(NegozioVista.stato(rotto).spiegazione.contains("ECONNREFUSED"))
        assertEquals(listOf("Authorization"), rotto.intestazioni)
        assertEquals("connesso", NegozioVista.stato(d.mcp.first { it.nome == "finto" }).etichetta)
        val docs = d.mcp.first { it.nome == "claude.ai Claude Docs" }
        assertTrue(NegozioVista.soloLettura(docs))
        assertEquals("da un plugin o da claude.ai", NegozioVista.dove(docs))
        // condiviso da approvare e rotto in errore.
        assertEquals(2, NegozioVista.mcpDaGuardare(d))
    }

    @Test
    fun `le skill di un plugin si dicono come tali e non hanno interruttore`() {
        val d = nuovo()
        val ciao = d.skill.first { it.nome == "saluta:ciao" }
        assertEquals("dal plugin saluta", NegozioVista.origine(ciao))
        assertEquals("dal plugin", NegozioVista.stato(ciao).etichetta)
        assertEquals("personale", NegozioVista.origine(d.skill.first { it.nome == "revisione-testi" }))
    }

    @Test
    fun `un computer di prima - niente stato, si dice come allora, e il catalogo intero si accorcia`() {
        val vecchio = Api.json.decodeFromString(
            DatiNegozio.serializer(),
            """{"plugin":[""" + (0 until 300).joinToString(",") { """{"id":"p$it@m","nome":"p$it","descrizione":"","marketplace":"m","installato":${it == 299},"abilitato":${it == 299}}""" } +
                """],"skill":[{"nome":"s","descrizione":"","origine":"utente","abilitata":false}],"agenti":[],"mcp":[{"nome":"x","come":"node","abilitato":true}]}"""
        )
        assertNull(vecchio.totalePlugin)
        val elenco = NegozioVista.plugin(vecchio, null)
        assertEquals(NegozioVista.TETTO_VECCHIO + 1, elenco.size)
        assertEquals("p299@m", elenco.first().id)
        assertEquals("attivo", NegozioVista.stato(elenco.first()).etichetta)
        assertEquals("da installare", NegozioVista.stato(elenco[1]).etichetta)
        assertEquals("disattivata", NegozioVista.stato(vecchio.skill.first()).etichetta)
        val mcp = vecchio.mcp.first()
        assertTrue(NegozioVista.mcpAcceso(mcp))
        assertFalse(NegozioVista.daApprovare(mcp))
        assertTrue(NegozioVista.riassunto(vecchio, null, "").contains("0.53.0"))
    }

    @Test
    fun `la ricerca - quanti trovati, e il motivo se il computer non la sa fare`() {
        val d = nuovo()
        val trovati = RicercaNegozio(plugin = d.plugin.filter { !it.installato }, totale = 120)
        assertEquals(trovati.plugin.size, NegozioVista.plugin(d, trovati).size)
        assertTrue(NegozioVista.riassunto(d, trovati, "documenti").startsWith("120 trovati con «documenti», qui i primi"))
        assertEquals("La ricerca nel catalogo e la prova degli MCP arriva aggiornando PC-ESEMPIO alla 0.53.0.", FunzioniPc.testoMancante(FunzionePc.NEGOZIO, "PC-ESEMPIO"))
        val manca = Api.Errore(404, """{"errore":"non trovato"}""")
        assertTrue(FunzioniPc.mancaSulPc(manca))
    }

    @Test
    fun `l'esito di un'azione - cosa cambia, oppure il comando da confermare`() {
        val ok = Api.json.decodeFromString(EsitoNegozio.serializer(), """{"ok":true,"fatto":"Installato e acceso."}""")
        assertEquals("Installato e acceso.", ok.fatto)
        val conf = Api.json.decodeFromString(EsitoNegozio.serializer(), """{"ok":false,"conferma":{"sha256":"${"a".repeat(64)}","comando":"npx esempio-installa"}}""")
        assertEquals("npx esempio-installa", conf.conferma?.comando)
    }

    @Test
    fun `le rotte del negozio aspettano Claude Code - non i 15 secondi di sempre`() {
        // L'08/10: un'installazione da GitHub ci mette 7-60 secondi, e l'app
        // diceva «non riuscito» a 15 mentre il computer stava ancora installando.
        assertTrue("/api/negozio/installa" in Api.ROTTE_LENTE)
        assertTrue("/api/negozio/aggiorna" in Api.ROTTE_LENTE)
        assertTrue("/api/negozio/salute-mcp" in Api.ROTTE_LENTE)
        assertFalse("/api/stato" in Api.ROTTE_LENTE)
        assertTrue(Api.LENTE_SECONDI >= 180)
        assertEquals(12L, NegozioVista.secondi(1_000, 13_500))
        assertEquals(0L, NegozioVista.secondi(5_000, 1_000))
    }
}
