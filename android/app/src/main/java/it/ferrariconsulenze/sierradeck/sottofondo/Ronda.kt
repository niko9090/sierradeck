package it.ferrariconsulenze.sierradeck.sottofondo

import android.content.Context
import org.json.JSONObject
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Percorsi
import it.ferrariconsulenze.sierradeck.rete.Rete
import kotlinx.coroutines.runBlocking

/**
 * Il giro di prima, per i computer che non hanno ancora `/api/eventi` (PC
 * prima della 0.101.0): si legge `/api/stato` e si confronta con quello già
 * annunciato. Lo chiama l'ascolto ([Ascolto]) ogni due minuti quando il PC
 * risponde 404 agli eventi; le notifiche escono da [Avvisatore], come le altre.
 */
object Ronda {


    /**
     * Cosa si è già annunciato.
     *
     * Vive nell'oggetto e non nel servizio perché fra una sveglia e l'altra il
     * processo può morire: quello che sopravvive lo fa in memoria finché il
     * processo c'è, e quando non c'è più si riparte con `primoGiro`, che tace
     * su ciò che era già successo. Una notifica in meno è meglio di cinque
     * notifiche vecchie tutte insieme.
     */
    /**
     * Un insieme che regge due thread.
     *
     * Il giro lo fanno in due — la sveglia periodica e il servizio continuo — e
     * possono sovrapporsi: un `mutableSetOf` toccato da tutti e due puo'
     * sollevare `ConcurrentModificationException` mentre lo si scorre, e quella
     * eccezione arriva **dentro la guardia**, che e' la sola cosa che lavora a
     * schermo spento.
     */
    private val gia: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()
    private var primoGiro = true
    private var caricata = false

