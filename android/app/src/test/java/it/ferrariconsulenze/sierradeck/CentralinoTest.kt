package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.dati.Composizione
import it.ferrariconsulenze.sierradeck.dati.Postazioni
import it.ferrariconsulenze.sierradeck.rete.Centralino
import it.ferrariconsulenze.sierradeck.rete.Contatto
import it.ferrariconsulenze.sierradeck.rete.Diario
import it.ferrariconsulenze.sierradeck.rete.Esito
import it.ferrariconsulenze.sierradeck.rete.IndirizzoNoto
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import it.ferrariconsulenze.sierradeck.rete.ProvaTelefono
import it.ferrariconsulenze.sierradeck.rete.Reti
import it.ferrariconsulenze.sierradeck.rete.Rubrica
import it.ferrariconsulenze.sierradeck.rete.Strade
import it.ferrariconsulenze.sierradeck.rete.TipoStrada
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.TimeUnit

/**
 * Il Centralino contro un PC finto vero (socket su 127.0.0.1): la chiave parte
 * solo verso chi prova di essere lui, un PC che non ci conosce non la riceve,
 * le cadute aspettano prima di riprovare, le scritture portano l'id.
 */
class CentralinoTest {
    private val chiave = "chiave-di-prova-0123456789"
    private val segno = ProvaTelefono.segno(chiave)
    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val finti = mutableListOf<PcFintoHttp>()

    @After fun chiudi() { finti.forEach { it.chiudi() }; ambito.cancel() }

    private class RubricaFinta(pc: List<PcNoto>) : Rubrica {
        val stato = MutableStateFlow(pc)
        override val elenco: StateFlow<List<PcNoto>> = stato
        override val corrente = MutableStateFlow<String?>(pc.firstOrNull()?.id)
        override val pronta = MutableStateFlow(true)
        override fun scegli(id: String?) { corrente.value = id }
        override fun impara(id: String, impronta: String?, indirizzi: List<IndirizzoNoto>, versione: String?) {
            stato.value = stato.value.map { if (it.id == id) Composizione.impara(it, impronta, indirizzi, versione) else it }
        }
        override fun riuscita(id: String, indirizzo: String, rete: String?) {
            stato.value = stato.value.map { if (it.id == id) Composizione.riuscita(it, indirizzo, rete, 1) else it }
        }
        override fun saProvare(id: String) { stato.value = stato.value.map { if (it.id == id) it.copy(saProvare = true) else it } }
        override fun accoppiato(indirizzo: String, chiave: String, nome: String, impronta: String, indirizzi: List<IndirizzoNoto>) = indirizzo
        override fun dimentica(id: String) { stato.value = stato.value.filter { it.id != id } }
    }

    private class RetiFinte(var casa: Boolean = true, var vpn: Boolean = false) : Reti {
        private val c = OkHttpClient.Builder().connectTimeout(1, TimeUnit.SECONDS).build()
        override fun adesso() = Strade.RetiAdesso(casa, vpn)
        override fun cliente(tipo: TipoStrada) = c
        override fun osserva(cambiata: () -> Unit) = Unit
    }

    /** Un PC che risponde a `/api/ciao` come quelli nuovi; `provaGiusta = false` = non conosce questo telefono. */
    private fun pc(impronta: String = "impronta-a", provaGiusta: Boolean = true, rotte: (String) -> Pair<Int, String> = { 200 to "{}" }): PcFintoHttp {
        val f = PcFintoHttp { percorso, _ ->
            if (percorso.startsWith("/api/ciao")) {
                val sfida = percorso.substringAfter("sfida=").substringBefore('&')
                val prova = if (provaGiusta) ProvaTelefono.prova(segno, sfida) else ProvaTelefono.prova(ProvaTelefono.segno("altra"), sfida)
                200 to """{"programma":"sierradeck","versione":"0.101.0","impronta":"$impronta","prova":"$prova","saProvare":true}"""
            } else rotte(percorso)
        }
        finti += f
        return f
    }

    private fun centralino(vararg pc: PcNoto, reti: Reti = RetiFinte()): Pair<Centralino, RubricaFinta> {
        val r = RubricaFinta(pc.toList())
        return Centralino(r, reti, Diario(null), ambito) to r
    }

    private fun noto(porta: Int, impronta: String = "", saProvare: Boolean = false) =
        PcNoto(id = "http://127.0.0.1:$porta", nome = "Prova", chiave = chiave, impronta = impronta, saProvare = saProvare)

    @Test
    fun `la chiave parte dopo la prova giusta e il contatto dice collegato in wifi`() = runBlocking {
        val f = pc()
        val (c, r) = centralino(noto(f.porta))
        val e = c.chiama("http://127.0.0.1:${f.porta}", "/api/stato")
        assertTrue(e is Esito.Riuscito)
        val ciao = f.arrivate.first()
        assertTrue(ciao.first.startsWith("/api/ciao"))
        assertNull("al ciao la chiave non parte", ciao.second)
        assertEquals(chiave, f.arrivate.last().second)
        assertTrue(c.contatti.value.values.single() is Contatto.Collegato)
        assertEquals("impronta-a", r.stato.value.single().impronta)
        assertTrue("da qui in poi deve provare", r.stato.value.single().saProvare)
    }

