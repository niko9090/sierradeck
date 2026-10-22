package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * PC 0.84.1, app 0.84.3 (difetto D3 del collaudo c-82): dopo un tocco su una
 * domanda l'app legge l'esito del PC, come PC e pagina. Un PC più vecchio
 * risponde solo `{"fatto":true}`: resta «Mandata», come prima.
 */
class EsitoRispostaTest {
    @Test
    fun `presa - la frase del PC`() {
        val f = Api.json.decodeFromString(Fatto.serializer(), """{"fatto":true,"esito":"presa","tentativi":1,"frase":"Presa: «Blu», la chat è andata avanti."}""")
        assertEquals("presa", f.esito)
        assertEquals(1, f.tentativi)
        assertEquals("Presa: «Blu», la chat è andata avanti.", EsitoRisposta.riga(f, "Blu"))
    }

    @Test
    fun `PC senza verifica - Mandata come prima`() {
        val f = Api.json.decodeFromString(Fatto.serializer(), """{"fatto":true}""")
        assertEquals("Mandata: «Blu». Sparisce appena il computer la riceve.", EsitoRisposta.riga(f, "Blu"))
    }
}
