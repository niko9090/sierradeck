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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/*
 * I file dal PC al telefono, dalla parte del telefono (app 2.54.0).
 *
 * Il PC tiene una coda per questo telefono (`/api/consegne`). L'app la ritira:
 * - subito, quando lo stato del PC dice che c'è qualcosa (`consegne` > 0:
 *   lo legge sia l'app aperta sia la guardia in sottofondo, `Ronda`);
 * - ogni quindici minuti con WorkManager, anche ad app chiusa, quando c'è
 *   la rete: è così che un file messo in coda a telefono spento arriva dopo;
 * - a mano, con «Controlla adesso» nella sezione File.
 * Si guarda il PC accoppiato e, attraverso il ponte, gli altri PC accesi.
 * Ogni file arriva a pezzi in `consegne-in-arrivo/` (la sua lunghezza è
 * quanto è già arrivato: se la rete cade si riparte da lì), poi si controlla
 * l'impronta, si sposta in `ricevuti/`, si dice al PC «ricevuto» e arriva la
 * notifica «Hai ricevuto NOME da PC» con Apri, Salva e Condividi.
 */

/** Un file arrivato dal PC, tenuto nella cartella dell'app. */
data class Ricevuto(
    val id: String,
    val nome: String,
    /** Il file, in `files/ricevuti/`. */
    val file: String,
    val byte: Long,
    val daPc: String,
    val quando: Long,
    val nota: String? = null,
    val daChat: String? = null,
    /** Dove è stato salvato fuori dall'app, se lo si è fatto. */
    val salvatoIn: String? = null
)

object Ricevuti {
    private const val PREFERENZE = "sierradeck-ricevuti"
    /** Cambia a ogni arrivo: la sezione File si ridisegna. */
    var versione by mutableIntStateOf(0)

    fun cartella(c: Context): File = File(c.filesDir, "ricevuti").apply { mkdirs() }

    fun elenca(c: Context): List<Ricevuto> = try {
        val a = JSONArray(c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).getString("elenco", "[]") ?: "[]")
        (0 until a.length()).map { i ->
            val o = a.getJSONObject(i)
            Ricevuto(
                o.getString("id"), o.getString("nome"), o.getString("file"), o.optLong("byte"), o.optString("daPc"), o.optLong("quando"),
                o.optString("nota").takeIf { it.isNotBlank() }, o.optString("daChat").takeIf { it.isNotBlank() }, o.optString("salvatoIn").takeIf { it.isNotBlank() }
            )
        }.filter { File(it.file).exists() }.sortedByDescending { it.quando }
    } catch (_: Exception) { emptyList() }

    private fun scrivi(c: Context, tutti: List<Ricevuto>) {
        val a = JSONArray()
        for (r in tutti.take(200)) a.put(JSONObject().apply {
            put("id", r.id); put("nome", r.nome); put("file", r.file); put("byte", r.byte); put("daPc", r.daPc); put("quando", r.quando)
            r.nota?.let { put("nota", it) }; r.daChat?.let { put("daChat", it) }; r.salvatoIn?.let { put("salvatoIn", it) }
        })
        c.getSharedPreferences(PREFERENZE, Context.MODE_PRIVATE).edit().putString("elenco", a.toString()).apply()
        versione += 1
    }

    @Synchronized
    fun aggiungi(c: Context, r: Ricevuto) = scrivi(c, listOf(r) + elenca(c).filter { it.id != r.id })

    @Synchronized
    fun segnaSalvato(c: Context, id: String, dove: String) = scrivi(c, elenca(c).map { if (it.id == id) it.copy(salvatoIn = dove) else it })

    /** Lo toglie dall'elenco e dal telefono (non tocca la copia salvata in Download). */
    @Synchronized
    fun togli(c: Context, id: String) {
        val tutti = elenca(c)
        tutti.firstOrNull { it.id == id }?.let { File(it.file).delete() }
        scrivi(c, tutti.filter { it.id != id })
    }

    fun uri(c: Context, r: Ricevuto): Uri = FileProvider.getUriForFile(c, "${c.packageName}.file", File(r.file))

    /** Apri con un'altra app. */
    fun intentApri(c: Context, r: Ricevuto): Intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri(c, r), FileVista.mime(r.nome))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    /** Condividi (l'Intent di Android, con la scelta dell'app). */
    fun intentCondividi(c: Context, r: Ricevuto): Intent = Intent.createChooser(
        Intent(Intent.ACTION_SEND).apply {
            type = FileVista.mime(r.nome)
            putExtra(Intent.EXTRA_STREAM, uri(c, r))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, "Condividi ${r.nome}"
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

/**
 * Salvare un file fuori dall'app: in `Download/SierraDeck`, dove lo trovano
 * le altre app e il gestore dei file. Da Android 10 con MediaStore, senza
 * permessi; prima, nella cartella Download dell'app (Android 8-9 vorrebbero
 * un permesso in più per la Download di tutti, e non lo chiediamo).
 */
object SalvaFuori {
    fun inDownload(c: Context, sorgente: File, nome: String): String {
        val mime = FileVista.mime(nome)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val valori = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, FileVista.nomeSicuro(nome))
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/SierraDeck")
            }
            val uri = c.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valori) ?: throw java.io.IOException("Android non ha dato un posto in Download")
            c.contentResolver.openOutputStream(uri)?.use { out -> sorgente.inputStream().use { it.copyTo(out) } } ?: throw java.io.IOException("Download non si apre")
            return "Download/SierraDeck"
        }
        val dir = File(c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "SierraDeck").apply { mkdirs() }
        val dest = File(dir, FileVista.nomeLibero(nome) { File(dir, it).exists() })
        sorgente.copyTo(dest)
        return dest.absolutePath
    }
}

