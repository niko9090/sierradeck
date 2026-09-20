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
import okhttp3.Request

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
    const val CANALE_PRESENZA = "presenza"

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
        creaCanali(contesto)
        val avvisi = Avvisi.daAnnunciare(stato, gia, primoGiro)
        for (a in avvisi) avvisa(contesto, a)
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
                if (a.chat != null) putExtra(EXTRA_CHAT, a.chat)
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

        gestore(contesto).notify(a.id, costruttore.build())
    }

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
                description = "Una chat che ha finito e ti aspetta, una domanda, un lavoro fermo."
            }
        )
    }

    private fun gestore(contesto: Context): NotificationManager =
        contesto.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}
