package it.ferrariconsulenze.sierradeck.sottofondo

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit

/**
 * L'ascolto del computer, ad app chiusa (app 2.100.0).
 *
 * Un servizio in primo piano tiene aperta una richiesta lunga verso il PC
 * (`/api/eventi`, il PC risponde appena nasce o si chiude un avviso, al più
 * dopo 50 s) e la richiama subito. Un avviso arriva quindi in un secondo o
 * due anche a schermo spento, invece che alla sveglia dopo (minuti).
 *
 * Tipo `connectedDevice` e non `dataSync`: da Android 15 `dataSync` si ferma
 * dopo 6 ore al giorno e non può partire all'accensione; `connectedDevice`
 * («interazioni con dispositivi esterni via rete», il computer) non ha limiti
 * di tempo e chiede solo uno dei permessi di rete, che l'app ha già
 * (`CHANGE_WIFI_MULTICAST_STATE`).
 *
 * Android vuole una notifica per il servizio: dall'app 3.0.2 sta su un canale
 * invisibile (Nicholas, 12/11: niente righe fisse), e l'ascolto continua.
 */
object Ascolto {
    private val _stato = MutableStateFlow(StatoAscolto())
    /** Per la schermata «Notifiche»: se gira, l'ultimo contatto, il motivo di un blocco. */
    val stato: StateFlow<StatoAscolto> = _stato.asStateFlow()

    internal fun aggiorna(s: StatoAscolto) { _stato.value = s }

    /** Il ripiego: un giro ogni 15 minuti con WorkManager, se il servizio non c'è. */
    const val LAVORO_RIPIEGO = "ascolto-ripiego"

    /** Accende l'ascolto. Torna false se Android non lo lascia partire adesso. */
    fun avvia(c: Context): Boolean {
        programmaRipiego(c)
        if (!Collegamento(c).pronto) return false
        return try {
            c.startForegroundService(Intent(c, AscoltoService::class.java))
            true
        } catch (e: Exception) {
            // Da dietro, senza esenzione dalla batteria: ForegroundServiceStartNotAllowedException.
            Log.i("SierraDeck", "ascolto non avviato: ${e.message}")
            false
        }
    }

    fun ferma(c: Context) {
        try { c.stopService(Intent(c, AscoltoService::class.java)) } catch (_: Exception) { }
    }

    fun programmaRipiego(c: Context) {
        try {
            val r = PeriodicWorkRequestBuilder<RipiegoAscolto>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(c).enqueueUniquePeriodicWork(LAVORO_RIPIEGO, ExistingPeriodicWorkPolicy.KEEP, r)
        } catch (_: Exception) { }
    }

    /** L'app è esclusa dal risparmio batteria: può ripartire da sola anche da dietro. */
    fun batteriaLibera(c: Context): Boolean = try {
        (c.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(c.packageName)
    } catch (_: Exception) { false }

    fun notificheAccese(c: Context): Boolean = NotificationManagerCompat.from(c).areNotificationsEnabled()

    /** Il punto del registro, per PC: un altro PC (o un nuovo accoppiamento) riparte da 0. */
    class Memoria(private val c: Context) : MemoriaAscolto {
        private val p get() = c.getSharedPreferences("ascolto", Context.MODE_PRIVATE)
        private val chiave get() = "ultimo:" + Collegamento.pulisci(Collegamento(c).indirizzo)
        override var ultimo: Long
            get() = p.getLong(chiave, 0L)
            set(v) { p.edit().putLong(chiave, v).apply() }
    }

    /** Il ciclo di un giro, uguale nel servizio e nel ripiego. */
    fun ciclo(c: Context): CicloAscolto = CicloAscolto(
        porta = { Porte.delPc(c) },
        memoria = Memoria(c),
        alPacco = { r ->
            Avvisatore.applica(c, r)
            // Un file annunciato si va a prendere subito, senza aspettare il giro delle consegne (11/11).
            if (r.avvisi.any { it.bersaglio.cosa == "file" && it.chiuso == null }) RicevitoreConsegne.subito(c)
        },
        alVecchioPc = { try { Ronda.giro(c) } catch (_: Exception) { } }
    )
}

class AscoltoService : Service() {
    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val sveglia = Channel<Unit>(Channel.CONFLATED)
    private var richiamo: ConnectivityManager.NetworkCallback? = null
    @Volatile private var rigaMostrata: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        try {
            Avvisatore.creaCanali(this)
            val testo = RegoleAvvisi.rigaAscolto(null, System.currentTimeMillis())
            ServiceCompat.startForeground(
                this, Avvisatore.ID_RIGA, Avvisatore.rigaAscolto(this, testo),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
            )
            rigaMostrata = testo
        } catch (e: Exception) {
            Log.e("SierraDeck", "ascolto non avviato", e)
            stopSelf()
            return
        }
        osservaRete()
        ambito.launch { ascolta() }
    }

    private var giaPartito = false