object RicevitoreConsegne {
    const val CANALE = "file-ricevuti"
    private const val PERIODICO = "consegne"
    private const val SUBITO = "consegne-subito"
    const val AZIONE_SALVA = "it.ferrariconsulenze.sierradeck.SALVA_RICEVUTO"
    const val EXTRA_ID = "ricevuto"
    private val unoPerVolta = Mutex()

    /** Il periodico (ogni 15 minuti, con la rete) e un giro subito. */
    fun programma(c: Context) {
        val rete = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val wm = WorkManager.getInstance(c)
        wm.enqueueUniquePeriodicWork(PERIODICO, ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<LavoroConsegne>(15, TimeUnit.MINUTES).setConstraints(rete).build())
        subito(c)
    }

    /** Un giro adesso (lo stato del PC dice che c'è qualcosa). Se uno è già in corso, basta quello. */
    fun subito(c: Context) {
        val rete = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(c).enqueueUniqueWork(SUBITO, ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<LavoroConsegne>().setConstraints(rete).build())
    }

    /** Il nome con cui questo telefono si presenta ai PC del ponte. */
    fun nomeTelefono(): String = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Telefono"

    /**
     * Un giro: il PC accoppiato e gli altri accesi (dal ponte). Torna quanti
     * file sono arrivati e, se qualcuno no, perché.
     */
    suspend fun giro(c: Context): Pair<Int, List<String>> = unoPerVolta.withLock {
        val col = Collegamento(c)
        if (!col.pronto) return@withLock 0 to emptyList()
        val api = Api(col.indirizzo, col.chiave)
        val strade = mutableListOf<Pair<String?, Api>>(null to api)
        try {
            val e = api.pc()
            for (p in e.pc) if (p.pcId != e.io && p.vivo && FunzioniPc.disponibile(FunzionePc.FILE, p.versione) != false) strade += p.pcId to api.suPc(p.pcId)
        } catch (e: CancellationException) { throw e } catch (_: Exception) { }
        var arrivati = 0
        val problemi = mutableListOf<String>()
        for ((pcId, a) in strade) {
            val elenco = try { a.consegne(nomeTelefono()).consegne } catch (e: CancellationException) { throw e } catch (_: Exception) { continue }
            for (k in elenco) {
                when (val r = ricevi(c, a, pcId, k)) {
                    null -> arrivati += 1
                    else -> problemi += "${k.nome}: $r"
                }
            }
        }
        arrivati to problemi
    }

