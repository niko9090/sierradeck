package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.ConsumiPerChat
import it.ferrariconsulenze.sierradeck.nucleo.ConsumiVistaPura
import it.ferrariconsulenze.sierradeck.nucleo.Consumi
import it.ferrariconsulenze.sierradeck.nucleo.Rimasto
import it.ferrariconsulenze.sierradeck.nucleo.RimastoTutto
import it.ferrariconsulenze.sierradeck.nucleo.UsoChat
import it.ferrariconsulenze.sierradeck.rete.Api
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class ConsumiPerChatTest {
    private val utc = TimeZone.getTimeZone("UTC")

    private val json = """{"perChat":{"aggiornatoIl":1,"pc":"PC-prova","chat":[
        {"chiave":"a","chat":"Piccola","workspace":"w1","pc":"PC-prova","oggi":10,"settimana":500},
        {"chiave":"b","chat":"Grande","workspace":"w2","pc":"PC-prova","oggi":12400,"settimana":20000,"ultimo":5}],
        "rimasto":{"giornata":{"noto":false,"motivo":"Claude non dà un limite per la giornata"},
        "cinqueOre":{"noto":true,"percentoUsato":38,"percentoRimasto":62,"azzeraEtichetta":"14:20","lettoIl":3},
        "settimana":{"noto":false,"motivo":"azzerata, in attesa di una lettura nuova"}},"campoNuovo":1}}"""

    @Test
    fun `il JSON del PC si legge e i campi nuovi non rompono`() {
        val c = Api.json.decodeFromString(Consumi.serializer(), json)
        assertNotNull(c.perChat)
        assertEquals(2, c.perChat!!.chat.size)
        assertEquals(62, c.perChat!!.rimasto.cinqueOre.percentoRimasto)
    }

    @Test
    fun `senza perChat il PC e' vecchio e tutto e' non noto`() {
        val c = Api.json.decodeFromString(Consumi.serializer(), "{}")
        assertNull(c.perChat)
        val v = ConsumiVistaPura.vociInAlto(c.perChat, utc)
        assertEquals(listOf("Resta nelle 5 ore", "Resta questa settimana", "Oggi"), v.map { it.etichetta })
        assertTrue(v.all { it.grande == "non noto" && !it.noto })
    }

    @Test
    fun `in alto 5 ore note, settimana non nota col motivo, oggi non noto col motivo`() {
        val c = Api.json.decodeFromString(Consumi.serializer(), json)
        val (ore, sett, oggi) = ConsumiVistaPura.vociInAlto(c.perChat, utc)
        assertEquals("62%", ore.grande)
        assertEquals("si azzera 14:20", ore.sotto)
        assertNull(ore.aiuto)
        assertEquals("non noto", sett.grande)
        assertEquals("azzerata, in attesa di una lettura nuova", sett.aiuto)
        assertEquals("non noto", oggi.grande)
        assertEquals("Claude non dà un limite per la giornata", oggi.aiuto)
    }

    @Test
    fun `l'azzeramento dal momento se manca la frase, e la lettura vecchia si dice`() {
        // 2026-11-29 09:00 UTC e' domenica.
        val domenica = java.util.Calendar.getInstance(utc).apply { clear(); set(2026, java.util.Calendar.NOVEMBER, 29, 9, 0, 0) }.timeInMillis
        val r = Rimasto(noto = true, percentoRimasto = 30, azzeraIl = domenica, vecchia = true)
        val p = ConsumiPerChat(rimasto = RimastoTutto(settimana = r))
        val sett = ConsumiVistaPura.vociInAlto(p, utc)[1]
        assertEquals("30%", sett.grande)
        assertEquals("si azzera dom 09:00 · lettura vecchia", sett.sotto)
    }

    @Test
    fun `la giornata resta non nota anche se il PC mandasse un numero`() {
        val p = ConsumiPerChat(rimasto = RimastoTutto(giornata = Rimasto(noto = true, percentoRimasto = 50)))
        val oggi = ConsumiVistaPura.vociInAlto(p, utc)[2]
        assertEquals("non noto", oggi.grande)
        assertFalse(oggi.noto)
    }

    @Test
    fun `le chat dal piu' alto`() {
        val c = Api.json.decodeFromString(Consumi.serializer(), json)
        assertEquals(listOf("Grande", "Piccola"), ConsumiVistaPura.chatOrdinate(c.perChat).map { it.chat })
        val pari = ConsumiPerChat(chat = listOf(UsoChat(chat = "b", oggi = 5, settimana = 1), UsoChat(chat = "a", oggi = 5, settimana = 9)))
        assertEquals(listOf("a", "b"), ConsumiVistaPura.chatOrdinate(pari).map { it.chat })
        assertTrue(ConsumiVistaPura.chatOrdinate(null).isEmpty())
    }

    @Test
    fun `token e posto della chat in parole`() {
        assertEquals("842", ConsumiVistaPura.token(842))
        assertEquals("12,4k", ConsumiVistaPura.token(12_400))
        assertEquals("3,1M", ConsumiVistaPura.token(3_100_000))
        assertEquals("w2 · PC-prova", ConsumiVistaPura.doveStaChat(UsoChat(workspace = "w2", pc = "PC-prova")))
        assertEquals("w2", ConsumiVistaPura.doveStaChat(UsoChat(workspace = "w2")))
    }
}