    @Test
    fun `un PC che non conosce il telefono non riceve la chiave`() = runBlocking {
        val f = pc(provaGiusta = false)
        val (c, _) = centralino(noto(f.porta))
        val e = c.chiama("http://127.0.0.1:${f.porta}", "/api/stato")
        assertTrue(e is Esito.Rete)
        assertTrue(f.arrivate.all { it.second == null })
        assertTrue(c.contatti.value.values.single() is Contatto.NonMiConosce)
    }

    @Test
    fun `un altro computer allo stesso indirizzo non riceve la chiave`() = runBlocking {
        val f = pc(impronta = "impronta-b")
        val (c, _) = centralino(noto(f.porta, impronta = "impronta-a"))
        val e = c.chiama("http://127.0.0.1:${f.porta}", "/api/stato")
        assertTrue(e is Esito.Rete)
        assertTrue(f.arrivate.all { it.second == null })
        assertTrue(c.contatti.value.values.single() is Contatto.NonCollegato)
    }

    @Test
    fun `una rotta che il PC non ha e un no con motivo sono cose diverse`() = runBlocking {
        val f = pc { p -> if (p == "/api/nuova") 404 to """{"errore":"non trovato"}""" else 404 to """{"errore":"Quella chat non c'è più."}""" }
        val (c, _) = centralino(noto(f.porta))
        val id = "http://127.0.0.1:${f.porta}"
        val manca = c.chiama(id, "/api/nuova")
        assertTrue(manca is Esito.MancaSulPc)
        assertEquals("0.101.0", (manca as Esito.MancaSulPc).versionePc)
        val no = c.chiama(id, "/api/dentro", "{}")
        assertEquals("Quella chat non c'è più.", (no as Esito.Rifiuto).motivo)
    }

    @Test
    fun `le scritture portano l'id della richiesta`() = runBlocking {
        val f = pc()
        val (c, _) = centralino(noto(f.porta))
        c.chiama("http://127.0.0.1:${f.porta}", "/api/scrivi", """{"testo":"ciao"}""", idRichiesta = "id-1")
        assertEquals("id-1", f.arrivate.last().third)
    }

    @Test
    fun `un PC spento non si riprova a ogni chiamata ma dopo l'attesa, e Riprova la salta`() = runBlocking {
        val f = pc()
        val porta = f.porta
        f.chiudi()
        val (c, _) = centralino(noto(porta))
        val id = "http://127.0.0.1:$porta"
        val t0 = System.currentTimeMillis()
        assertTrue(c.chiama(id, "/api/stato") is Esito.Rete)
        assertTrue(c.contatti.value[id] is Contatto.NonCollegato)
        // Subito dopo: niente gara (dentro l'attesa di 1 s), risposta immediata.
        val t1 = System.currentTimeMillis()
        assertTrue(c.chiama(id, "/api/stato") is Esito.Rete)
        assertTrue("dentro l'attesa non si rifà la gara", System.currentTimeMillis() - t1 < 500)
        val dal = (c.contatti.value[id] as Contatto.NonCollegato).dal
        assertTrue(dal >= t0)
        c.riprova(id)
        assertTrue(c.chiama(id, "/api/stato") is Esito.Rete)
        assertEquals("«non collegato dalle» conta dalla prima caduta", dal, (c.contatti.value[id] as Contatto.NonCollegato).dal)
    }

    @Test
    fun `fuori casa senza VPN le strade si saltano e il motivo lo dice`() = runBlocking {
        val f = pc()
        val (c, _) = centralino(noto(f.porta), reti = RetiFinte(casa = false, vpn = false))
        val e = c.chiama("http://127.0.0.1:${f.porta}", "/api/stato")
        assertTrue(e is Esito.Rete)
        assertTrue(f.arrivate.isEmpty())
        assertTrue((e as Esito.Rete).motivo.contains("wifi"))
    }

    @Test
    fun `una risposta oltre il tetto si ferma senza leggerla tutta`() = runBlocking {
        val grande = "x".repeat(300 * 1024)
        val f = pc { 200 to "\"$grande\"" }
        val (c, _) = centralino(noto(f.porta))
        val e = c.chiama("http://127.0.0.1:${f.porta}", "/api/file/leggi", "{}")
        assertEquals(413, (e as Esito.Rifiuto).codice)
        assertFalse(e.motivo.isBlank())
    }

    @Test
    fun `le attese dopo un fallimento crescono fino a 15 secondi e non oltre`() {
        assertEquals(listOf(0L, 1_000L, 2_000L, 4_000L, 8_000L, 15_000L, 15_000L), (0..6).map { Strade.attesaDopo(it) })
    }

    @Test
    fun `la rubrica converte le preferenze di prima senza perdere niente`() {
        val p = Postazioni.Postazione(indirizzo = "http://192.168.1.10:47640", nome = "Casa", tenuta = true, ultimoUso = 5, host = "h")
        val vecchi = Composizione.Percorsi(impronta = "imp", indirizzi = listOf("http://100.64.0.2:47640", "http://192.168.1.10:47640"), buono = "http://100.64.0.2:47640")
        val n = Composizione.pc(p, "k", null, vecchi)
        assertEquals("http://192.168.1.10:47640", n.id)
        assertEquals("imp", n.impronta)
        assertEquals("k", n.chiave)
        assertEquals("quello che funzionava va provato per primo", "http://100.64.0.2:47640", n.indirizzi.first().indirizzo)
        assertEquals(listOf("tailscale", "casa"), n.indirizzi.map { it.tipo })
        val imparato = Composizione.impara(n, "un-altra", emptyList(), "0.101.0")
        assertEquals("un'impronta nota non si sovrascrive", "imp", imparato.impronta)
    }
}