    /** Un file: a pezzi, l'impronta, al suo posto, «ricevuto» al PC, la notifica. `null` = arrivato. */
    private suspend fun ricevi(c: Context, a: Api, pcId: String?, k: ConsegnaTel): String? {
        // Già arrivato, ma il «ricevuto» non era arrivato al PC: lo si ridice, senza riscaricarlo.
        Ricevuti.elenca(c).firstOrNull { it.id == k.id && it.daPc == k.daPc }?.let { gia ->
            return try { a.consegnaRicevuta(k.id, FileVista.impronta(File(gia.file))); null } catch (e: CancellationException) { throw e } catch (e: Exception) { FileVista.motivo(e) }
        }
        val chiave = (pcId ?: "qui").replace(Regex("[^A-Za-z0-9_-]"), "_")
        val parte = File(File(c.filesDir, "consegne-in-arrivo").apply { mkdirs() }, "${chiave}_${k.id.replace(Regex("[^A-Za-z0-9_-]"), "_")}.part")
        val esito = Scaricatore.scarica(parte, { da -> val p = a.consegnaPezzo(k.id, da); Scaricatore.decodifica(p.dati) to p.byte }, k.sha256)
        return when (esito) {
            is Scaricatore.Esito.Fatto -> {
                val dir = Ricevuti.cartella(c)
                val dest = File(dir, FileVista.nomeLibero(k.nome) { File(dir, it).exists() })
                if (!parte.renameTo(dest)) { parte.copyTo(dest, overwrite = true); parte.delete() }
                try { a.consegnaRicevuta(k.id, FileVista.impronta(dest)) } catch (e: CancellationException) { throw e } catch (e: Exception) {
                    // Il file c'è: se il PC non ha sentito il «ricevuto», al giro dopo lo
                    // rimanderebbe. Lo si dice, ma il file resta.
                    Log.i("SierraDeck", "ricevuta non arrivata al PC: ${e.message}")
                }
                val r = Ricevuto(k.id, dest.name, dest.absolutePath, dest.length(), k.daPc, System.currentTimeMillis(), k.nota, k.daChat)
                Ricevuti.aggiungi(c, r)
                notifica(c, r, k)
                null
            }
            is Scaricatore.Esito.Fallito -> {
                // Annullato dal PC, scaduto, già consegnato: la parte non serve più.
                if (esito.codice == 404 || esito.codice == 410) parte.delete()
                esito.messaggio
            }
        }
    }

    fun creaCanale(c: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            c.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CANALE, "File dal computer", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Quando un computer ti manda un file («📱 Manda al telefono» o una chat): con Apri, Salva e Condividi"
                }
            )
        }
    }

    private fun idNotifica(id: String): Int = 7000 + (id.hashCode() and 0x0fff)

    fun notifica(c: Context, r: Ricevuto, k: ConsegnaTel? = null, testo: String? = null) {
        creaCanale(c)
        val n = idNotifica(r.id)
        val apri = PendingIntent.getActivity(c, n, Ricevuti.intentApri(c, r), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val condividi = PendingIntent.getActivity(c, n + 1, Ricevuti.intentCondividi(c, r), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val salva = PendingIntent.getBroadcast(
            c, n + 2,
            Intent(c, SalvaRicevuto::class.java).setAction(AZIONE_SALVA).putExtra(EXTRA_ID, r.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val corpo = testo ?: (k?.let { FileVista.testoNotifica(it) } ?: "Hai ricevuto ${r.nome} da ${r.daPc.ifBlank { "il PC" }}.")
        val notifica = NotificationCompat.Builder(c, CANALE)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentTitle("Hai ricevuto ${r.nome} da ${r.daPc.ifBlank { "il PC" }}")
            .setContentText(corpo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(corpo))
            .setContentIntent(apri)
            .addAction(0, "Apri", apri)
            .addAction(0, "Salva", salva)
            .addAction(0, "Condividi", condividi)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(c).notify(n, notifica) } catch (e: SecurityException) {
            Log.i("SierraDeck", "notifica del file non permessa: ${e.message}")
        }
    }

    /** «Salva» dalla notifica o dalla sezione File: in Download/SierraDeck. */
    fun salva(c: Context, id: String): String {
        val r = Ricevuti.elenca(c).firstOrNull { it.id == id } ?: return "Questo file non c'è più nell'app."
        return try {
            val dove = SalvaFuori.inDownload(c, File(r.file), r.nome)
            Ricevuti.segnaSalvato(c, id, dove)
            "Salvato in $dove"
        } catch (e: Exception) {
            "Non sono riuscito a salvarlo: ${e.message ?: "errore"}"
        }
    }
}

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
