package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.AggiornamentoRemoto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Gli stessi casi di `tests/shared/aggiornamento-remoto.test.ts`. */
class AggiornamentoRemotoTest {
    private val adesso = 1_800_000_000_000L
    private fun campo(s: String) = Json.parseToJsonElement(s)
    private fun agg(versione: String, da: Long) = campo("""{"versione":"$versione","da":$da}""")

    @Test fun vale_dentro_i_quindici_minuti() {
        assertEquals("1.1.0", AggiornamentoRemoto.inCorso(agg("1.1.0", adesso - 60_000), "1.0.0", adesso))
        assertEquals("1.1.0", AggiornamentoRemoto.inCorso(agg("1.1.0", adesso - AggiornamentoRemoto.VALE_MS), "1.0.0", adesso))
    }

    @Test fun non_vale_oltre_o_nel_futuro() {
        assertNull(AggiornamentoRemoto.inCorso(agg("1.1.0", adesso - AggiornamentoRemoto.VALE_MS - 1), "1.0.0", adesso))
        assertNull(AggiornamentoRemoto.inCorso(agg("1.1.0", adesso + 3_600_000), "1.0.0", adesso))
    }

    @Test fun assente_o_malformato() {
        assertNull(AggiornamentoRemoto.inCorso(null, "1.0.0", adesso))
        for (s in listOf("null", "5", "\"ora\"", "{}", """{"versione":"1.1.0"}""", """{"versione":"","da":1}""",
            """{"versione":3,"da":1}""", """{"versione":"1.1.0","da":"1"}""")) {
            assertNull(s, AggiornamentoRemoto.inCorso(campo(s), "1.0.0", adesso))
        }
    }

    @Test fun versione_nuova_gia_nel_battito_e_finito() {
        assertNull(AggiornamentoRemoto.inCorso(agg("1.1.0", adesso - 1000), "1.1.0", adesso))
    }

    @Test fun i_testi() {
        assertEquals("Computer in aggiornamento, attendere", AggiornamentoRemoto.TESTO)
        assertEquals("PC-Prova: computer in aggiornamento alla 1.1.0, attendere. Riprende da solo.", AggiornamentoRemoto.frase("PC-Prova", "1.1.0"))
        assertEquals("PC-Prova: computer in aggiornamento, attendere. Riprende da solo.", AggiornamentoRemoto.frase("PC-Prova", ""))
    }
}
