package it.ferrariconsulenze.sierradeck.schermate.notifiche

import it.ferrariconsulenze.sierradeck.sottofondo.RegoleAvvisi
import it.ferrariconsulenze.sierradeck.sottofondo.StatoAscolto
import kotlinx.serialization.Serializable

/** Le scelte, tenute dal PC (`GET | POST /api/avvisi/impostazioni`), uguali su PC, pagina e app. */
@Serializable
data class ImpostazioniAvvisi(
    val tipi: Map<String, String> = mapOf("domanda" to "suona", "fermo" to "suona", "fatto" to "silenziosa", "sapere" to "silenziosa"),
    val chatFerma: Boolean = false,
    val silenzio: OreSilenzio? = null
)

@Serializable
data class OreSilenzio(val da: String, val a: String)

/** Un avviso dell'elenco «Ultime notifiche»: ora ed esito scritti dal PC, da mostrare così. */
@Serializable
data class AvvisoVisto(val id: String, val tipo: String, val titolo: String, val testo: String = "", val ora: String = "", val esito: String = "")

/** `GET /api/avvisi/stato`. */
@Serializable
data class VistaAvvisi(
    val riga: String = "",
    val inAscolto: Boolean = false,
    val ultimoContatto: String? = null,
    val impostazioni: ImpostazioniAvvisi = ImpostazioniAvvisi(),
    val ultimi: List<AvvisoVisto> = emptyList()
)

/** Un tipo di avviso a schermo (le stesse parole del PC, `NOMI_TIPI`). */
data class TipoAvviso(val chiave: String, val titolo: String, val spiega: String)

/** Un problema che ferma o rallenta gli avvisi, con il gesto che lo toglie. */
enum class Rimedio { PERMESSO, BATTERIA, RIACCENDI, NESSUNO }

data class RigaStato(val testo: String, val buona: Boolean, val rimedio: Rimedio = Rimedio.NESSUNO, val etichetta: String? = null)

/** I tre passi della prima volta, ognuno con la sua spunta. */
data class PassiGuida(val permesso: Boolean, val batteria: Boolean, val prova: Boolean) {
    val finita: Boolean get() = permesso && batteria && prova
}

object RegoleNotifiche {
    val TIPI = listOf(
        TipoAvviso("domanda", "Domande", "Una domanda che aspetta te: una scelta che non decido io, una conferma, un consenso. Con i tasti per rispondere dalla notifica."),
        TipoAvviso("fermo", "Lavoro fermo", "Un lavoro che si è fermato e non riparte da solo, dopo che il programma ha già provato a smuoverlo."),
        TipoAvviso("fatto", "Fatto", "Una tua richiesta è finita: unita e verificata."),
        TipoAvviso("sapere", "Da sapere", "Cose che non chiedono niente: «ho scelto io» dopo un’ora senza risposta, una versione pronta, un file per il telefono, i lavori automatici finiti.")
    )
    val MODI = listOf("suona" to "Suona", "silenziosa" to "Silenziosa", "spenta" to "Spenta")

    private val ORA = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
    fun oraValida(hhmm: String): Boolean = ORA.matches(hhmm)
    fun ora(h: Int, m: Int): String = "%02d:%02d".format(h, m)

    /**
     * La riga in cima: quello che conta di più per primo. Senza permesso non
     * arriva niente; con l'ascolto fermo nemmeno; poi la rete; il risparmio
     * batteria rallenta soltanto.
     */
    fun rigaStato(permesso: Boolean, batteriaLibera: Boolean, accoppiato: Boolean, a: StatoAscolto, adesso: Long): RigaStato = when {
        !accoppiato -> RigaStato("Nessun computer accoppiato: gli avvisi non hanno da dove arrivare.", false)
        !permesso -> RigaStato("Le notifiche di SierraDeck sono spente in Android: non arriva niente.", false, Rimedio.PERMESSO, "Accendile")
        !a.attivo -> RigaStato("L’ascolto del computer è fermo.", false, Rimedio.RIACCENDI, "Riaccendi")
        a.motivo != null -> RigaStato("Non raggiungo il computer, riprovo da solo: ${a.motivo}", false)
        !batteriaLibera -> RigaStato("Avvisi attivi, ma a telefono fermo possono arrivare in ritardo.", false, Rimedio.BATTERIA, "Togli il risparmio batteria")
        a.vecchioPc -> RigaStato("Avvisi attivi ogni 2 minuti: il computer va aggiornato per averli subito.", true)
        else -> RigaStato("Avvisi attivi · " + RegoleAvvisi.rigaAscolto(a.ultimoContatto, adesso).removePrefix("In ascolto · "), true)
    }

    /** La prova è arrivata: l'avviso di prova mostrato dopo il tocco su «Prova notifica». */
    fun provaArrivata(chiesta: Long?, arrivata: Long?): Boolean = chiesta != null && arrivata != null && arrivata >= chiesta

    /** «Arrivata in 1,4 s», o null se non ancora. */
    fun tempoProva(chiesta: Long?, arrivata: Long?): String? {
        if (!provaArrivata(chiesta, arrivata)) return null
        val ms = arrivata!! - chiesta!!
        return "Arrivata in " + (if (ms < 10_000) "%.1f s".format(java.util.Locale.ITALY, ms / 1000.0) else "${ms / 1000} s")
    }
}
