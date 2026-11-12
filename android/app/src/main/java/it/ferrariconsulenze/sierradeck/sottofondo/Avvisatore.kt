package it.ferrariconsulenze.sierradeck.sottofondo

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import it.ferrariconsulenze.sierradeck.MainActivity
import it.ferrariconsulenze.sierradeck.R
import it.ferrariconsulenze.sierradeck.RispostaVeloce

/**
 * Le notifiche degli avvisi, su Android: un canale per tipo, una notifica per
 * avviso (il suo `id` come tag), i tasti per rispondere, niente quando l'app
 * è davanti. Le decisioni stanno in [RegoleAvvisi]; qui solo il disegno.
 */
object Avvisatore {
    /** L'id numerico di tutte le notifiche degli avvisi: le distingue il tag. */
    const val ID_AVVISO = 0x5D1
    /** La riga fissa del servizio d'ascolto. */
    const val ID_RIGA = 1

    const val EXTRA_COSA = "bersaglio.cosa"
    const val EXTRA_ID = "bersaglio.id"
    const val EXTRA_PC = "bersaglio.pc"
    const val EXTRA_AUTOPILOTA = "bersaglio.autopilota"

    /** Quanto resta «Hai risposto: …» prima di sparire da sola. */
    const val RISPOSTO_PER_MS = 10 * 60_000L

    private val COLORE = 0xFF4AA3FF.toInt()

    @Volatile private var ultimoSuono: Long? = null

    private val _provaArrivata = kotlinx.coroutines.flow.MutableStateFlow<Long?>(null)
    /** Quando è stata mostrata l'ultima notifica di prova: la schermata «Notifiche» ne misura il tempo. */
    val provaArrivata: kotlinx.coroutines.flow.StateFlow<Long?> = _provaArrivata

