package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le chat di un progetto nel pannello «Progetti» e come si aprono (PC 0.67.0),
 * sulla stessa risposta d'esempio fatta dalle funzioni vere del PC
 * (`pannello-0.60.json`): «Apri» qui, o «Apri su <PC>» dove vivono.
 */
class ApriChatProgettoTest {
    private val p: PannelloDrive = Api.json.decodeFromString(
        PannelloDrive.serializer(),
        javaClass.classLoader!!.getResource("pannello-drive/pannello-0.60.json")!!.readText()
    )

    @Test
    fun `le chat con nome del progetto, di tutti i suoi id`() {
        val g = p.progetti.single()
        val chat = PannelloDriveRegole.chatDelProgetto(p, g)
        assertTrue(chat.isNotEmpty())
        assertTrue(chat.none { it.senzaNome })
        assertTrue(chat.any { it.titolo == "Fatture" })
    }

    @Test
    fun `una chat che vive su un altro PC si apre dal vivo là, nella cartella di quel PC`() {
        val g = p.progetti.single()
        val fatture = PannelloDriveRegole.chatDelProgetto(p, g).first { it.titolo == "Fatture" }
        val come = PannelloDriveRegole.comeAprire(fatture, g)
        assertTrue(come is AperturaChat.Altrove)
        come as AperturaChat.Altrove
        assertEquals("PORTATILE-ESEMPIO", come.nome)
        assertEquals("D:\\Lavoro\\Gestionale", come.cwd)
    }
}
