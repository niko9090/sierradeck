package it.ferrariconsulenze.sierradeck

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import org.json.JSONObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import kotlin.concurrent.thread

/**
 * Un giro di guardia: si chiede al computer come va, e si avvisa se serve.
 *
 * Sta qui, e non dentro un servizio, perché lo stesso giro lo fanno in due: la
 * **sveglia** (ogni pochi minuti, senza niente in vista) e il **servizio
 * continuo** (ogni cinque secondi, con la sua riga fissa) per chi lo accende
 * apposta. Due modi di svegliarsi, una sola idea di cosa guardare — altrimenti
 * divergono, e le notifiche cominciano ad arrivare in un modo da spenta e in un
 * altro da accesa.
 */
object Ronda {

    const val CANALE_AVVISI = "domande"
    const val EXTRA_CHAT = "chat"
    const val EXTRA_DOMANDA = "domanda"
    /** Quale scheda aprire quando la notifica non riguarda una chat o una domanda. */
    const val EXTRA_SCHEDA = "scheda"
    const val CANALE_PRESENZA = "presenza"
    private const val EXTRA_CHIAVE = "sierradeck.chiave"

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
        val collegamento = Collegamento(contesto)
        if (!collegamento.pronto) return null
        val stato = leggiStato(collegamento)
        linea(contesto, stato != null)
        if (stato == null) return null
        consuma(contesto, stato)
        return stato
    }

    /**
     * Il computer perso o ripreso (app 2.74.0): si dice solo dopo cinque
     * minuti di silenzio, e il ritorno solo se il «perso» era stato detto.
     */
    @Synchronized
    fun linea(contesto: Context, raggiunto: Boolean) {
        val (nuova, avviso) = Notifiche.linea(Notifiche.leggiLinea(contesto), raggiunto, System.currentTimeMillis(), PcCorrente.nome ?: "Il computer")
        Notifiche.salvaLinea(contesto, nuova)
        if (avviso != null && Notifiche.suona(TipoNotifica.COLLEGAMENTO, Notifiche.scelte(contesto))) {
            creaCanali(contesto)
            avvisa(contesto, avviso)
        }
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
        creaCanali(contesto)
        // Solo quelle utili (app 2.74.0): le chat dopo tre minuti di attesa, e i tipi spenti tacciono.
        val avvisi = Notifiche.filtra(
            Avvisi.daAnnunciare(stato, gia, primoGiro, System.currentTimeMillis(), Notifiche.ATTESA_CHAT_MS),
            Notifiche.scelte(contesto)
        )
        for (a in avvisi) avvisa(contesto, a)
        // Il PC ha dei file per questo telefono (PC 0.54.0): si ritirano adesso, in sottofondo.
        if (stato.optInt("consegne", 0) > 0) try { RicevitoreConsegne.subito(contesto) } catch (_: Exception) { }
        primoGiro = false
        salva(contesto)
    }

    private const val PREFERENZE = "ronda"
    private const val CHIAVE_GIA = "gia"
    private const val CHIAVE_AVVIATA = "avviata"
    private val COLORE_ICONA = 0xFF4AA3FF.toInt()

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
        val richiesta = Request.Builder()
            .url("${collegamento.indirizzo}/api/stato")
            .header("x-sierradeck-chiave", collegamento.chiave)
            .build()
        Rete.clientePer(Indirizzi.hostDi(collegamento.indirizzo))
            .newCall(richiesta).execute().use { r ->
                if (!r.isSuccessful) null else JSONObject(r.body?.string() ?: "")
            }
    } catch (e: Exception) {
        // Il computer spento, il wifi cambiato, la rete che va e viene: sono i
        // casi normali di una guardia, non guasti da segnalare.
        null
    }

    /**
     * Un avviso, con dentro il modo di rispondere quando ce n'è uno.
     *
     * Una domanda si risponde, a una chat che aspetta si scrive: in tutti e due
     * i casi il campo sta **nella notifica**, e non c'è da aprire l'app, trovare
     * la chat e ripensare la frase che avevi già in testa.
     */
    fun avvisa(contesto: Context, a: Avvisi.Avviso) {
        // Un `requestCode` per avviso: con lo zero per tutti, Android riusava lo
        // stesso PendingIntent e il tocco portava sempre alla stessa cosa.
        val apri = PendingIntent.getActivity(
            contesto,
            a.id,
            Intent(contesto, MainActivity::class.java).apply {
                (a.chat ?: a.scelta)?.let { putExtra(EXTRA_CHAT, it) }
                // Gli avvisi degli autopiloti (finito, fermo, pronto) aprono Lavori.
                if (a.chiave.startsWith("f:") || a.chiave.startsWith("s:") || a.chiave.startsWith("p:")) putExtra(EXTRA_SCHEDA, "lavori")
                if (a.domanda != null) putExtra(EXTRA_DOMANDA, a.domanda)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val costruttore = NotificationCompat.Builder(contesto, CANALE_AVVISI)
            // Monocroma: con `ic_dialog_info` (una bitmap colorata) si vedeva
            // un quadrato bianco al posto dell'icona.
            .setSmallIcon(R.drawable.ic_notifica)
            .setColor(COLORE_ICONA)
            .setContentTitle(a.titolo)
            .setContentText(a.testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(a.testo))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(apri)
            .setAutoCancel(true)
            // Raggruppate (0.43.0): tre chat che finiscono insieme sono una
            // pila con un riassunto, non tre squilli separati; e lo stesso
            // avviso aggiornato non risuona.
            .setGroup(GRUPPO_AVVISI)
            .setOnlyAlertOnce(true)
            .setCategory(if (a.domanda != null || a.scelta != null) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_STATUS)

        val bersaglio = a.domanda ?: a.chat
        if (bersaglio != null) {
            val ingresso = RemoteInput.Builder(RispostaVeloce.CHIAVE_TESTO)
                .setLabel(if (a.domanda != null) "La tua risposta" else "Scrivi alla chat")
                .build()
            val intento = Intent(contesto, RispostaVeloce::class.java).apply {
                if (a.domanda != null) putExtra(RispostaVeloce.EXTRA_DOMANDA, a.domanda)
                else putExtra(RispostaVeloce.EXTRA_CHAT, a.chat)
                putExtra(RispostaVeloce.EXTRA_NOTIFICA, a.id)
            }
            // `MUTABLE` è obbligatorio: è Android a scriverci dentro il testo che
            // hai digitato. Con `IMMUTABLE` la risposta arriva vuota, e la
            // notifica sembra rotta senza dire perché.
            val azione = PendingIntent.getBroadcast(
                contesto,
                a.id,
                intento,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            costruttore.addAction(
                NotificationCompat.Action.Builder(
                    android.R.drawable.ic_menu_send,
                    if (a.domanda != null) "Rispondi" else "Scrivi",
                    azione
                ).addRemoteInput(ingresso).build()
            )
        }

        // Una per chat (app 2.74.0): un evento nuovo sostituisce quello di prima
        // della stessa chat e suona; lo stesso evento aggiornato no.
        costruttore.addExtras(android.os.Bundle().apply { putString(EXTRA_CHIAVE, a.chiave) })
        val g = gestore(contesto)
        try {
            val prima = g.activeNotifications.firstOrNull { it.id == a.id }?.notification?.extras?.getString(EXTRA_CHIAVE)
            if (prima != null && prima != a.chiave) g.cancel(a.id)
        } catch (_: Exception) { }
        g.notify(a.id, costruttore.build())
        riassumi(contesto)
        segnalaAlPc(contesto, a)
    }

    /**
     * Ogni notifica anche nel registro del computer (PC 0.80.0): «mille
     * notifiche quando un autopilota lavora» non lasciava nessuna traccia. In
     * un filo a parte e senza attese: un PC più vecchio risponde 404, e va bene.
     */
    private fun segnalaAlPc(contesto: Context, a: Avvisi.Avviso) {
        val collegamento = Collegamento(contesto)
        if (!collegamento.pronto) return
        thread(start = true, isDaemon = true) {
            try {
                val corpo = JSONObject().put("titolo", a.titolo).put("tag", a.chiave).toString()
                val richiesta = Request.Builder()
                    .url("${collegamento.indirizzo}/api/notifica")
                    .header("x-sierradeck-chiave", collegamento.chiave)
                    .post(corpo.toRequestBody("application/json; charset=utf-8".toMediaType()))
                    .build()
                Rete.clientePer(Indirizzi.hostDi(collegamento.indirizzo)).newCall(richiesta).execute().close()
            } catch (_: Exception) { }
        }
    }

    /**
     * Il riassunto della pila (0.43.0): con due o piu' avvisi aperti, una
     * notifica che li conta e ne elenca i titoli. Silenziosa: a suonare e'
     * stato gia' l'avviso nuovo.
     */
    private fun riassumi(contesto: Context) {
        val g = gestore(contesto)
        val aperti = try {
            g.activeNotifications.filter { it.notification.group == GRUPPO_AVVISI && it.id != ID_RIASSUNTO }
        } catch (_: Exception) { return }
        if (aperti.size < 2) { g.cancel(ID_RIASSUNTO); return }
        val titoli = aperti.mapNotNull { it.notification.extras?.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() }
        val (titolo, righe) = riassuntoAvvisi(titoli)
        val stile = NotificationCompat.InboxStyle().setBigContentTitle(titolo)
        righe.forEach { stile.addLine(it) }
        g.notify(
            ID_RIASSUNTO,
            NotificationCompat.Builder(contesto, CANALE_AVVISI)
                .setSmallIcon(R.drawable.ic_notifica)
                .setColor(COLORE_ICONA)
                .setContentTitle(titolo)
                .setContentText(righe.firstOrNull() ?: "")
                .setStyle(stile)
                .setGroup(GRUPPO_AVVISI)
                .setGroupSummary(true)
                .setSilent(true)
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(contesto, ID_RIASSUNTO, Intent(contesto, MainActivity::class.java).apply { putExtra(EXTRA_SCHEDA, "domande") }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                .build()
        )
    }

    /** Il gruppo degli avvisi e l'id del loro riassunto. */
    const val GRUPPO_AVVISI = "sierradeck-avvisi"
    const val ID_RIASSUNTO = 0x5D0

    /** La riga fissa del controllo continuo: esiste solo se lo accendi tu. */
    fun notificaPresenza(contesto: Context, riga: String): Notification =
        NotificationCompat.Builder(contesto, CANALE_PRESENZA)
            .setSmallIcon(R.drawable.ic_notifica)
            .setColor(COLORE_ICONA)
            .setContentTitle("Controllo continuo acceso")
            .setContentText(riga)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setShowWhen(false)
            .setOngoing(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    contesto,
                    0,
                    Intent(contesto, MainActivity::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            .build()

    fun creaCanali(contesto: Context) {
        val g = gestore(contesto)
        g.createNotificationChannel(
            NotificationChannel(CANALE_PRESENZA, "Controllo continuo", NotificationManager.IMPORTANCE_MIN).apply {
                description = "La riga fissa che compare solo se accendi il controllo continuo."
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
        )
        g.createNotificationChannel(
            NotificationChannel(CANALE_AVVISI, "Quando serve qualcosa da te", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Una domanda, una chat che ti aspetta da qualche minuto, un lavoro finito o fermo, una versione pronta, il computer perso. Ogni tipo si spegne nelle impostazioni dell'app."
            }
        )
    }

    private fun gestore(contesto: Context): NotificationManager =
        contesto.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}


/**
 * Il riassunto di una pila di avvisi (0.43.0): «3 cose aspettano te» e i
 * titoli, al massimo cinque (poi «e altre N»). Pura, per i test.
 */
fun riassuntoAvvisi(titoli: List<String>): Pair<String, List<String>> {
    val n = titoli.size
    val titolo = if (n == 1) "Una cosa aspetta te" else "$n cose aspettano te"
    val righe = titoli.take(5) + (if (n > 5) listOf("e altre ${n - 5}") else emptyList())
    return titolo to righe
}
