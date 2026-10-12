package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * «Progetti» rifatto (PC 0.69.0, app 2.69.0): «rifai il menu Progetti!! non si
 * capisce nulla» (Nicholas, 12/10). Sulla risposta vera di un PC alla 0.69
 * (`pannello-0.69.json`, fatta dalle funzioni del PC in
 * tests/shared/pannello-drive-app.test.ts) e su una di prima (0.60).
 */
class ProgettiVistaTest {
    private fun leggi(nome: String): PannelloDrive = Api.json.decodeFromString(
        PannelloDrive.serializer(), javaClass.classLoader!!.getResource("pannello-drive/$nome")!!.readText()
    )

    @Test
    fun `la vista arriva dal PC con lo stato in una parola`() {
        val g = leggi("pannello-0.69.json").progetti.single()
        val v = ProgettiVista.vistaDi(g)
        assertEquals("da sistemare", v.stato.parola)
        assertEquals("ambra", v.stato.colore)
        assertEquals("aspetta la tua conferma", v.stato.ragione)
        assertEquals("PORTATILE-ESEMPIO", v.dove)
        assertEquals("questo PC", v.copie.testo)
        assertEquals(1, v.chat.alLavoro)
        // Da sistemare: la riga sotto dice il motivo.
        assertEquals("aspetta la tua conferma", ProgettiVista.sotto(g))
        assertEquals(mapOf("questo-pc" to 0, "altri-pc" to 1, "da-sistemare" to 1, "tutti" to 1), ProgettiVista.conti(listOf(g)))
    }

    @Test
    fun `da un PC di prima si ricava il minimo`() {
        val g = leggi("pannello-0.60.json").progetti.single()
        val v = ProgettiVista.vistaDi(g)
        assertEquals("da-sistemare", v.stato.id)
        assertTrue("altri-pc" in v.gruppi)
    }

    private fun riga(id: String, nome: String, problemi: Int = 0, uso: String? = null, byte: Double? = null, qui: Boolean = true) = RigaProgettoDrive(
        id = id, nome = nome, ultimoUso = uso, residente = ResidenteDrive("pc", if (qui) "Questo" else "Portatile", qui),
        problemi = List(problemi) { ProblemaDrive("progetto-diviso", "Progetto diviso fra più PC") },
        spazioDrive = byte?.let { SpazioProgettoDrive(1, it) },
        cartelle = listOf(CartellaProgettoDrive("pc", "Portatile", "D:\\Città\\$nome"))
    )

    @Test
    fun `ricerca senza accenti e ordine come sul PC`() {
        val righe = listOf(riga("a", "Sito", uso = "2026-10-10"), riga("b", "App", uso = "2026-10-12", byte = 10.0), riga("c", "Vecchio", problemi = 1, qui = false))
        assertEquals(listOf("Vecchio", "App", "Sito"), ProgettiVista.ordina(righe, "stato").map { it.nome })
        assertEquals(listOf("App", "Sito", "Vecchio"), ProgettiVista.ordina(righe, "nome").map { it.nome })
        // Spazio: dal più grande; i non misurati in fondo.
        assertEquals("App", ProgettiVista.ordina(righe, "spazio").first().nome)
        assertEquals(3, ProgettiVista.cerca(righe, "citta").size)
        assertEquals(listOf("Sito"), ProgettiVista.cerca(righe, "sito").map { it.nome })
        assertEquals(listOf("Vecchio"), righe.filter { ProgettiVista.nelGruppo(it, "da-sistemare") }.map { it.nome })
    }

    @Test
    fun `Apri per prima, Togli da questo PC per ultima`() {
        val az = listOf(AzioneProgettoDrive("solo-cloud-qui"), AzioneProgettoDrive("residente-qui"), AzioneProgettoDrive("apri"))
        assertEquals(listOf("apri", "residente-qui", "solo-cloud-qui"), ProgettiVista.azioniInOrdine(az).map { it.id })
    }
}