    /**
     * Il ricordo sta anche su disco, e questo e' il punto.
     *
     * Fra una sveglia e l'altra (due minuti) Android quasi sempre uccide il
     * processo; alla sveglia dopo `primoGiro` tornava vero e **taceva** su
     * tutto quello che era successo nel frattempo — cioe' su tutto: «X
     * aspetta te» e «ha finito» non arrivavano quasi mai ad app chiusa, che e'
     * il caso per cui la guardia esiste. Ora `gia` e «sono gia' partita» si
     * rileggono da `SharedPreferences`: il primo giro vero e' solo il primo
     * di sempre.
     */
    private fun carica(contesto: Context) {
        if (caricata) return
        caricata = true
        val p = contesto.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE)
        gia.addAll(p.getStringSet(CHIAVE_GIA, emptySet()) ?: emptySet())
        primoGiro = !p.getBoolean(CHIAVE_AVVIATA, false)
    }

    private fun salva(contesto: Context) {
        contesto.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit()
            .putStringSet(CHIAVE_GIA, HashSet(gia))
            .putBoolean(CHIAVE_AVVIATA, true)
            .apply()
    }

    /** Si dimentica tutto: a un nuovo accoppiamento, il primo giro torna a essere il primo. */
    fun azzera(contesto: Context) {
        gia.clear(); primoGiro = true; caricata = true
        contesto.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit().clear().apply()
    }

    /** Un giro solo. Torna lo stato letto, o `null` se non si è potuto leggere. */
    fun giro(contesto: Context): JSONObject? {
        Rete.ricorda(contesto)
        Percorsi.osserva(contesto)
        val collegamento = Collegamento(contesto)
        if (!collegamento.pronto) return null
        val stato = leggiStato(collegamento) ?: return null
        consuma(contesto, stato)
        return stato
    }

    /**
     * Gli avvisi da uno stato gia' letto da qualcun altro.
     *
     * L'app aperta chiede `/api/stato` ogni due secondi per la sua schermata:
     * quello stesso polso passa da qui, cosi' una chat che finisce mentre
     * guardi un'altra scheda si annuncia subito, invece che alla prossima
     * sveglia (minuti dopo, o mai, se nel frattempo il processo e' morto).
     */
    @Synchronized
    fun consuma(contesto: Context, stato: JSONObject) {
        carica(contesto)
        Avvisatore.creaCanali(contesto)
        // L'app davanti: niente notifiche, ma quello che si vede conta come detto.
        val davanti = Avvisatore.davanti(contesto)
        // Solo quelle utili (app 2.74.0): le chat dopo tre minuti di attesa, e i tipi spenti tacciono.
        val avvisi = Notifiche.filtra(
            Avvisi.daAnnunciare(stato, gia, primoGiro, System.currentTimeMillis(), Notifiche.ATTESA_CHAT_MS),
            Notifiche.scelte(contesto)
        )
        if (!davanti) for (a in avvisi) avvisa(contesto, a)
        // Il PC ha dei file per questo telefono (PC 0.54.0): si ritirano adesso, in sottofondo.
        if (stato.optInt("consegne", 0) > 0) try { RicevitoreConsegne.subito(contesto) } catch (_: Exception) { }
        primoGiro = false
        salva(contesto)
    }

    /** Quando ha suonato l'ultimo avviso (2.80.0). */
    @Volatile private var ultimoSuono: Long? = null

    /**
     * Ogni avviso mostrato nel registro del computer (2.80.0): «mille notifiche»
     * non lasciava traccia da nessuna parte. Su un thread suo, a fuoco e
     * dimentica: un computer vecchio senza la rotta risponde 404, e va bene.
     */
    private fun riferisci(contesto: Context, a: Avvisi.Avviso) =
        riferisci(contesto, a.chiave.substringBefore(':'), a.titolo, a.causa)

    /** Lo stesso, per un avviso che non passa dalla ronda (l'app nuova): tipo, titolo e causa (2.81.0). */
    fun riferisci(contesto: Context, tipo: String, titolo: String, causa: String) {
        val collegamento = try { Collegamento(contesto) } catch (_: Exception) { return }
        if (!collegamento.pronto) return
        val corpo = JSONObject()
            .put("da", "app")
            .put("tipo", tipo)
            .put("titolo", titolo.take(80))
            .put("causa", causa.take(160))
            .toString()
        Thread {
            try {
                runBlocking { Api(collegamento.indirizzo, collegamento.chiave).grezzo("/api/avviso-mostrato", corpo) }
            } catch (_: Exception) { }
        }.start()
    }

    private const val PREFERENZE = "ronda"
    private const val CHIAVE_GIA = "gia"
    private const val CHIAVE_AVVIATA = "avviata"

    /**
     * Lo stato del computer, chiesto **dalla rete giusta**.
     *
     * Era una `HttpURLConnection` nuda, e quindi usciva dalla rete che Android
     * giudica migliore: con una VPN accesa o un wifi che il telefono considera
     * scadente, una richiesta a `192.168.x.x` prende i dati mobili o entra nel
     * tunnel, e da li' quell'indirizzo non esiste. E' esattamente il difetto che
     * `Rete` esiste per chiudere — e la guardia, che e' l'unica cosa che lavora
     * a schermo spento, se lo teneva tutto: nessuna notifica, e dalla parte del
     * computer niente da trovare.
     */
    private fun leggiStato(collegamento: Collegamento): JSONObject? = try {
        // Dal Centralino (11/11), come le schermate.
        runBlocking { JSONObject(Api(collegamento.indirizzo, collegamento.chiave).statoGrezzo()) }
    } catch (e: Exception) {
        // Il computer spento, il wifi cambiato, la rete che va e viene: sono i
        // casi normali di una guardia, non guasti da segnalare.
        null
    }

    /**
     * Un avviso del giro di prima, mostrato come quelli nuovi: stesso canale
     * per tipo, stessi tasti («Scrivi…» per una domanda o una chat che
     * aspetta), una notifica per chat o per autopilota (il tag `r:<id>`).
     */
    fun avvisa(contesto: Context, a: Avvisi.Avviso) {
        val tipo = when (Notifiche.tipoDi(a.chiave)) {
            TipoNotifica.FINITO -> "fatto"
            TipoNotifica.FERMO -> "fermo"
            TipoNotifica.VERSIONE, TipoNotifica.FILE -> "sapere"
            TipoNotifica.DOMANDA -> "domanda"
        }
        val bersaglio = when {
            a.domanda != null -> BersaglioAvviso("domanda", a.domanda)
            a.chat != null -> BersaglioAvviso("chat", a.chat)
            a.scelta != null -> BersaglioAvviso("domanda", "")
            a.chiave.startsWith("f:") || a.chiave.startsWith("s:") || a.chiave.startsWith("p:") -> BersaglioAvviso("workspace", "")
            else -> BersaglioAvviso("domanda", "")
        }
        val ora = System.currentTimeMillis()
        val suona = Avvisi.suona(ultimoSuono, ora)
        if (suona) ultimoSuono = ora
        riferisci(contesto, a)
        Avvisatore.mostra(contesto, AvvisoPc(n = 0, id = "r:${a.id}", tipo = tipo, titolo = a.titolo, testo = a.testo, bersaglio = bersaglio, suona = true), suona)
    }
}

