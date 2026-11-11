package it.ferrariconsulenze.sierradeck.dati

import it.ferrariconsulenze.sierradeck.rete.Esito
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
import java.util.UUID

/**
 * **La coda degli invii, su file** (app 11/11). Nicholas: un messaggio scritto
 * dal telefono non deve sparire. Prima il testo stava nel campo della
 * schermata: uscendo dalla chat, cambiando voce o se Android rifaceva
 * l'Activity, era perso; e se l'invio falliva il campo era già vuoto.
 *
 * - Ogni messaggio entra qui **prima** di partire, con un id suo che resta lo
 *   stesso a ogni tentativo (`x-sierradeck-richiesta`: il PC scarta i doppioni).
 * - Parte subito; se il PC non risponde resta in coda e riparte da solo quando
 *   il telefono si ricollega (o al prossimo avvio dell'app).
 * - Un rifiuto del PC non lo butta: resta con il motivo, da riprovare o togliere.
 * - Anche la bozza (quello che stai scrivendo e non hai mandato) sta qui, per casella.
 */
class CodaInvii(
    private val file: File,
    private val manda: suspend (Invio) -> Esito<String>,
    private val orologio: () -> Long = System::currentTimeMillis
) {
    @Serializable
    data class Invio(
        val id: String,
        val pc: String,
        val rotta: String,
        val corpo: String,
        /** La casella da cui viene («ap:<id>», «chat:<id>»): la schermata mostra i suoi in fondo alla chat. */
        val casella: String,
        val testo: String,
        val creato: Long,
        val tentativi: Int = 0,
        /** Il PC l'ha rifiutato: non riparte da solo. */
        val rifiutato: String? = null
    )

    @Serializable
    private data class SuFile(val invii: List<Invio> = emptyList(), val bozze: Map<String, String> = emptyMap())

    private val json = Json { ignoreUnknownKeys = true }
    private val chiave = Mutex()
    private val _invii = MutableStateFlow<List<Invio>>(emptyList())
    val invii: StateFlow<List<Invio>> = _invii.asStateFlow()
    private val _bozze = MutableStateFlow<Map<String, String>>(emptyMap())
    val bozze: StateFlow<Map<String, String>> = _bozze.asStateFlow()

    init {
        val letto = runCatching { json.decodeFromString(SuFile.serializer(), file.readText()) }.getOrNull() ?: SuFile()
        _invii.value = letto.invii
        _bozze.value = letto.bozze
    }

    private fun scrivi() {
        val testo = json.encodeToString(SuFile.serializer(), SuFile(_invii.value, _bozze.value))
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(testo)
        if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
    }

    /** La bozza di una casella, tenuta a ogni lettera. */
    @Synchronized
    fun bozza(casella: String, testo: String) {
        _bozze.value = if (testo.isEmpty()) _bozze.value - casella else _bozze.value + (casella to testo)
        scrivi()
    }

    /** Mette un messaggio in coda (e toglie la bozza della sua casella). Partirà con [svuota]. */
    @Synchronized
    fun metti(pc: String, rotta: String, corpo: String, casella: String, testo: String): Invio {
        val i = Invio(UUID.randomUUID().toString(), pc, rotta, corpo, casella, testo, orologio())
        _invii.value = _invii.value + i
        _bozze.value = _bozze.value - casella
        scrivi()
        return i
    }

    @Synchronized
    fun togli(id: String) { _invii.value = _invii.value.filterNot { it.id == id }; scrivi() }

    /** Un rifiutato che si vuole riprovare: torna in coda come prima, con lo stesso id. */
    @Synchronized
    fun riprova(id: String) { _invii.value = _invii.value.map { if (it.id == id) it.copy(rifiutato = null) else it }; scrivi() }

    @Synchronized
    private fun cambia(id: String, f: (Invio) -> Invio?) {
        _invii.value = _invii.value.mapNotNull { if (it.id == id) f(it) else it }
        scrivi()
    }

    /**
     * Manda quelli in coda di quel PC (null = tutti), in ordine. Si ferma al primo
     * che non arriva per la rete: gli altri aspettano con lui, così l'ordine resta.
     */
    suspend fun svuota(pc: String? = null) = chiave.withLock {
        for (i in _invii.value.filter { (pc == null || it.pc == pc) && it.rifiutato == null }) {
            when (val e = manda(i)) {
                is Esito.Riuscito -> cambia(i.id) { null }
                is Esito.Rifiuto -> if (e.codice >= 500) { cambia(i.id) { it.copy(tentativi = it.tentativi + 1) }; return@withLock } else cambia(i.id) { it.copy(tentativi = it.tentativi + 1, rifiutato = e.motivo.ifBlank { "rifiutato" }) }
                is Esito.MancaSulPc -> cambia(i.id) { it.copy(tentativi = it.tentativi + 1, rifiutato = e.motivo) }
                is Esito.Rete -> { cambia(i.id) { it.copy(tentativi = it.tentativi + 1) }; return@withLock }
            }
        }
    }

    /** Riparte da sola quando un PC con messaggi in coda torna collegato. */
    fun ascolta(ambito: CoroutineScope, collegati: Flow<Set<String>>) {
        ambito.launch { collegati.collect { pcs -> for (p in pcs) if (_invii.value.any { it.pc == p && it.rifiutato == null }) svuota(p) } }
    }

    companion object {
        @Volatile private var una: CodaInvii? = null
        val pronta: CodaInvii? get() = una

        @Synchronized
        fun avvia(cartella: File, ambito: CoroutineScope, manda: suspend (Invio) -> Esito<String>, collegati: Flow<Set<String>>): CodaInvii {
            una?.let { return it }
            val c = CodaInvii(File(cartella, "coda-invii.json"), manda)
            c.ascolta(ambito, collegati)
            ambito.launch { c.svuota() }
            una = c
            return c
        }
    }
}
