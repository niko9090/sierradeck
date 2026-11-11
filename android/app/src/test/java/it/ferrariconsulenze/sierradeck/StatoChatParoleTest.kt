package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import it.ferrariconsulenze.sierradeck.nucleo.leggiChat
import it.ferrariconsulenze.sierradeck.rete.Api

/**
 * La parola dello stato di una chat, uguale a quella della pagina servita dal PC
 * (`statoChat` in `client-pagina.ts`). I casi li scrive il vitest
 * `tests/main/client-pagina.test.ts` in `parole/stato-chat.json`.
 */
class StatoChatParoleTest {
    @Test
    fun `stesse parole della pagina, caso per caso`() {
        val casi = Api.json.parseToJsonElement(File("src/test/resources/parole/stato-chat.json").readText()).jsonArray
        assertTrue(casi.size >= 6)
        for (c in casi) {
            val o = c.jsonObject
            val chat = o["chat"]!!.jsonObject
            fun b(k: String) = chat[k]?.jsonPrimitive?.booleanOrNull
            val letta = leggiChat(chiede = b("chiede") == true, aspetta = b("aspetta") == true, governata = b("governata") == true, viva = b("viva") != false)
            // La pagina usa l'apostrofo tipografico, l'app quello dritto.
            assertEquals(chat.toString(), o["parola"]!!.jsonPrimitive.content.replace('’', '\''), letta.parola)
        }
    }
}
