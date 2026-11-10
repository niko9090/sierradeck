package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le due procedure con percentuale e passi (k-310): «Sposta su questo PC» e
 * «Libera spazio sul Drive». Le risposte qui sotto hanno la forma di quelle
 * del PC (`vistaSposta`, `creaLiberaSpazioApp`).
 */
class ProcedureTest {
    private fun sposta(json: String): VistaSpostaDrive = Api.json.decodeFromString(VistaSpostaDrive.serializer(), json)
    private fun libera(json: String): VistaLiberaApp = Api.json.decodeFromString(VistaLiberaApp.serializer(), json)

    @Test
    fun `uno spostamento che scarica dice percentuale, passi e numeri`() {
        val v = sposta("""{"progetto":"p1","nome":"Alfa","daNome":"Ufficio","fase":"scarico","messaggio":"Scarico.","percorso":"x",
            "fileFatti":120,"fileTotali":300,"byteFatti":41943040,"byteTotali":1288490188,"percentuale":55,"percentualePasso":40,"puoRiprovare":false}""")
        assertEquals(55, SpostaRegole.percentuale(v))
        assertEquals(listOf("fatto", "fatto", "in-corso", "da-fare", "da-fare", "da-fare"), SpostaRegole.stati(v))
        assertEquals("120 di 300 file · 40 MB di 1,2 GB · 40%", SpostaRegole.dettaglio(v))
        assertEquals("Sposto «Alfa» da Ufficio su questo PC", SpostaRegole.titolo(v))
        assertNull(SpostaRegole.doveFermo(v))
    }

    @Test
    fun `l'attesa del PC di prima e' il secondo passo`() {
        val v = sposta("""{"fase":"attesa-proprietario","nome":"Alfa","daNome":"Ufficio"}""")
        assertEquals("in-corso", SpostaRegole.stati(v)[1])
    }

    @Test
    fun `una fermata segna in rosso il passo dove si e' fermata e offre Riprova`() {
        val v = sposta("""{"fase":"fallita","nome":"Alfa","errore":"un’impronta non torna","fallitaIn":"verifica","puoRiprovare":true,"percentuale":0}""")
        assertEquals(listOf("fatto", "fatto", "fatto", "errore", "da-fare", "da-fare"), SpostaRegole.stati(v))
        assertEquals("Si è fermato al passo 4 di 6: Verifico le impronte, file per file.", SpostaRegole.doveFermo(v))
        assertTrue(SpostaRegole.finita(v))
        // Senza `fallitaIn` (PC di prima, o fermata nei controlli): il primo passo.
        assertEquals("errore", SpostaRegole.stati(sposta("""{"fase":"fallita"}"""))[0])
    }

    @Test
    fun `a cosa fatta tutto e' fatto, anche da un PC che non manda la percentuale`() {
        val v = sposta("""{"fase":"fatta","nome":"Alfa"}""")
        assertEquals(100, SpostaRegole.percentuale(v))
        assertTrue(SpostaRegole.stati(v).all { it == "fatto" })
    }

    @Test
    fun `il pannello porta lo spostamento`() {
        val p = Api.json.decodeFromString(PannelloDrive.serializer(), """{"progetti":[],"sposta":{"fase":"verifica","nome":"Alfa","percentuale":90}}""")
        assertEquals(90, SpostaRegole.percentuale(p.sposta!!))
    }

    private val vistaLibera = """{"misurata":true,"percentuale":50,"inCorso":"recupero",
        "righe":[
          {"id":"chat-non-usate","titolo":"Chat non usate","breve":"12 chat","spiega":"…","stima":209715200,"circa":false,"liberaSubito":true,"annullabile":false,
           "azione":"pulisci","tipo":"chat-non-usate","bottone":"Togli dal Drive","conferma":"Si cancellano dal Drive.","stato":"fatto","motivo":"Tolte 12 chat.","prima":3221225472,"dopo":3011510272},
          {"id":"recupero","titolo":"Svuota il recupero","breve":"…","spiega":"…","stima":104857600,"circa":false,"liberaSubito":true,"annullabile":false,
           "azione":"svuota","bottone":"Svuota adesso","conferma":"Si cancella tutto il recupero.","stato":"in-corso"}
        ],
        "prima":{"percentuale":99.8,"usato":16000000000,"limite":16106127360,"sierraDeck":3221225472,"fuori":12778774528},
        "adesso":{"percentuale":98.5,"usato":15800000000,"limite":16106127360,"sierraDeck":3011510272,"fuori":12788489728},
        "liberati":209715200,"drivePieno":true,"inSospeso":[{"titolo":"Chat non usate","byte":1048576}]}"""

    @Test
    fun `libera spazio dice percentuale, passo in corso, byte prima e dopo`() {
        val v = libera(vistaLibera)
        assertEquals("Passo 2 di 2: Svuota il recupero", LiberaRegole.inCorso(v))
        val fatto = v.righe[0]
        assertEquals("Tolte 12 chat. SierraDeck sul Drive: 3,0 GB → 2,8 GB.", LiberaRegole.esito(fatto))
        assertNull(LiberaRegole.tasto(fatto))
        assertEquals("Libera 200 MB · non si annulla", LiberaRegole.stima(fatto))
        assertEquals("99,8% · 15 GB di 15 GB", LiberaRegole.quota(v.prima!!))
        assertEquals("Dal 99,8% al 98,5% · SierraDeck ha liberato 200 MB. Google aggiorna la quota con un po’ di ritardo.", LiberaRegole.riepilogo(v))
        assertEquals("1 pulizia in sospeso: Chat non usate (1,0 MB). Si finiscono da sole appena il Drive accetta scritture.", LiberaRegole.sospese(v))
        assertEquals("in corso…", LiberaRegole.parola(v.righe[1].stato))
    }

    @Test
    fun `un passo in errore si riprova, contare non chiede conferma`() {
        val errore = RigaPassoApp(id = "doppie", titolo = "Doppie", azione = "pulisci", bottone = "Metti nel recupero", stato = "errore", motivo = "Il Drive non risponde.")
        assertEquals("Riprova…", LiberaRegole.tasto(errore))
        assertEquals("Il Drive non risponde.", LiberaRegole.esito(errore))
        assertTrue(LiberaRegole.serveConferma(errore))
        val conta = RigaPassoApp(id = "versioni", azione = "conta", bottone = "Conta le versioni", circa = true)
        assertEquals("Conta le versioni", LiberaRegole.tasto(conta))
        assertEquals("Non libera ancora niente · non si annulla", LiberaRegole.stima(conta))
        assertTrue(!LiberaRegole.serveConferma(conta))
    }

    @Test
    fun `senza niente di fatto non c'e' riepilogo, e un PC vecchio va aggiornato`() {
        assertNull(LiberaRegole.riepilogo(libera("""{"misurata":true,"percentuale":100,"righe":[]}""")))
        assertEquals("Questo PC non ha ancora la procedura per l’app: aggiornalo.", LiberaRegole.errore(Api.Errore(404, """{"errore":"non trovato"}"""), "misurare il Drive"))
        assertEquals("Non sono riuscito a misurare il Drive: C’è già un passo in corso.", LiberaRegole.errore(Api.Errore(409, """{"errore":"C’è già un passo in corso."}"""), "misurare il Drive"))
        assertEquals("87,5%", LiberaRegole.percento(87.5))
        assertEquals("100%", LiberaRegole.percento(100.0))
    }
}
