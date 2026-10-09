package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * La prova dal vero (app 2.55.0): l'`Api` dell'app contro un PC vero, una
 * copia di prova del programma avviata con `SIERRADECK_PROVA` (dati, porte e
 * configurazione di Claude Code tutti suoi). Senza le variabili
 * `SIERRADECK_PROVA_URL`, `SIERRADECK_PROVA_CHIAVE` e
 * `SIERRADECK_PROVA_CARTELLA` si salta: nei test di tutti i giorni non c'è.
 *
 * È la prova che ha trovato le cause del 09/10 (scheda del quaderno
 * `gestire-dal-telefono-chat-workspace-autopiloti.md`).
 */
class ProvaDalVeroTest {
    private val url = System.getenv("SIERRADECK_PROVA_URL") ?: ""
    private val chiave = System.getenv("SIERRADECK_PROVA_CHIAVE") ?: ""
    private val cartella = System.getenv("SIERRADECK_PROVA_CARTELLA") ?: ""

    @Test
    fun `workspace, chat nuova, dormi, sposta, chiudi, elimina - come li chiede l'app`() = runBlocking {
        assumeTrue(url.isNotBlank() && chiave.isNotBlank() && cartella.isNotBlank())
        val api = Api(url, chiave)
        val nome = "Prova app " + (System.currentTimeMillis() % 100000)
        api.creaWorkspace(nome)
        delay(1500)
        assertTrue(nome in (api.stato().workspace?.nomi ?: emptyList()))
        api.apri(cartella, workspace = nome)
        delay(6000)
        val nuove = api.stato().chat.filter { it.cwd.equals(cartella, ignoreCase = true) }
        println("chat nella cartella: ${nuove.map { it.titolo + "/" + it.viva }}")
        assertEquals("una sola chat nuova, anche con più finestre", 1, nuove.size)
        val id = nuove.single().id
        api.dormiChat(id); delay(1500)
        assertEquals(false, api.stato().chat.first { it.id == id }.viva)
        api.svegliaChat(id); delay(5000)
        val altro = "$nome bis"
        api.creaWorkspace(altro); delay(1500)
        api.cambiaWorkspace(nome); delay(2000)
        api.spostaChat(id, altro); delay(2000)
        assertTrue(api.stato().workspace!!.chat.any { it.workspace == altro })
        api.rinominaWorkspace(altro, "$altro 2"); delay(1500)
        api.eliminaWorkspace("$altro 2"); delay(1500)
        api.eliminaWorkspace(nome); delay(1500)
        val dopo = api.stato().workspace?.nomi ?: emptyList()
        assertTrue(nome !in dopo && "$altro 2" !in dopo)
        // Attraverso il ponte la rotta arriva al PC (che dice di non conoscere quel PC), non si ferma nell'app.
        val e = try { api.suPc("pc-esempio").creaWorkspace("Là"); null } catch (x: Api.Errore) { x }
        assertNotEquals("il telefono non deve più rifiutare da solo", 403, e?.codice)
        println("ponte verso un PC che non c'è: ${e?.codice} ${e?.corpo?.take(160)}")
    }
}
