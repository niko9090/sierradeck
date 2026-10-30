package it.ferrariconsulenze.sierradeck

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
 * Le quattro voci fisse e «indietro» (app 2.83.0): la regola è in
 * `Navigazione`, pura, e si prova qui senza Compose.
 */
class NavigazioneTest {
    private val telefono = Api.json.parseToJsonElement(File("src/main/assets/menu.json").readText()).jsonObject["telefono"]!!.jsonArray.map { it.jsonObject }

    @Test
    fun `quattro voci, uguali a quelle che il PC scrive per il telefono`() {
        assertEquals(listOf("adesso", "chat", "progetti", "altro"), VoceBarra.entries.map { it.id })
        assertEquals(telefono.map { it["id"]!!.jsonPrimitive.content }, VoceBarra.entries.map { it.id })
        assertEquals(telefono.map { it["nome"]!!.jsonPrimitive.content }, VoceBarra.entries.map { it.nome })
        for (v in VoceBarra.entries) {
            val l = telefono.first { it["id"]!!.jsonPrimitive.content == v.id }["linguette"]!!.jsonArray.map { it.jsonPrimitive.content }
            assertEquals(v.id, l, linguetteDi(v))
        }
    }

    @Test
    fun `l app si apre su Adesso e da Adesso indietro esce`() {
        assertEquals(VoceBarra.ADESSO, Navigazione.INIZIO.voce)
        assertNull(Navigazione.indietro(Navigazione.INIZIO))
    }

    @Test
    fun `indietro chiude la sezione, poi torna alla prima linguetta, poi ad Adesso`() {
        val sezione = Navigazione.apri(Navigazione.INIZIO, SezioneAltro.CONSUMI)
        assertEquals(VoceBarra.ALTRO, sezione.voce)
        val elenco = Navigazione.indietro(sezione)!!
        assertEquals(VoceBarra.ALTRO, elenco.voce)
        assertNull(elenco.sezione)
        assertEquals(VoceBarra.ADESSO, Navigazione.indietro(elenco)!!.voce)

        val negozio = Navigazione.linguetta(Navigazione.tocca(Navigazione.INIZIO, VoceBarra.CHAT), 2)
        assertEquals(2, negozio.linguetta)
        val chat = Navigazione.indietro(negozio)!!
        assertEquals(VoceBarra.CHAT, chat.voce)
        assertEquals(0, chat.linguetta)
        assertEquals(VoceBarra.ADESSO, Navigazione.indietro(chat)!!.voce)
    }

    @Test
    fun `ogni voce ricorda la sua linguetta, e toccarla di nuovo torna all inizio`() {
        var p = Navigazione.tocca(Navigazione.INIZIO, VoceBarra.PROGETTI)
        p = Navigazione.linguetta(p, 1)
        p = Navigazione.tocca(p, VoceBarra.CHAT)
        assertEquals(0, p.linguetta)
        p = Navigazione.tocca(p, VoceBarra.PROGETTI)
        assertEquals(1, p.linguetta)
        p = Navigazione.tocca(p, VoceBarra.PROGETTI)
        assertEquals(0, p.linguetta)
        val altro = Navigazione.tocca(Navigazione.apri(p, SezioneAltro.INFO), VoceBarra.ALTRO)
        assertNull(altro.sezione)
    }

    @Test
    fun `le destinazioni di prima portano nella voce giusta`() {
        val da = Navigazione.linguetta(Navigazione.tocca(Navigazione.INIZIO, VoceBarra.CHAT), 2)
        assertEquals(VoceBarra.ADESSO, Navigazione.verso(da, Scheda.DOMANDE).voce)
        assertEquals(VoceBarra.ADESSO, Navigazione.verso(da, Scheda.AUTOPILOTI).voce)
        Navigazione.verso(da, Scheda.CHAT).let { assertEquals(VoceBarra.CHAT, it.voce); assertEquals(0, it.linguetta) }
        Navigazione.verso(da, Scheda.FILE).let { assertEquals(VoceBarra.PROGETTI, it.voce); assertEquals(1, it.linguetta) }
        Navigazione.verso(da, Scheda.PROGETTI).let { assertEquals(VoceBarra.PROGETTI, it.voce); assertEquals(0, it.linguetta) }
        assertEquals(SezioneAltro.SALUTE, Navigazione.verso(da, Scheda.SALUTE).sezione)
        Navigazione.verso(da, Scheda.IMPOSTAZIONI).let { assertEquals(VoceBarra.ALTRO, it.voce); assertNull(it.sezione) }
    }

    @Test
    fun `ogni funzione a due tocchi al massimo`() {
        // Una voce della barra, poi una linguetta o una sezione di Altro: due tocchi.
        for (v in VoceBarra.entries) {
            val p = Navigazione.tocca(Navigazione.INIZIO, v)
            for (i in linguetteDi(v).indices) assertEquals(i, Navigazione.linguetta(p, i).linguetta)
        }
        for (s in SezioneAltro.entries) assertEquals(s, Navigazione.apri(Navigazione.tocca(Navigazione.INIZIO, VoceBarra.ALTRO), s).sezione)
    }

    @Test
    fun `Cerca porta nella sezione di Altro che ha quell impostazione`() {
        for (s in SezioneAltro.entries) s.impostazione?.let { assertEquals(it, s, SezioneAltro.diImpostazione(it)) }
        // Nella sezione «chat» solo il quaderno personale ha la sua sezione (Revisione c-46).
        assertEquals(SezioneAltro.QUADERNO, SezioneAltro.diImpostazione("chat", "quaderno-personale"))
        assertEquals(SezioneAltro.CHAT, SezioneAltro.diImpostazione("chat", "pin"))
        assertEquals(SezioneAltro.INFO, SezioneAltro.diImpostazione("sconosciuta"))
    }

    @Test
    fun `i pallini della barra, con i colori della tabella del PC`() {
        assertNull(Pallini.di(null).adesso)
        val fermo = Pallini.di(Stato(autopiloti = listOf(AutopilotaBreve("a", stato = "sospeso")), domandeInAttesa = 2))
        assertTrue(fermo.adesso!!.rosso)
        assertEquals(2, fermo.adesso!!.numero)
        val chiede = Pallini.di(Stato(domandeInAttesa = 1)).adesso!!
        assertFalse(chiede.rosso)
        assertEquals("una domanda per te", chiede.descrizione)
        assertEquals(0, Pallini.di(Stato(autopiloti = listOf(AutopilotaBreve("a", stato = "pronto")))).adesso!!.numero)
        assertNull(Pallini.di(Stato(autopiloti = listOf(AutopilotaBreve("a", stato = "lavoro")))).adesso)
        val sceglie = Pallini.di(Stato(chat = listOf(Chat(id = "c", chiede = true)), domandeInAttesa = 0))
        assertEquals(1, sceglie.chat!!.numero)
    }

    @Test
    fun `le parti dell autopilota stanno in una pagina, le domande per prime`() {
        assertEquals("domande", sezioniAutopilota(1).first())
        assertFalse("domande" in sezioniAutopilota(0))
        // L'autopilota unico (PC 0.86.x): l'avanzamento e i file.
        assertEquals(listOf("avanzamento", "file"), sezioniAutopilota(0))
    }
}
