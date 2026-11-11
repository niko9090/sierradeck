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
import it.ferrariconsulenze.sierradeck.nucleo.Conferma
import it.ferrariconsulenze.sierradeck.nucleo.FunzionePc
import it.ferrariconsulenze.sierradeck.nucleo.FunzioniPc
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Ponte
import it.ferrariconsulenze.sierradeck.nucleo.EsclusaChat
import it.ferrariconsulenze.sierradeck.nucleo.EsitoAzioniChat
import it.ferrariconsulenze.sierradeck.nucleo.SelezioneChat
import it.ferrariconsulenze.sierradeck.nucleo.VistaSpazioChat

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
    fun `le rotte della gestione passano dal ponte, come sul PC`() {
        for (r in listOf("spazio", "azione", "archiviate", "recupero", "ripristina", "svuota")) assertTrue(r, "/api/chat/gestione/$r" in Ponte.ROTTE)
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.GESTIONE_CHAT, "0.78.1"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.GESTIONE_CHAT, "0.79.0"))
    }

}
