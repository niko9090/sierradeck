package it.ferrariconsulenze.sierradeck

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/*
 * L'app cerca da sola la versione nuova (0.43.0, app 2.46.0).
 *
 * Nicholas (02/10): «vorrei che nel cellulare l'app cercasse per i cavoli suoi
 * la versione disponibile». Prima si cercava solo con l'app aperta, chiedendo
 * prima al computer. Adesso c'e' anche un lavoro di WorkManager, ogni otto
 * ore e all'avvio dell'app, che chiede **direttamente a GitHub** il file
 * `app-android.json` dell'ultima pubblicazione: funziona anche a computer
 * spento e ad app chiusa. Se c'e' una versione piu' nuova di quella
 * installata arriva una notifica con le note e il tasto «Scarica e installa»,
 * che apre lo stesso dialogo di sempre (scaricamento e schermata di Android).
 * Una notifica sola per versione.
 */

/** Quello che dice il file dell'app, con le note (dalla 0.43.0) se ci sono. */
data class AppPubblicata(val versione: String, val apk: String, val programma: String?, val note: List<String>)

object ControlloApp {
    const val CANALE = "aggiornamenti"
    const val EXTRA_VERSIONE = "aggiorna_versione"
    const val EXTRA_APK = "aggiorna_apk"
    private const val ID_NOTIFICA = 4610
    private const val PERIODICO = "controllo-app"
    private const val ALL_AVVIO = "controllo-app-avvio"
    private const val PREFERENZE = "aggiornamenti"
    private const val CHIAVE_NOTIFICATA = "notificata"
    /** Ogni quanto si guarda: dentro la finestra 6-12 ore chiesta. */
    const val OGNI_ORE = 8L

    /**
     * Il file `app-android.json`, anche con le note. Un file vecchio (solo
     * versione e apk) va bene lo stesso: le note restano vuote.
     */
    fun leggi(corpo: String): AppPubblicata? {
        val base = Aggiornamenti.leggiFileApp(corpo) ?: return null
        return try {
            val o = JSONObject(corpo)
            val note = o.optJSONArray("note")
            AppPubblicata(
                base.versione, base.apk,
                o.optString("programma").takeIf { it.isNotBlank() },
                if (note == null) emptyList() else (0 until note.length()).mapNotNull { note.optString(it).takeIf { s -> s.isNotBlank() } }
            )
        } catch (_: Exception) {
            AppPubblicata(base.versione, base.apk, null, emptyList())
        }
    }

    /**
     * Si notifica? Solo se la versione trovata e' piu' nuova di quella
     * installata e non e' gia' stata annunciata: una notifica sola per
     * versione, anche se il controllo gira dieci volte.
     */
    fun daNotificare(installata: String, trovata: String?, giaNotificata: String?): Boolean =
        trovata != null && Aggiornamenti.piuNuova(installata, trovata) && trovata != giaNotificata

    /** Il testo della notifica: le note, corte, oppure una riga che dice cosa fare. */
    fun testoNotifica(a: AppPubblicata): String {
        val note = a.note.take(3).joinToString("\n") { r -> "• " + (if (r.length > 220) r.take(219) + "…" else r) }
        val testa = "SierraDeck ${a.versione} per il telefono" + (a.programma?.let { " (con il programma $it)" } ?: "") + "."
        return if (note.isBlank()) "$testa Tocca «Scarica e installa»: l'installazione la conferma Android." else "$testa\n$note"
    }

    /** Si programma: periodico (tiene quello che c'e') e uno subito, all'avvio dell'app. */
    fun programma(contesto: Context) {
        val rete = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val wm = WorkManager.getInstance(contesto)
        wm.enqueueUniquePeriodicWork(
            PERIODICO, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<LavoroControlloApp>(OGNI_ORE, TimeUnit.HOURS).setConstraints(rete).build()
        )
        wm.enqueueUniqueWork(ALL_AVVIO, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<LavoroControlloApp>().setConstraints(rete).build())
    }

    fun notificata(contesto: Context): String? =
        contesto.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).getString(CHIAVE_NOTIFICATA, null)

    private fun segnaNotificata(contesto: Context, versione: String) {
        contesto.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit().putString(CHIAVE_NOTIFICATA, versione).apply()
    }

    /** Un giro: GitHub, il confronto, la notifica. */
    fun giro(contesto: Context, corpo: String) {
        val a = leggi(corpo) ?: return
        if (!daNotificare(BuildConfig.VERSION_NAME, a.versione, notificata(contesto))) return
        notifica(contesto, a)
        segnaNotificata(contesto, a.versione)
    }

    private fun notifica(contesto: Context, a: AppPubblicata) {
        val g = contesto.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            g.createNotificationChannel(NotificationChannel(CANALE, "Aggiornamenti dell'app", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Quando esce una versione nuova dell'app, con le novità e il tasto per installarla"
            })
        }
        val apri = Intent(contesto, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_VERSIONE, a.versione)
            putExtra(EXTRA_APK, a.apk)
        }
        val tocco = PendingIntent.getActivity(contesto, ID_NOTIFICA, apri, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val testo = testoNotifica(a)
        val n = NotificationCompat.Builder(contesto, CANALE)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentTitle("È uscita l'app ${a.versione}")
            .setContentText(testo.lineSequence().drop(1).firstOrNull()?.removePrefix("• ") ?: testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setContentIntent(tocco)
            .addAction(0, "Scarica e installa", tocco)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(contesto).notify(ID_NOTIFICA, n) } catch (e: SecurityException) {
            Log.i("SierraDeck", "notifica dell'aggiornamento non permessa: ${e.message}")
        }
    }
}

/** Il lavoro di WorkManager: legge il file da GitHub, anche ad app chiusa e a PC spento. */
class LavoroControlloApp(contesto: Context, parametri: WorkerParameters) : CoroutineWorker(contesto, parametri) {
    override suspend fun doWork(): Result = try {
        ControlloApp.giro(applicationContext, Aggiornamenti.fileDaGitHub())
        Result.success()
    } catch (e: Exception) {
        Log.i("SierraDeck", "controllo dell'app non riuscito: ${e.message}")
        Result.retry()
    }
}
