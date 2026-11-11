package it.ferrariconsulenze.sierradeck.dati

import it.ferrariconsulenze.sierradeck.nucleo.EsitoInvio
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.InputStream
import java.util.UUID

/**
 * **I file che il telefono manda ai PC, in coda su file** (app 11/11). Prima
 * l'invio stava nella schermata: uscendo, o se Android chiudeva l'app, si
 * perdeva a metà. Adesso:
 *
 * - il file scelto si copia subito nella cartella dell'app (un `content://`
 *   di un'altra app può sparire), con la sua impronta;
 * - parte con un id suo che resta lo stesso a ogni ripresa: il PC riparte da
 *   dove era arrivato (`/api/allegati/stato`);
 * - se la rete cade resta «in attesa» e riparte da solo quando il PC torna
 *   collegato o al prossimo avvio; un rifiuto vero del PC resta col motivo.
 */
class CodaFile(
    private val cartella: File,
    private val manda: suspend (Voce, File, (Long, Long) -> Unit) -> EsitoInvio,
    private val orologio: () -> Long = System::currentTimeMillis
) {
    @Serializable
    data class Voce(
        val id: String,
        val pc: String,
        val nome: String,
        val byte: Long,
        val sha256: String? = null,
        /** autopilota | chat | cartella, come `DestinazioneFile`. */
        val tipo: String,
        val destId: String,
        val destNome: String,
        val creato: Long,
        /** attesa | invio | arrivato | rifiutato */
        val stato: String = "attesa",
        val fatti: Long = 0,
        val messaggio: String? = null
    ) {
        val percento: Int get() = if (byte <= 0) 0 else ((fatti * 100) / byte).toInt().coerceIn(0, 100)
    }

    @Serializable private data class SuFile(val voci: List<Voce> = emptyList())

    private val json = Json { ignoreUnknownKeys = true }
    private val indice = File(cartella, "coda-file.json")
    private val copie = File(cartella, "in-uscita")
    private val chiave = Mutex()
    private val _voci = MutableStateFlow<List<Voce>>(emptyList())
    val voci: StateFlow<List<Voce>> = _voci.asStateFlow()

    init {
        val letto = runCatching { json.decodeFromString(SuFile.serializer(), indice.readText()) }.getOrNull() ?: SuFile()
        // Un invio interrotto a metà (app chiusa) torna in attesa: riparte da dove era.
        _voci.value = letto.voci.map { if (it.stato == "invio") it.copy(stato = "attesa") else it }
    }

    private fun scrivi() {
        cartella.mkdirs()
        val tmp = File(cartella, indice.name + ".tmp")
        tmp.writeText(json.encodeToString(SuFile.serializer(), SuFile(_voci.value)))
        if (!tmp.renameTo(indice)) { indice.delete(); tmp.renameTo(indice) }
    }

    @Synchronized
    private fun cambia(id: String, f: (Voce) -> Voce?) { _voci.value = _voci.value.mapNotNull { if (it.id == id) f(it) else it }; scrivi() }

    fun copiaDi(v: Voce): File = File(copie, v.id)

    /** Mette un file in coda: lo copia nella cartella dell'app. [sha256] e [byte] li calcola chi chiama (fuori dal filo principale). */
    @Synchronized
    fun metti(pc: String, nome: String, byte: Long, sha256: String?, tipo: String, destId: String, destNome: String, apri: () -> InputStream): Voce {
        val v = Voce(UUID.randomUUID().toString(), pc, nome, byte, sha256, tipo, destId, destNome, orologio())
        copie.mkdirs()
        apri().use { i -> copiaDi(v).outputStream().use { o -> i.copyTo(o) } }
        _voci.value = _voci.value + v
        scrivi()
        return v
    }

    /** Toglie una voce (finita o rifiutata) e la sua copia. */
    @Synchronized
    fun togli(id: String) {
        _voci.value.firstOrNull { it.id == id }?.let { copiaDi(it).delete() }
        _voci.value = _voci.value.filterNot { it.id == id }
        scrivi()
    }

    /** Un rifiutato da riprovare: torna in attesa con lo stesso id. */
    fun riprova(id: String) = cambia(id) { it.copy(stato = "attesa", messaggio = null) }

    /** Manda quelli in attesa di quel PC (null = tutti), uno alla volta. */
    suspend fun svuota(pc: String? = null) = chiave.withLock {
        for (v in _voci.value.filter { (pc == null || it.pc == pc) && it.stato == "attesa" }) {
            val copia = copiaDi(v)
            if (!copia.exists()) { cambia(v.id) { it.copy(stato = "rifiutato", messaggio = "Il file non c’è più sul telefono.") }; continue }
            cambia(v.id) { it.copy(stato = "invio", messaggio = null) }
            var ultimo = 0L
            val e = manda(v, copia) { fatti, _ ->
                // Su file ogni tanto, non a ogni pezzo.
                if (fatti - ultimo >= 256 * 1024 || fatti >= v.byte) { ultimo = fatti; cambia(v.id) { it.copy(fatti = fatti) } }
                else _voci.value = _voci.value.map { if (it.id == v.id) it.copy(fatti = fatti) else it }
            }
            when (e) {
                is EsitoInvio.Arrivato -> { copia.delete(); cambia(v.id) { it.copy(stato = "arrivato", fatti = it.byte, messaggio = e.percorso.ifBlank { null }) } }
                is EsitoInvio.Rifiutato -> if (e.codice == 0) {
                    cambia(v.id) { it.copy(stato = "attesa", messaggio = e.messaggio) }
                    return@withLock
                } else cambia(v.id) { it.copy(stato = "rifiutato", messaggio = e.messaggio) }
            }
        }
    }

    fun ascolta(ambito: CoroutineScope, collegati: Flow<Set<String>>) {
        ambito.launch { collegati.collect { pcs -> for (p in pcs) if (_voci.value.any { it.pc == p && it.stato == "attesa" }) svuota(p) } }
    }

    companion object {
        @Volatile private var una: CodaFile? = null
        val pronta: CodaFile? get() = una

        @Synchronized
        fun avvia(cartella: File, ambito: CoroutineScope, manda: suspend (Voce, File, (Long, Long) -> Unit) -> EsitoInvio, collegati: Flow<Set<String>>): CodaFile {
            una?.let { return it }
            val c = CodaFile(cartella, manda)
            c.ascolta(ambito, collegati)
            ambito.launch { c.svuota() }
            una = c
            return c
        }
    }
}
