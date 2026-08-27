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
import java.net.HttpURLConnection
import java.net.URL

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
    private val gia = mutableSetOf<String>()
    private var primoGiro = true

    /** Un giro solo. Torna lo stato letto, o `null` se non si è potuto leggere. */
    fun giro(contesto: Context): JSONObject? {
        val collegamento = Collegamento(contesto)
        if (!collegamento.pronto) return null
        val stato = leggiStato(collegamento) ?: return null
        creaCanali(contesto)
        for (a in Avvisi.daAnnunciare(stato, gia, primoGiro)) avvisa(contesto, a)
        primoGiro = false
        return stato
    }

    private fun leggiStato(collegamento: Collegamento): JSONObject? = try {
        val connessione =
            (URL("${collegamento.indirizzo}/api/stato").openConnection() as HttpURLConnection)
        connessione.setRequestProperty("x-sierradeck-chiave", collegamento.chiave)
        connessione.connectTimeout = 8000
        connessione.readTimeout = 8000
        try {
            if (connessione.responseCode != 200) null
            else JSONObject(connessione.inputStream.bufferedReader().readText())
        } finally {
            connessione.disconnect()
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
        val apri = PendingIntent.getActivity(
            contesto,
            0,
            Intent(contesto, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val costruttore = NotificationCompat.Builder(contesto, CANALE_AVVISI)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
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
            .setSmallIcon(android.R.drawable.ic_menu_view)
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
