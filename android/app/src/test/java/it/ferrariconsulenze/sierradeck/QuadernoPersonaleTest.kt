package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il Quaderno personale (app 2.57.0) sulla risposta di un computer alla 0.57.0
 * fatta dalle rotte vere su dati d'esempio (`tests/shared/quaderno-personale-app.test.ts`
 * controlla che sia la stessa): si legge, i testi degli esiti e il valore
 * nascosto sono quelli del PC, e la funzione è spenta sui PC più vecchi.
 */
class QuadernoPersonaleTest {
    private val fx: JsonObject = Api.json.parseToJsonElement(
        javaClass.classLoader!!.getResource("quaderno-personale/quaderno-0.57.json")!!.readText()
    ).jsonObject

    @Test
    fun `la risposta del PC si legge`() {
        val s = Api.json.decodeFromString(StatoQuadernoPersonale.serializer(), fx["stato"].toString())
        assertTrue(s.disponibile)
        assertNull(s.perche)
        assertEquals("Email di contatto", s.voci.single().nome)
        assertEquals("per le pagine pubbliche", s.voci.single().nota)
        assertTrue(s.consensi.isEmpty())
        assertEquals("nessuna-risposta", s.usi.single().esito)
        assertEquals("Pagina legale", s.usi.single().chat)
    }

    @Test
    fun `gli esiti in parole sono quelli del PC`() {
        for ((esito, testo) in fx["esiti"]!!.jsonObject) assertEquals(esito, testo.jsonPrimitive.content, QuadernoPersonaleTesti.esito(esito))
    }

    @Test
    fun `il valore negli elenchi resta nascosto come sul PC`() {
        for ((valore, nascosto) in fx["nascosti"]!!.jsonObject) assertEquals(valore, nascosto.jsonPrimitive.content, QuadernoPersonaleTesti.nascosto(valore))
        assertFalse(QuadernoPersonaleTesti.nascosto("esempio@example.com").contains("example"))
    }

    @Test
    fun `un PC senza il quaderno risponde spento, non con un errore secco`() {
        val s = Api.json.decodeFromString(StatoQuadernoPersonale.serializer(), """{"disponibile":false,"perche":"Il portachiavi di Windows non è disponibile","voci":[],"consensi":[],"usi":[],"richieste":[]}""")
        assertFalse(s.disponibile)
        assertTrue(s.perche!!.contains("portachiavi"))
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.QUADERNO_PERSONALE, "0.56.4"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.QUADERNO_PERSONALE, "0.57.0"))
        assertTrue(FunzioniPc.mancaSulPc(Api.Errore(409, """{"errore":"Questo computer non ha ancora il quaderno personale: aggiornalo alla 0.57.0."}""")))
    }
}
