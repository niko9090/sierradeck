package it.glos.sierradeck

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AvvisiTest {

    private fun stato(json: String) = JSONObject(json)

    @Test
    fun `una domanda che aspetta si annuncia subito`() {
        // Non al secondo giro: una domanda aperta sta aspettando adesso, e
        // l'app si apre proprio per quello.
        val visti = mutableSetOf<String>()
        val avvisi = Avvisi.daAnnunciare(
            stato("""{"domande":[{"id":"d-1","testo":"Quale chiave uso?"}]}"""),
            visti,
            primoGiro = true
        )
        assertEquals(1, avvisi.size)
        assertTrue(avvisi[0].testo.contains("Quale chiave"))
    }

    @Test
    fun `la stessa domanda non si annuncia due volte`() {
        // Una notifica che si ripete ogni cinque secondi si impara a ignorare,
        // e allora smette di servire proprio quando serve.
        val visti = mutableSetOf<String>()
        val s = stato("""{"domande":[{"id":"d-1","testo":"x"}]}""")
        Avvisi.daAnnunciare(s, visti, primoGiro = false)
        assertEquals(0, Avvisi.daAnnunciare(s, visti, primoGiro = false).size)
    }

    @Test
    fun `un autopilota che si ferma chiede la tua attenzione`() {
        // Prima si taceva, e lo si scopriva la mattina dopo: finche' non lo
        // guardi, quel lavoro non prosegue.
        val avvisi = Avvisi.daAnnunciare(
            stato("""{"autopiloti":[{"id":"ap-1","nome":"Notte","stato":"sospeso","motivoSospensione":"la verifica non parte"}]}"""),
            mutableSetOf(),
            primoGiro = false
        )
        assertEquals(1, avvisi.size)
        assertTrue(avvisi[0].titolo.contains("Notte"))
        assertTrue(avvisi[0].testo.contains("verifica"))
    }

    @Test
    fun `anche un lavoro fallito`() {
        val avvisi = Avvisi.daAnnunciare(
            stato("""{"autopiloti":[{"id":"ap-1","nome":"Notte","stato":"fallito"}]}"""),
            mutableSetOf(),
            primoGiro = false
        )
        assertEquals(1, avvisi.size)
    }

    @Test
    fun `chi riparte torna annunciabile`() {
        // Se domani si ferma di nuovo e' una notizia nuova, e va detta.
        val visti = mutableSetOf<String>()
        val fermo = stato("""{"autopiloti":[{"id":"ap-1","nome":"N","stato":"sospeso"}]}""")
        val vivo = stato("""{"autopiloti":[{"id":"ap-1","nome":"N","stato":"lavoro"}]}""")
        assertEquals(1, Avvisi.daAnnunciare(fermo, visti, primoGiro = false).size)
        Avvisi.daAnnunciare(vivo, visti, primoGiro = false)
        assertEquals(1, Avvisi.daAnnunciare(fermo, visti, primoGiro = false).size)
    }

    @Test
    fun `al primo giro non si annuncia quello che e gia successo`() {
        // Cinque notifiche all'apertura dell'app insegnano a ignorare anche
        // quella che conta.
        val avvisi = Avvisi.daAnnunciare(
            stato("""{"autopiloti":[{"id":"a","nome":"N","stato":"finito"},{"id":"b","nome":"M","stato":"sospeso"}]}"""),
            mutableSetOf(),
            primoGiro = true
        )
        assertEquals(0, avvisi.size)
    }

    @Test
    fun `due lavori finiti non si cancellano a vicenda`() {
        // Notifiche con lo stesso numero si sostituiscono: due lavori che
        // finiscono a distanza di minuti devono restare due.
        val avvisi = Avvisi.daAnnunciare(
            stato("""{"autopiloti":[{"id":"a","nome":"N","stato":"finito"},{"id":"b","nome":"M","stato":"finito"}]}"""),
            mutableSetOf(),
            primoGiro = false
        )
        assertEquals(2, avvisi.size)
        assertTrue(avvisi[0].id != avvisi[1].id)
    }

    @Test
    fun `chi sta lavorando non disturba nessuno`() {
        val avvisi = Avvisi.daAnnunciare(
            stato("""{"autopiloti":[{"id":"a","nome":"N","stato":"lavoro"},{"id":"b","nome":"M","stato":"intervista"}]}"""),
            mutableSetOf(),
            primoGiro = false
        )
        assertEquals(0, avvisi.size)
    }

    @Test
    fun `uno stato senza niente dentro non fa danni`() {
        assertEquals(0, Avvisi.daAnnunciare(stato("{}"), mutableSetOf(), primoGiro = false).size)
    }
}
