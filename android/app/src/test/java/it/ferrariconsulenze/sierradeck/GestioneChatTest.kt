package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La gestione delle chat (PC 0.79.0) sui casi scritti dal PC con le sue
 * funzioni vere (`tests/shared/gestione-chat-vista.test.ts`): gli stessi
 * testi, le stesse conferme, le stesse righe, la risposta di
 * `/api/chat/gestione/spazio` letta com'è.
 */
class GestioneChatTest {
    private val casi: JsonObject = Api.json.parseToJsonElement(
        javaClass.classLoader!!.getResource("gestione-chat/vista-0.79.json")!!.readText()
    ).jsonObject
    private val adesso = java.time.Instant.parse(casi["quando"]!!.jsonObject["adesso"]!!.jsonPrimitive.content).toEpochMilli()
    private fun conferma(n: String): Conferma = casi["conferme"]!!.jsonObject[n]!!.jsonObject.let {
        Conferma(it["titolo"]!!.jsonPrimitive.content, it["testo"]!!.jsonPrimitive.content, it["azione"]!!.jsonPrimitive.content)
    }

    @Test
    fun `i testi delle tre azioni sono quelli del PC`() {
        val testi = casi["testi"]!!.jsonObject
        assertEquals(listOf("chiudi", "archivia", "elimina"), GestioneChatRegole.TESTI.keys.toList())
        for ((id, t) in GestioneChatRegole.TESTI) {
            val pc = testi[id]!!.jsonObject
            assertEquals(pc["etichetta"]!!.jsonPrimitive.content, t.etichetta)
            assertEquals(pc["breve"]!!.jsonPrimitive.content, t.breve)
            assertEquals(pc["spiega"]!!.jsonPrimitive.content, t.spiega)
        }
        assertEquals(casi["frase"]!!.jsonPrimitive.content, GestioneChatRegole.FRASE_SVUOTA)
    }

    @Test
    fun `le conferme sono quelle del PC`() {
        assertEquals(conferma("chiudi"), GestioneChatRegole.confermaChiudi("«x»"))
        assertEquals(conferma("archivia"), GestioneChatRegole.confermaArchivia("3 chat"))
        assertEquals(conferma("elimina"), GestioneChatRegole.confermaElimina("«x»", "12 MB", false))
        assertEquals(conferma("eliminaDrive"), GestioneChatRegole.confermaElimina("«x»", "12 MB", true))
        assertEquals(conferma("archiviaN"), GestioneChatRegole.confermaArchivia("3 chat", 3))
        assertEquals(conferma("eliminaN"), GestioneChatRegole.confermaElimina("2 chat", "12 MB", false, 2))
        assertEquals(conferma("eliminaDriveN"), GestioneChatRegole.confermaElimina("2 chat", "12 MB", true, 2))
        assertEquals(conferma("chiediSvuota"), GestioneChatRegole.confermaChiediSvuota(false))
        assertEquals(conferma("chiediSvuotaDrive"), GestioneChatRegole.confermaChiediSvuota(true))
        val nomi = casi["nomi"]!!.jsonObject
        assertEquals(nomi["una"]!!.jsonPrimitive.content, GestioneChatRegole.nome(listOf("x")))
        assertEquals(nomi["tre"]!!.jsonPrimitive.content, GestioneChatRegole.nome(listOf("a", "b", "c")))
    }

    @Test
    fun `da quanto non si usa, come lo scrive il PC`() {
        for (c in casi["quando"]!!.jsonObject["casi"]!!.jsonArray) {
            val o = c.jsonObject
            assertEquals(o["testo"]!!.jsonPrimitive.content, GestioneChatRegole.quandoUsata(o["iso"]?.jsonPrimitive?.contentOrNull, adesso))
        }
    }

    @Test
    fun `la risposta dello spazio si legge, con le righe, il totale e l'ordine del PC`() {
        val v = Api.json.decodeFromString(VistaSpazioChat.serializer(), casi["spazio"]!!.toString())
        assertEquals(3, v.chat.size)
        assertEquals(casi["righe"]!!.jsonArray.map { it.jsonPrimitive.content }, v.chat.map { GestioneChatRegole.rigaVoce(it, adesso) })
        assertEquals(casi["riepilogo"]!!.jsonPrimitive.content, GestioneChatRegole.riepilogo(v))
        val sel = v.selezione!!
        assertEquals(casi["riepilogoSelezione"]!!.jsonPrimitive.content, GestioneChatRegole.riepilogoSelezione(sel))
        // La stessa selezione rifatta qui (quando si sceglie senza chiedere al PC).
        assertEquals(sel, GestioneChatRegole.totale(v.chat, sel.escluse.map { it.sessione } + v.chat.filter { it.nonEliminabile == null && it.byte < 4096 }.map { it.sessione }))
        val ordine = casi["ordine"]!!.jsonObject
        assertEquals(ordine["spazio"]!!.jsonArray.map { it.jsonPrimitive.content }, GestioneChatRegole.ordina(v.chat, "spazio").map { it.sessione })
        assertEquals(ordine["uso"]!!.jsonArray.map { it.jsonPrimitive.content }, GestioneChatRegole.ordina(v.chat, "uso").map { it.sessione })
        assertTrue(v.chat.single { it.aperta }.nonEliminabile!!.contains("sta lavorando"))
    }

    @Test
    fun `il recupero e le archiviate`() {
        val r = Api.json.decodeFromString(RecuperoChat.serializer(), casi["recupero"]!!.toString())
        assertEquals(casi["recupero"]!!.jsonObject["riga"]!!.jsonPrimitive.content, GestioneChatRegole.rigaRecupero(r.chat.single(), adesso))
        val a = Api.json.decodeFromString(ChatArchiviataApp.serializer(), casi["archiviata"]!!.jsonObject["voce"]!!.toString())
        assertEquals(casi["archiviata"]!!.jsonObject["riga"]!!.jsonPrimitive.content, GestioneChatRegole.rigaArchiviata(a))
    }

    @Test
    fun `i rifiuti con il motivo del PC, e la parola per svuotare`() {
        val e = Api.json.decodeFromString(EsitoAzioniChat.serializer(), casi["esito"]!!.toString())
        assertEquals(1, e.rifiutate)
        assertEquals(casi["rifiuti"]!!.jsonArray.map { it.jsonObject["motivo"]!!.jsonPrimitive.content }, GestioneChatRegole.rifiuti(e))
        assertTrue(GestioneChatRegole.fraseGiusta(" svuota"))
        assertFalse(GestioneChatRegole.fraseGiusta("sì"))
    }

    @Test
    fun `le rotte della gestione passano dal ponte, come sul PC`() {
        for (r in listOf("spazio", "azione", "archiviate", "recupero", "ripristina", "svuota")) assertTrue(r, "/api/chat/gestione/$r" in Ponte.ROTTE)
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.GESTIONE_CHAT, "0.78.1"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.GESTIONE_CHAT, "0.79.0"))
    }
}
