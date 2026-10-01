package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * I consumi del telefono con la stessa logica del computer (0.37): le frasi
 * delle finestre, il contesto delle chat e il freno arrivano gia' scritti da
 * `limiti-piano.ts`, e l'app li mostra cosi' come sono.
 */
class ConsumiTest {

    private val esempio = """
        {"oggi":{},"settimana":{},"totale":{},
         "limiti":{"cinqueOre":{"stato":"azzerata","percento":0,"percentoLetto":92,"resettaIl":1,"lettoIl":1,"etaMs":5,
                    "etichetta":"azzerata 14:00: in attesa di una lettura nuova (arriva alla prossima risposta di una chat aperta dal computer)"},
                   "settimana":{"stato":"vecchia","percento":41,"etichetta":"41% usato · letto 40 minuti fa · lettura vecchia: da allora nessuna chat ha risposto, il valore vero può essere più alto"},
                   "letti":1,"vecchio":true},
         "chatAperte":[{"sessione":"abcdefgh-1","titolo":"Portfolio","modello":"Opus 5","contesto":{"percento":42,"usati":84000,"dimensione":200000},"contestoEtichetta":"42% · 84k di 200k token"},
                       {"sessione":"zz","contestoEtichetta":"contesto non ancora letto (arriva alla prossima risposta)"}],
         "freno":{"livello":"pieno","tetto":8,"apriNuove":true,"motivo":"m","titolo":"Via libera","spiegazione":"Gli autopiloti possono aprire tutte le chat utili."}}
    """.trimIndent()

    @Test
    fun `le finestre dicono azzerata in attesa e lettura vecchia, come il computer`() {
        val c = Api.json.decodeFromString(Consumi.serializer(), esempio)
        assertTrue(fraseFinestra(c.limiti?.cinqueOre).contains("in attesa di una lettura nuova"))
        assertTrue(fraseFinestra(c.limiti?.settimana).contains("lettura vecchia"))
        assertEquals("non ancora letta", fraseFinestra(null))
        // Un computer piu' vecchio non manda la frase: si resta alla percentuale.
        assertEquals("63% usato", fraseFinestra(Finestra(percento = 63.4)))
    }

    @Test
    fun `il contesto di ogni chat e il freno arrivano dal computer`() {
        val c = Api.json.decodeFromString(Consumi.serializer(), esempio)
        assertEquals("Portfolio · Opus 5: 42% · 84k di 200k token", rigaContesto(c.chatAperte[0]))
        assertTrue(rigaContesto(c.chatAperte[1]).startsWith("zz: contesto non ancora letto"))
        assertEquals("Via libera", c.freno?.titolo)
    }
}