    fun creaCanali(c: Context) {
        val g = gestore(c)
        fun canale(id: String, nome: String, importanza: Int, spiega: String, muto: Boolean = false) =
            g.createNotificationChannel(NotificationChannel(id, nome, importanza).apply {
                description = spiega
                if (muto) { setSound(null, null); enableVibration(false); setShowBadge(false) }
            })
        canale(RegoleAvvisi.CANALE_DOMANDE, "Domande", NotificationManager.IMPORTANCE_HIGH, "Una domanda che aspetta te, con i tasti per rispondere.")
        canale(RegoleAvvisi.CANALE_FERMO, "Lavoro fermo", NotificationManager.IMPORTANCE_HIGH, "Un lavoro fermo che non riparte da solo.")
        canale(RegoleAvvisi.CANALE_FATTO, "Fatto", NotificationManager.IMPORTANCE_DEFAULT, "Una tua richiesta finita.")
        canale(RegoleAvvisi.CANALE_SAPERE, "Da sapere", NotificationManager.IMPORTANCE_DEFAULT, "«Ho scelto io», una versione pronta, un file per il telefono.")
        // App 3.0.2: la riga che Android chiede per l'ascolto non si vede. Da Android 13 un canale spento non ferma il servizio;
        // prima si tiene al minimo (muta, in fondo), per non rischiare che Android rifiuti di avviare l'ascolto.
        val invisibile = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) NotificationManager.IMPORTANCE_NONE else NotificationManager.IMPORTANCE_MIN
        canale(RegoleAvvisi.CANALE_ASCOLTO, "In ascolto", invisibile, "Il servizio che tiene l'app in ascolto del computer. Non mostra niente: gli avvisi arrivano sui loro canali.", muto = true)
        for (vecchio in RegoleAvvisi.CANALI_VECCHI) try { g.deleteNotificationChannel(vecchio) } catch (_: Exception) { }
    }

    /**
     * L'app è aperta e si vede. `Davanti` non basta: in un processo partito
     * dal servizio vale «sì» finché nessuna Activity dice il contrario.
     */
    fun davanti(c: Context): Boolean = try {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND &&
            it.ferrariconsulenze.sierradeck.nucleo.Davanti.adesso
    } catch (_: Exception) { false }

    /** Un pacco di avvisi dal PC. */
    fun applica(c: Context, r: RispostaEventi) {
        creaCanali(c)
        val sopra = davanti(c)
        for (a in r.avvisi.sortedBy { it.n }) {
            val ora = System.currentTimeMillis()
            when (val g = RegoleAvvisi.gesto(a, sopra, ultimoSuono, ora)) {
                is Gesto.Mostra -> { if (g.suona) ultimoSuono = ora; mostra(c, a, g.suona) }
                is Gesto.Sostituisci -> riga(c, a.id, RegoleAvvisi.canale(a.tipo), g.titolo, g.testo, tocco(c, a), RISPOSTO_PER_MS * 6)
                Gesto.Togli -> togli(c, a.id)
                Gesto.Niente -> Unit
            }
        }
    }

    fun mostra(c: Context, a: AvvisoPc, suona: Boolean) {
        val b = NotificationCompat.Builder(c, RegoleAvvisi.canale(a.tipo))
            .setSmallIcon(R.drawable.ic_notifica)
            .setColor(COLORE)
            .setContentTitle(a.titolo)
            .setContentText(RegoleAvvisi.testoCorto(a))
            .setStyle(NotificationCompat.BigTextStyle().bigText(RegoleAvvisi.testoLungo(a)))
            .setPriority(if (a.tipo == "domanda" || a.tipo == "fermo") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(if (a.tipo == "domanda") NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(tocco(c, a))
            .setAutoCancel(a.tipo != "domanda")
            .setOnlyAlertOnce(true)
            .setSilent(!suona)
        RegoleAvvisi.tasti(a).forEachIndexed { i, t -> b.addAction(tasto(c, a, t, i)) }
        notifica(c, a.id, b.build())
        if (RegoleAvvisi.eProva(a)) _provaArrivata.value = System.currentTimeMillis()
    }

    private fun tasto(c: Context, a: AvvisoPc, t: Tasto, i: Int): NotificationCompat.Action {
        val intento = Intent(c, RispostaVeloce::class.java).apply {
            putExtra(RispostaVeloce.EXTRA_AVVISO, a.id)
            putExtra(RispostaVeloce.EXTRA_TITOLO, a.titolo)
            putExtra(RispostaVeloce.EXTRA_TESTO_DOMANDA, a.testo)
            putExtra(RispostaVeloce.EXTRA_COSA, a.bersaglio.cosa)
            putExtra(RispostaVeloce.EXTRA_BERSAGLIO, a.bersaglio.id)
            a.bersaglio.pc?.let { putExtra(RispostaVeloce.EXTRA_PC, it) }
            t.risposta?.let { putExtra(RispostaVeloce.EXTRA_RISPOSTA, it) }
        }
        // `MUTABLE` solo per «Scrivi…»: è Android a scriverci dentro il testo.
        val bandiere = PendingIntent.FLAG_UPDATE_CURRENT or (if (t.scrivi) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE)
        val pi = PendingIntent.getBroadcast(c, codice(a.id, i + 1), intento, bandiere)
        val azione = NotificationCompat.Action.Builder(R.drawable.ic_notifica, t.etichetta, pi)
        if (t.scrivi) azione.addRemoteInput(
            RemoteInput.Builder(RispostaVeloce.CHIAVE_TESTO)
                .setLabel(if (a.bersaglio.cosa == "chat") "Scrivi alla chat" else "La tua risposta")
                .build()
        )
        return azione.build()
    }

    /** Il tocco sulla notifica: apre l'app dove si risponde. */
    fun tocco(c: Context, a: AvvisoPc): PendingIntent = PendingIntent.getActivity(
        c,
        codice(a.id, 0),
        Intent(c, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_COSA, a.bersaglio.cosa)
            putExtra(EXTRA_ID, a.bersaglio.id)
            a.bersaglio.pc?.let { putExtra(EXTRA_PC, it) }
            a.bersaglio.autopilota?.let { putExtra(EXTRA_AUTOPILOTA, it) }
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    /** Il tocco su una notifica di cui resta solo il tag: apre l'app e basta. */
    private fun apriApp(c: Context): PendingIntent = PendingIntent.getActivity(
        c, 0, Intent(c, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    /** Una riga silenziosa al posto della notifica di un avviso. */
    fun riga(c: Context, tag: String, canale: String, titolo: String, testo: String, apri: PendingIntent? = null, dopoMs: Long? = null, inCorso: Boolean = false) {
        val b = NotificationCompat.Builder(c, canale)
            .setSmallIcon(R.drawable.ic_notifica)
            .setColor(COLORE)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setContentIntent(apri ?: apriApp(c))
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(!inCorso)
            .setOngoing(inCorso)
        dopoMs?.let { b.setTimeoutAfter(it) }
        notifica(c, tag, b.build())
    }

    fun inInvio(c: Context, tag: String, titolo: String, testo: String) =
        riga(c, tag, RegoleAvvisi.CANALE_DOMANDE, titolo, "Mando «${testo.take(60)}»…")

    /** La domanda intera con la risposta sotto (0.84.0), poi sparisce da sola. */
    fun risposto(c: Context, tag: String, titolo: String, domanda: String, testo: String) =
        riga(c, tag, RegoleAvvisi.CANALE_DOMANDE, titolo,
            if (domanda.isBlank()) "Hai risposto: ${testo.trim()}" else RispostaVeloce.testoDopoRisposta(domanda, testo),
            dopoMs = RISPOSTO_PER_MS)

    fun nonInviata(c: Context, tag: String, titolo: String, testo: String) =
        riga(c, tag, RegoleAvvisi.CANALE_DOMANDE, titolo, "Non inviata, riprovo da solo: «${testo.take(60)}»")

    fun rifiutata(c: Context, tag: String, titolo: String, motivo: String?) =
        riga(c, tag, RegoleAvvisi.CANALE_DOMANDE, titolo, "Il computer non l'ha presa" + (motivo?.takeIf { it.isNotBlank() }?.let { ": $it" } ?: "."), dopoMs = RISPOSTO_PER_MS)

    fun togli(c: Context, tag: String) {
        try { NotificationManagerCompat.from(c).cancel(tag, ID_AVVISO) } catch (_: Exception) { }
    }

    private fun notifica(c: Context, tag: String, n: Notification) {
        try { NotificationManagerCompat.from(c).notify(tag, ID_AVVISO, n) } catch (_: SecurityException) {
            // Senza il permesso delle notifiche non si mostra niente: lo dice la schermata «Notifiche».
        }
    }

    /** La notifica che Android vuole per il servizio d'ascolto: sul canale invisibile (app 3.0.2), quindi non si vede. */
    fun rigaAscolto(c: Context, testo: String): Notification {
        return NotificationCompat.Builder(c, RegoleAvvisi.CANALE_ASCOLTO)
            .setSmallIcon(R.drawable.ic_notifica)
            .setColor(COLORE)
            .setContentTitle("SierraDeck")
            .setContentText(testo)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setShowWhen(false)
            .setOngoing(true)
            .setContentIntent(apriApp(c))
            .build()
    }

    private fun codice(tag: String, i: Int): Int = tag.hashCode() * 8 + i

    private fun gestore(c: Context): NotificationManager = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}
