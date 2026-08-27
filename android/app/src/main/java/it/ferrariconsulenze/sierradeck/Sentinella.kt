package it.ferrariconsulenze.sierradeck

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log
import kotlin.concurrent.thread

/**
 * La guardia **senza** la riga fissa.
 *
 * Un servizio in primo piano resta vivo per sempre, e Android in cambio pretende
 * una notifica che non si può togliere. Ma per guardare come va il computer non
 * serve restare vivi: basta **svegliarsi ogni tanto**, fare una domanda che dura
 * meno di un secondo, e tornare a dormire. Una sveglia non chiede niente in
 * cambio, e infatti qui non c'è nulla da vedere finché non c'è qualcosa da dire.
 *
 * Il prezzo è la puntualità: il sistema raggruppa le sveglie per risparmiare
 * batteria, e a telefono fermo da un po' può farne passare qualcuna. Quindi un
 * avviso può arrivare con qualche minuto di ritardo invece che in cinque
 * secondi. Per chi sta aspettando **adesso** c'è l'interruttore del controllo
 * continuo, che riaccende il servizio — e con lui la sua riga — finché serve.
 */
class Sentinella : BroadcastReceiver() {

    override fun onReceive(contesto: Context, intent: Intent) {
        // `goAsync` tiene in vita il processo il tempo della domanda: senza,
        // Android considera finito il lavoro appena `onReceive` ritorna e può
        // ucciderlo mentre la risposta è ancora per strada.
        val attesa = goAsync()
        val app = contesto.applicationContext
        thread(start = true) {
            try {
                Ronda.giro(app)
            } catch (e: Exception) {
                Log.i("SierraDeck", "giro di guardia non riuscito: ${e.message}")
            } finally {
                // La prossima sveglia si mette **dopo** questa, non a intervalli
                // fissi programmati una volta: una sveglia ripetuta che il
                // sistema salta non si rimette da sola, e la guardia morirebbe
                // in silenzio dopo il primo salto.
                try { programma(app) } catch (e: Exception) { }
                attesa.finish()
            }
        }
    }

    companion object {
        /**
         * Ogni due minuti.
         *
         * Non è un compromesso scelto a caso: sotto il minuto il sistema
         * comincia a ignorarle, e sopra i cinque un lavoro che si ferma lo
         * scopri troppo tardi perché la notifica serva a qualcosa. A telefono
         * fermo Android le dirada comunque, ed è giusto così.
         */
        private const val ATTESA_MS = 2 * 60 * 1000L

        private fun intento(contesto: Context): PendingIntent =
            PendingIntent.getBroadcast(
                contesto,
                0,
                Intent(contesto, Sentinella::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

        /**
         * Mette la prossima sveglia.
         *
         * `setAndAllowWhileIdle` e non una sveglia esatta: quella esatta da
         * Android 12 chiede un permesso a parte, che per guardare come va un
         * computer sarebbe chiedere troppo. Questa passa anche a telefono
         * addormentato, solo con meno puntualità.
         */
        fun programma(contesto: Context) {
            val sveglie = contesto.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val quando = SystemClock.elapsedRealtime() + ATTESA_MS
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                sveglie.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, quando, intento(contesto))
            } else {
                sveglie.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, quando, intento(contesto))
            }
        }

        /** Smette di svegliarsi: lo si fa quando si accende il controllo continuo. */
        fun ferma(contesto: Context) {
            try {
                val sveglie = contesto.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                sveglie.cancel(intento(contesto))
            } catch (e: Exception) {
                Log.i("SierraDeck", "sveglia non tolta: ${e.message}")
            }
        }
    }
}

/**
 * Rimette la sveglia dopo un riavvio del telefono.
 *
 * Le sveglie non sopravvivono allo spegnimento: senza questo, la guardia
 * smetterebbe di esistere al primo riavvio e nessuno se ne accorgerebbe —
 * finché una notifica che doveva arrivare non arriva.
 */
class SentinellaAlRiavvio : BroadcastReceiver() {
    override fun onReceive(contesto: Context, intent: Intent) {
        try {
            if (Collegamento(contesto).pronto) Sentinella.programma(contesto.applicationContext)
        } catch (e: Exception) {
            Log.i("SierraDeck", "sveglia non rimessa dopo il riavvio: ${e.message}")
        }
    }
}
