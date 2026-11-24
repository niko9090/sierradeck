package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.dati.Deposito
import it.ferrariconsulenze.sierradeck.nucleo.Chat
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.nucleo.StatoGruppoPc
import it.ferrariconsulenze.sierradeck.nucleo.TonoChat
import it.ferrariconsulenze.sierradeck.nucleo.TuttiIPc
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TuttiIPcTest {
    private fun pc(id: String, nome: String) = PcNoto(id = id, nome = nome, chiave = "k")
    private val ora = { _: Long -> "10:00" }
    private fun viva(vararg chat: Chat) = Deposito.Copia(Stato(chat = chat.toList()), 1_000, vecchia = false)

    @Test fun pcAccesoConLeSueChatOrdinatePerBisogno() {
        val g = TuttiIPc.gruppo(
            pc("a", "Uno"),
            viva(
                Chat(id = "1", titolo = "Zeta"),
                Chat(id = "2", titolo = "Beta", chiede = true),
                Chat(id = "3", titolo = "Alfa", aspetta = true),
                Chat(id = "4", titolo = "Dormiente", viva = false)
            ),
            corrente = false, ora = ora
        )
        assertEquals(StatoGruppoPc.RAGGIUNGIBILE, g.stato)
        assertEquals("acceso", g.frase)
        assertEquals(listOf("2", "3", "1", "4"), g.chat.map { it.id })
        assertEquals(listOf(TonoChat.SCEGLIE, TonoChat.FERMA, TonoChat.LAVORA, TonoChat.SPENTA), g.chat.map { it.tono })
        assertEquals(1, g.chiedono)
        assertFalse(g.ultimaCopia)
    }

    @Test fun pcCheNonRispondeSiVedeConLUltimaCopia() {
        val copia = Deposito.Copia(Stato(chat = listOf(Chat(id = "1", titolo = "Una"))), 5_000, vecchia = true, motivo = "timeout")
        val g = TuttiIPc.gruppo(pc("a", "Uno"), copia, corrente = false, ora = ora)
        assertEquals(StatoGruppoPc.VECCHIO, g.stato)
        assertEquals("non risponde · dati delle 10:00", g.frase)
        assertEquals(1, g.chat.size)
        assertTrue(g.ultimaCopia)
    }

    @Test fun pcMaiLettoNonSparisce() {
        val senza = TuttiIPc.gruppo(pc("a", "Uno"), null, corrente = false, ora = ora)
        assertEquals(StatoGruppoPc.NON_RAGGIUNGIBILE, senza.stato)
        assertEquals("non ancora letto", senza.frase)
        assertTrue(senza.chat.isEmpty())
        val iniziale = TuttiIPc.gruppo(pc("a", "Uno"), Deposito.Copia(null, 0, vecchia = true), corrente = false, ora = ora)
        assertEquals("non ancora letto", iniziale.frase)
        val giu = TuttiIPc.gruppo(pc("a", "Uno"), Deposito.Copia(null, 0, vecchia = true, motivo = "no"), corrente = false, ora = ora)
        assertEquals("non risponde", giu.frase)
    }

    @Test fun chatProtettaESenzaTitolo() {
        val g = TuttiIPc.gruppo(pc("a", "Uno"), viva(Chat(id = "1", pin = "chiusa"), Chat(id = "2", titolo = "T", nome = "T #2")), false, ora)
        assertEquals("T #2", g.chat.first { it.id == "2" }.titolo)
        assertEquals("Chat", g.chat.first { it.id == "1" }.titolo)
        assertTrue(g.chat.first { it.id == "1" }.protetta)
    }

    @Test fun tuttiITuttiIPcCompaionoEQuelloInUsoPerPrimo() {
        val pcs = listOf(pc("a", "Uno"), pc("b", "Due"), pc("c", "Tre"))
        val copie = mapOf("a" to viva(Chat(id = "1")), "c" to Deposito.Copia(null, 0, vecchia = true, motivo = "x"))
        val r = TuttiIPc.tutti(pcs, copie, corrente = "b", ora = ora)
        assertEquals(listOf("b", "a", "c"), r.map { it.id })
        assertEquals(listOf(true, false, false), r.map { it.corrente })
        assertEquals(StatoGruppoPc.NON_RAGGIUNGIBILE, r[0].stato)
        assertEquals(StatoGruppoPc.RAGGIUNGIBILE, r[1].stato)
        assertEquals(StatoGruppoPc.NON_RAGGIUNGIBILE, r[2].stato)
    }
}
