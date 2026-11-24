package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.dati.Deposito
import it.ferrariconsulenze.sierradeck.nucleo.Chat
import it.ferrariconsulenze.sierradeck.nucleo.ElencoPc
import it.ferrariconsulenze.sierradeck.nucleo.PcRemoto
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.ProvaTelefono
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

    @Test fun ipcDelPonteNonAccoppiatiCompaionoConLeLoroChatAncheDaUnaVersioneVecchia() {
        // k-tpc1: il telefono è accoppiato a due PC; un terzo lo vede solo il PC in uso, dal ponte.
        val rubrica = listOf(
            PcNoto(id = "a", nome = "Uno", chiave = "k", impronta = ProvaTelefono.improntaDaId("id-a")),
            PcNoto(id = "b", nome = "Due", chiave = "k", impronta = ProvaTelefono.improntaDaId("id-b"))
        )
        // `/api/pc` di un PC 0.117: senza stato, frase, aggiornando, versione.
        val elenco = Api.json.decodeFromString(
            ElencoPc.serializer(),
            """{"io":"id-a","pc":[{"pcId":"id-a","nome":"Uno","vivo":true},{"pcId":"id-b","nome":"Due","vivo":true},
               {"pcId":"id-c","nome":"Tre","vivo":true},{"pcId":"id-d","nome":"Quattro","vivo":false}]}"""
        )
        val altri = TuttiIPc.dalPonte(rubrica, elenco)
        assertEquals(listOf("id-c", "id-d"), altri.map { it.id })
        assertEquals(listOf("id-c"), TuttiIPc.daLeggere(altri, elenco).map { it.id })
        // `/api/stato` di un PC vecchio: solo le chat, nessun campo nuovo.
        val vecchio = Api.json.decodeFromString(Stato.serializer(), """{"chat":[{"id":"9","titolo":"Da Tre","ultimaRiga":"x"}],"campoDiDomani":1}""")
        val copie = mapOf(
            "a" to viva(Chat(id = "1", titolo = "Una")),
            "b" to viva(Chat(id = "2", titolo = "Due")),
            "id-c" to Deposito.Copia(vecchio, 1_000, vecchia = false),
            "id-d" to Deposito.Copia(null, 0, vecchia = true, motivo = "spento")
        )
        val r = TuttiIPc.tutti(rubrica + altri, copie, corrente = "a", ora = ora)
        assertEquals(listOf("a", "b", "id-c", "id-d"), r.map { it.id })
        assertEquals(listOf(1, 1, 1, 0), r.map { it.chat.size })
        assertEquals("Da Tre", r.first { it.id == "id-c" }.chat.single().titolo)
        assertEquals(StatoGruppoPc.RAGGIUNGIBILE, r.first { it.id == "id-c" }.stato)
    }

    @Test fun unPcCheTaceMostraLeChatDelSuoBattito() {
        val elenco = Api.json.decodeFromString(
            ElencoPc.serializer(),
            """{"io":"id-a","pc":[{"pcId":"id-a","nome":"Uno","vivo":true},
               {"pcId":"id-b","nome":"Due","vivo":false,"chat":[{"sessione":"s1","titolo":"Una","cwd":"x","aspetta":true},{"titolo":"Senza","cwd":"y","aspetta":false}]}]}"""
        )
        val rubrica = listOf(PcNoto(id = "b", nome = "Due", chiave = "k", impronta = ProvaTelefono.improntaDaId("id-b")))
        val remoto = TuttiIPc.remotoDi(rubrica[0], elenco)
        assertEquals("id-b", remoto?.pcId)
        // Mai letto: prima la riga restava vuota.
        val senza = TuttiIPc.gruppo(rubrica[0], TuttiIPc.conBattito(Deposito.Copia(null, 0, vecchia = true, motivo = "spento"), remoto), false, ora)
        assertEquals(StatoGruppoPc.VECCHIO, senza.stato)
        assertEquals(setOf("s1", "Senza|y"), senza.chat.map { it.id }.toSet())
        assertTrue(senza.ultimaCopia)
        // Una copia fresca, anche vuota, non si tocca; una vecchia con chat nemmeno.
        val fresca = viva()
        assertTrue(TuttiIPc.conBattito(fresca, remoto) === fresca)
        val vecchiaPiena = Deposito.Copia(Stato(chat = listOf(Chat(id = "9"))), 5, vecchia = true)
        assertTrue(TuttiIPc.conBattito(vecchiaPiena, remoto) === vecchiaPiena)
        // Mai letto del tutto (copia assente).
        assertEquals(2, TuttiIPc.conBattito(null, remoto)?.stato?.chat?.size)
    }

    @Test fun senzaElencoDelPonteNienteDiPiu() {
        assertTrue(TuttiIPc.dalPonte(listOf(pc("a", "Uno")), null).isEmpty())
    }

    @Test fun unPcInRubricaSenzaImprontaNonSiRipeteDalPonte() {
        val elenco = ElencoPc(io = "id-a", pc = listOf(PcRemoto(pcId = "id-b", nome = "Due", vivo = true)))
        assertTrue(TuttiIPc.dalPonte(listOf(pc("a", "Uno"), pc("b", "due")), elenco).isEmpty())
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
