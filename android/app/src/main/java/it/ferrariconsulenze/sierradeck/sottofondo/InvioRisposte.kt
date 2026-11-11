package it.ferrariconsulenze.sierradeck.sottofondo

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Le risposte date dalla notifica e non ancora arrivate al PC: su disco, e un
 * lavoro di WorkManager che riprova (subito, poi con attese crescenti) appena
 * c'è rete. Anche l'ascolto ci prova a ogni giro riuscito.
 */
object InvioRisposte {
    private const val PREFERENZE = "risposte-in-coda"
    private const val CHIAVE = "coda"
    const val LAVORO = "risposte-avvisi"

    @Synchronized
    fun coda(c: Context): List<InvioRisposta> =
        CodaRisposte.decodifica(c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).getString(CHIAVE, null))

    @Synchronized
    private fun salva(c: Context, coda: List<InvioRisposta>) {
        c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit().putString(CHIAVE, CodaRisposte.codifica(coda)).commit()
    }

    @Synchronized
    fun accoda(c: Context, r: InvioRisposta) {
        // Una risposta nuova allo stesso avviso sostituisce quella vecchia non partita.
        salva(c, coda(c).filter { it.avviso != r.avviso } + r)
        programma(c)
    }

    @Synchronized
    private fun togli(c: Context, finite: Set<String>) = salva(c, coda(c).filter { it.idRichiesta !in finite })

    fun programma(c: Context) {
        val richiesta = OneTimeWorkRequestBuilder<LavoroRisposte>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        try { WorkManager.getInstance(c).enqueueUniqueWork(LAVORO, ExistingWorkPolicy.REPLACE, richiesta) } catch (_: Exception) { }
    }

    /** Un giro sulla coda. Torna true se resta qualcosa da mandare. */
    suspend fun giro(c: Context, porta: PortaPc? = null): Boolean {
        val coda = coda(c)
        if (coda.isEmpty()) return false
        val p = porta ?: Porte.delPc(c) ?: return false
        val (restano, finite) = CodaRisposte.mandaTutte(p, coda, System.currentTimeMillis())
        for ((r, esito, motivo) in finite) {
            if (esito == EsitoInvio.PRESA) Avvisatore.risposto(c, r.avviso, r.titolo, r.domanda, r.testo)
            else Avvisatore.rifiutata(c, r.avviso, r.titolo, motivo)
        }
        togli(c, finite.map { it.first.idRichiesta }.toSet())
        return restano.isNotEmpty()
    }
}

class LavoroRisposte(contesto: Context, parametri: WorkerParameters) : CoroutineWorker(contesto, parametri) {
    override suspend fun doWork(): Result = try {
        if (InvioRisposte.giro(applicationContext)) Result.retry() else Result.success()
    } catch (_: Exception) {
        Result.retry()
    }

    override suspend fun getForegroundInfo(): androidx.work.ForegroundInfo {
        Avvisatore.creaCanali(applicationContext)
        return androidx.work.ForegroundInfo(
            Avvisatore.ID_RIGA + 1,
            Avvisatore.rigaAscolto(applicationContext, "Mando le tue risposte al computer…")
        )
    }
}
