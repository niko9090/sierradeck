package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Il nome scelto di un PC al posto dell'hostname (app 2.52.4). Nicholas
 * (07/10): in alto e nel cambio di computer si vedeva il nome tecnico della
 * macchina. Gli stessi casi del test vitest (`tests/fixtures/nome-pc-casi.json`).
 * Solo nomi di esempio.
 */
class NomePcTest {
    private val casi = Api.json.parseToJsonElement(File("../../tests/fixtures/nome-pc-casi.json").readText()).jsonArray

    @Test
    fun `stessi risultati della funzione condivisa su tutti i casi`() {
        assertTrue(casi.size >= 5)
        for (c in casi) {
            val o = c.jsonObject
            val pc = o["pc"]!!.jsonObject
            fun campo(n: String) = pc[n]?.jsonPrimitive?.contentOrNull
            val caso = o["caso"]!!.jsonPrimitive.content
            assertEquals(caso, o["mostra"]!!.jsonPrimitive.content, NomePc.daMostrare(campo("nomeScelto"), campo("nome"), campo("host")))
            assertEquals(caso, o["sotto"]?.jsonPrimitive?.contentOrNull, NomePc.sottotitolo(campo("nomeScelto"), campo("nome"), campo("host")))
        }
    }

    @Test
    fun `un nome da salvare - pulito e al massimo quaranta caratteri`() {
        assertEquals("Studio di casa", NomePc.valido("  Studio\tdi casa  "))
        assertEquals(NomePc.MAX, NomePc.valido("x".repeat(60)).length)
        assertEquals("", NomePc.valido("   "))
        assertTrue(File("../../src/shared/nome-pc.ts").readText().contains("NOME_PC_MAX = ${NomePc.MAX}"))
    }

    @Test
    fun `in alto - il nome scelto sul computer, l'hostname piccolo`() {
        // Il difetto: la postazione salvata prima della 2.52.4 con l'hostname, il computer ora ha un nome.
        val vecchia = Postazioni.Postazione("http://192.168.1.20:7420", "PC-ESEMPIO", true, 0L)
        val i = intestazionePc(vecchia, NomeComputer(nome = "Studio", host = "PC-ESEMPIO", nomeScelto = "Studio"), "192.168.1.20")
        assertEquals("Studio", i.nome)
        assertEquals("PC-ESEMPIO", i.sotto)
        // Un nome scritto a mano sul telefono vince.
        val aMano = vecchia.copy(nome = "Ufficio", aMano = true)
        assertEquals("Ufficio", intestazionePc(aMano, NomeComputer(nome = "Studio", host = "PC-ESEMPIO"), "x").nome)
        // Un computer vecchio: solo l'hostname, niente sottotitolo.
        val v = intestazionePc(null, NomeComputer(nome = "PC-ESEMPIO"), "192.168.1.20")
        assertEquals("PC-ESEMPIO", v.nome)
        assertNull(v.sotto)
        // Ancora nessuna risposta: il nome salvato, poi l'indirizzo.
        assertEquals("Studio", intestazionePc(vecchia.copy(nome = "Studio"), null, "x").nome)
        assertEquals("192.168.1.20", intestazionePc(null, null, "192.168.1.20").nome)
    }

    @Test
    fun `la postazione segue il nome del computer, se non l'hai scritto tu`() {
        val ip = "192.168.1.20"
        // Salvata prima della 2.52.4 con l'hostname: non è a mano, prende il nome scelto.
        assertEquals("Studio" to false, Postazioni.nomeDopo("PC-ESEMPIO", null, ip, "Studio", "PC-ESEMPIO"))
        // Salvata prima con un nome scritto a mano: resta.
        assertEquals("Ufficio" to true, Postazioni.nomeDopo("Ufficio", null, ip, "Studio", "PC-ESEMPIO"))
        // Il computer cambia ancora nome: la postazione lo segue.
        assertEquals("Fisso" to false, Postazioni.nomeDopo("Studio", false, ip, "Fisso", "PC-ESEMPIO"))
        // Scritta a mano: non la tocca nessuno.
        assertEquals("Ufficio" to true, Postazioni.nomeDopo("Ufficio", true, ip, "Fisso", "PC-ESEMPIO"))
        // Un computer vecchio (solo hostname) con una postazione che aveva solo l'indirizzo.
        assertEquals("PC-ESEMPIO" to false, Postazioni.nomeDopo(ip, null, ip, "PC-ESEMPIO", "PC-ESEMPIO"))
    }

    @Test
    fun `ovunque si mostra un PC passa da qui`() {
        val app = File("src/main/java/it/ferrariconsulenze/sierradeck/App.kt").readText()
        assertTrue(app.contains("intestazionePc("))
        assertFalse(app.contains("stato?.computer?.nome?.takeIf"))
        val comp = File("src/main/java/it/ferrariconsulenze/sierradeck/Computer.kt").readText()
        assertTrue(comp.contains("Text(p.mostra"))
        assertFalse(comp.contains("PcPonte(p.pcId, p.nome)"))
        assertTrue(File("src/main/java/it/ferrariconsulenze/sierradeck/Api.kt").readText().contains("\"/api/nome-pc\""))
    }
}