    /** Un secondo «avvia» (l'app riaperta, il ripiego): si richiama subito il PC. */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (giaPartito) sveglia.trySend(Unit) else giaPartito = true
        return START_STICKY
    }

    /** Solo per i tipi a tempo (Android 15): qui non dovrebbe arrivare, ma se arriva ci si ferma pulito. */
    override fun onTimeout(startId: Int, fgsType: Int) {
        Log.i("SierraDeck", "ascolto: tempo scaduto per il tipo $fgsType, mi fermo")
        stopSelf()
    }

    override fun onDestroy() {
        ambito.cancel()
        richiamo?.let { r -> try { (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(r) } catch (_: Exception) { } }
        Ascolto.aggiorna(Ascolto.stato.value.copy(attivo = false))
        super.onDestroy()
    }

    private suspend fun ascolta() {
        val ciclo = Ascolto.ciclo(applicationContext)
        Ascolto.aggiorna(Ascolto.stato.value.copy(attivo = true))
        while (currentCoroutineContext().isActive) {
            val attesa = try { conSveglia { ciclo.giro() } } catch (e: CancellationException) { throw e } catch (e: Exception) {
                Log.i("SierraDeck", "giro d'ascolto: ${e.message}"); 5_000L
            }
            if (attesa == null) ciclo.azzeraAttese()
            Ascolto.aggiorna(ciclo.stato.value.copy(attivo = true))
            if (attesa == CicloAscolto.NON_ACCOPPIATO) { stopSelf(); return }
            aggiornaRiga(ciclo.stato.value)
            // Le risposte rimaste indietro, a ogni giro andato bene.
            if (ciclo.stato.value.motivo == null) try { InvioRisposte.giro(applicationContext) } catch (_: Exception) { }
            if (attesa != null && attesa > 0) withTimeoutOrNull(attesa) { sveglia.receive(); ciclo.azzeraAttese() }
        }
    }

    /** Il giro, interrotto se cambia la rete (null): la richiesta vecchia è su una strada morta. */
    private suspend fun conSveglia(giro: suspend () -> Long): Long? = coroutineScope {
        while (sveglia.tryReceive().isSuccess) { /* le sveglie vecchie non contano */ }
        val g = async { giro() }
        val s = launch { sveglia.receive(); g.cancel() }
        try { g.await() } catch (e: CancellationException) {
            if (!currentCoroutineContext().isActive) throw e
            null
        } finally { s.cancel() }
    }

    private fun osservaRete() {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val r = object : ConnectivityManager.NetworkCallback() {
            private var ultima: Network? = null
            override fun onAvailable(network: Network) {
                val prima = ultima
                ultima = network
                // La prima chiamata arriva subito, con la rete di adesso: non è un cambio.
                if (prima != null && prima != network) sveglia.trySend(Unit)
            }
        }
        try { cm.registerDefaultNetworkCallback(r); richiamo = r } catch (_: Exception) { }
    }

    private fun aggiornaRiga(s: StatoAscolto) {
        val testo = s.motivo?.let { "Non raggiungo il computer · riprovo da solo" }
            ?: RegoleAvvisi.rigaAscolto(s.ultimoContatto, System.currentTimeMillis(), s.vecchioPc)
        if (testo == rigaMostrata) return
        rigaMostrata = testo
        try { NotificationManagerCompat.from(this).notify(Avvisatore.ID_RIGA, Avvisatore.rigaAscolto(this, testo)) } catch (_: SecurityException) { }
    }
}

/**
 * Il ripiego, ogni 15 minuti (WorkManager): riaccende l'ascolto se è caduto e,
 * se Android non lo lascia ripartire da dietro, fa lui un giro breve.
 */
class RipiegoAscolto(contesto: Context, parametri: WorkerParameters) : CoroutineWorker(contesto, parametri) {
    override suspend fun doWork(): Result {
        val c = applicationContext
        // Il prossimo giro prima di questo: se questo cade, la catena resta.
        Ascolto.programmaRipiego(c)
        if (!Collegamento(c).pronto) return Result.success()
        if (Ascolto.stato.value.attivo) return Result.success()
        if (Ascolto.avvia(c)) {
            delay(3_000)
            if (Ascolto.stato.value.attivo) return Result.success()
        }
        try {
            Ascolto.ciclo(c).giro(attesaS = 0)
            InvioRisposte.giro(c)
        } catch (_: Exception) { }
        return Result.success()
    }
}

/**
 * Riaccende l'ascolto all'accensione del telefono e dopo un aggiornamento
 * dell'app (Android cancella tutto di un pacchetto che sostituisce, e non
 * manda BOOT_COMPLETED). Tutti e due sono esenzioni dal divieto di avviare un
 * servizio in primo piano da dietro; `connectedDevice` non è fra i tipi
 * vietati all'accensione da Android 15.
 */
class AscoltoAlRiavvio : BroadcastReceiver() {
    override fun onReceive(contesto: Context, intent: Intent) {
        try {
            if (Collegamento(contesto).pronto) Ascolto.avvia(contesto.applicationContext)
        } catch (e: Exception) {
            Log.i("SierraDeck", "ascolto non riacceso dopo il riavvio: ${e.message}")
        }
    }
}
