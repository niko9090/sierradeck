package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Gestire chat, workspace e autopiloti dal telefono (app 2.55.0): le regole e
 * i testi sono quelli del PC (`src/shared/azioni-telefono.ts`), scritti in
 * `resources/azioni/azioni-0.55.json` da `tests/shared/azioni-telefono-app.test.ts`.
 */
class AzioniTelefonoTest {
    private val fx: JsonObject = Api.json.parseToJsonElement(
        javaClass.classLoader!!.getResource("azioni/azioni-0.55.json")!!.readText()
    ).jsonObject

    private fun s(o: JsonObject, k: String): String = o[k]!!.jsonPrimitive.content

    @Test
    fun `l'autopilota - la stessa validazione del PC, caso per caso`() {
        for (caso in fx["autopilota"]!!.jsonArray) {
            val c = caso.jsonObject
            val b = Api.json.decodeFromJsonElement(BozzaAutopilota.serializer(), c["bozza"]!!)
            val atteso = c["esito"]!!.jsonObject
            val nome = s(c, "nome")
            when (val e = AzioniTelefono.controlla(b)) {
                is EsitoBozza.No -> {
                    assertEquals(nome, false, atteso["ok"]!!.jsonPrimitive.boolean)
                    assertEquals(nome, s(atteso, "campo"), e.campo)
                    assertEquals(nome, s(atteso, "errore"), e.errore)
                }
                is EsitoBozza.Ok -> {
                    assertEquals(nome, true, atteso["ok"]!!.jsonPrimitive.boolean)
                    val r = atteso["richiesta"]!!.jsonObject
                    assertEquals(nome, s(r, "nome"), e.richiesta.nome)
                    assertEquals(nome, s(r, "obiettivo"), e.richiesta.obiettivo)
                    assertEquals(nome, s(r, "cwd"), e.richiesta.cwd)
                    assertEquals(nome, r["criteri"]!!.jsonArray.map { it.jsonObject["descrizione"]!!.jsonPrimitive.content }, e.richiesta.criteri.map { it.descrizione })
                    assertEquals(nome, s(r, "pubblicazione"), e.richiesta.pubblicazione)
                    assertEquals(nome, r["vaSulCloud"]?.jsonPrimitive?.boolean, e.richiesta.vaSulCloud)
                    assertEquals(nome, r["workspace"]?.jsonPrimitive?.contentOrNull, e.richiesta.workspace)
                    assertEquals(nome, s(r, "partenza"), e.richiesta.partenza)
                }
            }
        }
    }

    @Test
    fun `i nomi dei workspace, il nome dall'obiettivo, l'ultimo workspace`() {
        for (caso in fx["nomiWorkspace"]!!.jsonArray) {
            val c = caso.jsonObject
            val esistenti = c["esistenti"]!!.jsonArray.map { it.jsonPrimitive.content }
            val atteso = c["esito"]!!.jsonObject
            val e = AzioniTelefono.erroreNomeWorkspace(s(c, "nome"), esistenti)
            if (atteso["ok"]!!.jsonPrimitive.boolean) assertNull(s(c, "nome"), e) else assertEquals(s(atteso, "errore"), e)
        }
        for (caso in fx["nomeDaObiettivo"]!!.jsonArray) {
            val c = caso.jsonObject
            assertEquals(s(c, "nome"), AzioniTelefono.nomeDaObiettivo(s(c, "obiettivo")))
        }
        assertEquals(fx["ultimoWorkspace"]!!.jsonPrimitive.content, AzioniTelefono.ULTIMO_WORKSPACE)
    }

