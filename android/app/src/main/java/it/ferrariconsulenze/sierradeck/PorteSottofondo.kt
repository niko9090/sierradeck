package it.ferrariconsulenze.sierradeck

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import it.ferrariconsulenze.sierradeck.sottofondo.Aggiornamenti
import it.ferrariconsulenze.sierradeck.sottofondo.ControlloApp
import it.ferrariconsulenze.sierradeck.sottofondo.RicevitoreConsegne
import it.ferrariconsulenze.sierradeck.sottofondo.Ricevuti

/*
 * I componenti del sottofondo che Android conosce per nome (11/11): WorkManager
 * salva il nome della classe dei lavori periodici e il manifest quello dei
 * ricevitori. Restano qui, nel pacchetto di sempre, perché un aggiornamento
 * fatto da dentro l'app vecchia li ritrovi; il lavoro vero sta in `sottofondo`.
 */

/** Il lavoro di WorkManager: un giro, anche ad app chiusa. */
class LavoroConsegne(contesto: Context, parametri: WorkerParameters) : CoroutineWorker(contesto, parametri) {
    override suspend fun doWork(): Result = try {
        RicevitoreConsegne.giro(applicationContext)
        Result.success()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Log.i("SierraDeck", "giro dei file dal PC non riuscito: ${e.message}")
        Result.retry()
    } catch (e: OutOfMemoryError) {
        // Una risposta troppo grande non deve far crollare l'app (k-4): si registra e si rinuncia a questo giro.
        Log.w("SierraDeck", "giro dei file dal PC: memoria finita, giro saltato")
        Result.failure()
    }
}

/** «Salva» toccato nella notifica: copia in Download/SierraDeck e lo dice nella stessa notifica. */
class SalvaRicevuto : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        if (intent.action != RicevitoreConsegne.AZIONE_SALVA) return
        val id = intent.getStringExtra(RicevitoreConsegne.EXTRA_ID) ?: return
        val esito = RicevitoreConsegne.salva(c, id)
        Ricevuti.elenca(c).firstOrNull { it.id == id }?.let { RicevitoreConsegne.notifica(c, it, testo = esito) }
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
