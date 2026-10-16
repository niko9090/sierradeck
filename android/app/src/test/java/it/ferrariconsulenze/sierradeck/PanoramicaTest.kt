package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** PC 0.77.0: le regole della Panoramica, uguali a `src/shared/panoramica.ts`. */
class PanoramicaTest {
    private fun s(id: String, stato: String, nataIl: Long, ruolo: String? = null) = SchedaPanoramica(id = id, titolo = id, stato = stato, nataIl = nataIl, ruolo = ruolo)

    @Test fun gruppiEOrdineFisso() {
        val g = RegolePanoramica.ordinaSchede(listOf(
            s("rev", "lavora", 5, "revisione"), s("norm", "ferma", 1), s("svil2", "lavora", 3, "sviluppo"),
            s("svil1", "lavora", 2, "sviluppo"), s("coll", "chiede", 9, "collaudo"), s("fine", "finita", 0, "sviluppo")
        ))
        assertEquals(listOf("chiede", "lavora", "ferma", "finita"), g.map { it.first })
        assertEquals(listOf(listOf("coll"), listOf("svil1", "svil2", "rev"), listOf("norm"), listOf("fine")), g.map { p -> p.second.map { it.id } })
    }

    @Test fun maiSalti() {
        val base = listOf(s("a", "lavora", 1, "sviluppo"), s("b", "lavora", 2, "sviluppo"), s("c", "ferma", 3), s("d", "lavora", 4, "collaudo"))
        val piatto = { x: List<SchedaPanoramica> -> RegolePanoramica.ordinaSchede(x).flatMap { p -> p.second.map { it.id } } }
        assertEquals(piatto(base), piatto(base.reversed()))
        assertEquals(listOf("a", "d", "b", "c"), piatto(base.map { if (it.id == "b") it.copy(stato = "ferma") else it }))
    }

    @Test fun linguetteEAltre() {
        val chat = (0 until 12).map { s("c$it", if (it >= 7) "lavora" else "ferma", it.toLong()) }
        val (visibili, altre) = RegolePanoramica.linguetteVisibili(RegolePanoramica.LARGHEZZA_FISSA + 5 * RegolePanoramica.LARGHEZZA_LINGUETTA, chat, "c0")
        assertFalse(altre.any { it.stato == "lavora" })
        assertEquals("c0", visibili.first().id)
        assertEquals(listOf("c0", "c7", "c8", "c9", "c10", "c11"), visibili.map { it.id })
    }

    @Test fun gruppoStabile() {
        assertEquals("chiede", RegolePanoramica.gruppoStabile("chiede", "lavora", 1000, 1000))
        assertEquals("lavora", RegolePanoramica.gruppoStabile("ferma", "lavora", 1000, 4000))
        assertEquals("ferma", RegolePanoramica.gruppoStabile("ferma", "lavora", 1000, 9000))
    }

    @Test fun righePulite() {
        val schermo = listOf("\u001B[32m● Leggo src/somma.js\u001B[0m", "● Scrivo il test", "✻ Brewing… (12s · esc to interrupt)", "────────", "❯ ", "  ⏵⏵ bypass permissions on (shift+tab to cycle)")
        assertEquals(listOf("● Scrivo il test", "✻ Brewing… (12s · esc to interrupt)"), RegolePanoramica.righeDalVivo(schermo))
        assertEquals("da 3 min", RegolePanoramica.daQuanto(0, 180_000))
    }

    @Test fun molteChatCheChiedono() {
        val chat = (0 until 28).map { s("c$it", if (it < 26) "chiede" else "ferma", it.toLong()) }
        val (visibili, altre) = RegolePanoramica.linguetteVisibili(RegolePanoramica.LARGHEZZA_FISSA + 20 * RegolePanoramica.LARGHEZZA_LINGUETTA, chat, "c27")
        assertEquals(9, visibili.size)
        assertEquals(true, visibili.any { it.id == "c27" })
        assertEquals(19, altre.size)
    }

    @Test fun sezioniDellaPanoramica2() {
        val schede = listOf(
            s("ferma-mia", "ferma", 1), s("lavora", "lavora", 2, "sviluppo").copy(specialista = true),
            s("chiede", "chiede", 3), s("finita", "finita", 4, "sviluppo").copy(specialista = true)
        )
        val z = RegolePanoramica.sezioni(schede)
        assertEquals(listOf("chiede", "lavora"), z.adesso.map { it.id })
        assertEquals(listOf("ferma-mia"), z.chat.map { it.id })
        assertEquals(listOf("finita"), z.finite.map { it.id })
    }

    @Test fun conversazioneSenzaEventi() {
        val b = listOf(Battuta(da = "tu", testo = "1"), Battuta(da = "nota", testo = "2"), Battuta(da = "lui", testo = "3"), Battuta(da = "nota", testo = "4"))
        val (messaggi, eventi) = RegolePanoramica.separaConversazione(b)
        assertEquals(listOf("1", "3"), messaggi.map { it.testo })
        assertEquals(listOf("4", "2"), eventi.map { it.testo })
    }

    @Test fun righePulite078() {
        val schermo = listOf(
            "╭─── Claude Code v2.1.301 ───────────────────────╮",
            "│ ▐▛███▜▌  Opus 5.5 · Claude Max │",
            "──────────── Chat B ────────────────────────",
            "│ Scrivo src/somma.js │",
            "● Fatto il test", "● Fatto il test",
            "Opus 5.5 · settimana 12% · \$3"
        )
        assertEquals(listOf("Scrivo src/somma.js", "● Fatto il test"), RegolePanoramica.righeDalVivo(schermo, 6))
    }

    @Test fun pianoDalPc() {
        val p = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString<Panoramica>(
            """{"workspace":"W","situazione":{"obiettivo":"o","stato":{"id":"da-verificare","parola":"da verificare","colore":"ambra","simbolo":"◐"},"criteri":{"fatti":0,"totali":2,"testo":"0/2","elenco":[{"descrizione":"a","esito":"no"},{"descrizione":"b","esito":"mai"}]}},"piano":[{"fase":"in-revisione","nome":"In revisione","compiti":[{"id":"c-2","testo":"Media","fase":"in-revisione","ruolo":"revisione","autore":"sviluppo","giri":1}]}],"schede":[{"id":"p","stato":"ferma","specialista":true,"soloMia":true}]}"""
        )
        assertEquals("da verificare", p.situazione?.stato?.parola)
        assertEquals(listOf("no", "mai"), p.situazione?.criteri?.elenco?.map { it.esito })
        assertEquals("sviluppo", p.piano.first().compiti.first().autore)
        assertEquals(true, p.schede.first().soloMia)
    }

    @Test fun niente_rumore() {
        val schermo = listOf(";2;153;153m⎿ \$ node --test", "Opus 5.5 · contesto 5% · 5 ore 1% (azzera 17:00)")
        assertEquals(listOf("⎿ \$ node --test"), RegolePanoramica.righeDalVivo(schermo))
    }
}