    @Test
    fun `le regole, le partenze e le conferme - parola per parola come sul PC`() {
        fun voci(k: String) = fx[k]!!.jsonArray.map { val o = it.jsonObject; Voce(s(o, "valore"), s(o, "etichetta"), s(o, "spiega")) }
        assertEquals(voci("regole"), AzioniTelefono.REGOLE)
        assertEquals(voci("partenze"), AzioniTelefono.PARTENZE)
        val c = fx["conferme"]!!.jsonObject
        fun conf(k: String) = c[k]!!.jsonObject.let { Conferma(s(it, "titolo"), s(it, "testo"), s(it, "azione")) }
        assertEquals(conf("dormi"), AzioniTelefono.confermaDormi("Esempio"))
        assertEquals(conf("chiudi"), AzioniTelefono.confermaChiudi("Esempio"))
        assertEquals(conf("sposta"), AzioniTelefono.confermaSposta("Esempio", "Lavoro"))
        assertEquals(conf("eliminaWorkspace"), AzioniTelefono.confermaEliminaWorkspace("Lavoro"))
        assertEquals(conf("rinominaWorkspace"), AzioniTelefono.confermaRinominaWorkspace("Lavoro"))
        assertEquals(conf("eliminaAutopilota"), AzioniTelefono.confermaEliminaAutopilota("Test verdi"))
    }

    @Test
    fun `le rotte della gestione passano dal ponte, e un PC di prima lo dice`() {
        for (r in listOf("/api/workspace/crea", "/api/workspace/elimina", "/api/workspace/rinomina", "/api/chat/chiudi", "/api/chat/dormi",
            "/api/chat/sveglia", "/api/chat/sposta", "/api/sfoglia", "/api/cartelle", "/api/sessioni", "/api/autopilota/crea", "/api/autopilota/elimina")) {
            assertTrue(r, r in Ponte.ROTTE)
        }
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.GESTIONE, "0.54.0"))
        assertEquals(true, FunzioniPc.disponibile(FunzionePc.GESTIONE, "0.55.0"))
        // Un ponte vecchio (PC accoppiato alla 0.54) rifiuta con «riquadro remoto»: si dice di aggiornarlo.
        val vecchio = Api.Errore(403, """{"errore":"Attraverso il ponte si può solo quello che il PC fa dal suo riquadro remoto: … «/api/sfoglia» no."}""")
        assertTrue(spiegaGestione(vecchio, "sfogliare le cartelle", "PC-ESEMPIO").contains("di prima della 0.55.0"))
        val manca = Api.Errore(404, """{"errore":"non trovato"}""")
        assertEquals("Mettere a dormire, spostare le chat, rinominare i workspace e gestire gli altri PC dal telefono arriva aggiornando PC-ESEMPIO alla 0.55.0.", spiegaGestione(manca, "mettere a dormire la chat", "PC-ESEMPIO"))
        val vero = Api.Errore(409, """{"errore":"L’ultimo workspace non si può eliminare: non resterebbe dove salvare il layout."}""")
        assertTrue(spiegaGestione(vero, "eliminare il workspace", null).endsWith("non resterebbe dove salvare il layout."))
    }

    @Test
    fun `il corpo di crea autopilota porta tutti i campi, e il PC di prima legge ancora i suoi`() = runBlocking {
        val r = (AzioniTelefono.controlla(BozzaAutopilota(obiettivo = "Porta i test a verde", cwd = "C:\\Progetti\\Esempio", criteri = "a\nb", cloud = true, partenza = "subito", workspace = "Lavoro")) as EsitoBozza.Ok).richiesta
        val visti = mutableListOf<Pair<String, JsonObject>>()
        val pc = PcFintoHttp { percorso: String, corpo: JsonObject -> visti += percorso to corpo; 200 to """{"fatto":true,"autopilota":"ap-1"}""" }
        val f = Api("http://127.0.0.1:${pc.porta}", "chiave-di-esempio").creaAutopilota(r)
        assertEquals("ap-1", f.autopilota)
        val corpo = visti.single().second
        assertEquals("C:\\Progetti\\Esempio", s(corpo, "cartella"))
        assertEquals("a\nb", s(corpo, "criteri"))
        assertEquals("subito", s(corpo, "partenza"))
        assertEquals("Lavoro", s(corpo, "workspace"))
        assertEquals(true, corpo["vaSulCloud"]!!.jsonPrimitive.boolean)
        pc.chiudi()
    }
}
