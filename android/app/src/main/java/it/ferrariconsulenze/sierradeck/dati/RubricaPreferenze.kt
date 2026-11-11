package it.ferrariconsulenze.sierradeck.dati

import android.content.Context
import android.content.SharedPreferences
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.IndirizzoNoto
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import it.ferrariconsulenze.sierradeck.rete.Rubrica
import it.ferrariconsulenze.sierradeck.rete.Strade
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

/**
 * La rubrica dei PC sopra le preferenze di sempre (file `sierradeck`):
 * `postazioni` (nome, tenuta, ultimo uso), `chiave:<indirizzo>`, `indirizzo`
 * (il PC scelto) e `percorsi:<indirizzo>` (impronta e indirizzi imparati dal
 * codice di prima, letti solo per la conversione). Quello che il Centralino
 * impara in più va in una chiave nuova, `strade:<indirizzo>`: le chiavi di
 * prima non cambiano, e chi torna a un'app vecchia ritrova tutto.
 *
 * Letta una volta e tenuta in memoria: le schermate non leggono più le preferenze.
 */
class RubricaPreferenze(private val contesto: Context) : Rubrica {
    private val prefs: SharedPreferences = contesto.getSharedPreferences("sierradeck", Context.MODE_PRIVATE)
    private val collegamento = Collegamento(contesto)
    private val _elenco = MutableStateFlow<List<PcNoto>>(emptyList())
    private val _corrente = MutableStateFlow<String?>(null)
    private val _pronta = MutableStateFlow(false)
    override val elenco: StateFlow<List<PcNoto>> = _elenco.asStateFlow()
    override val corrente: StateFlow<String?> = _corrente.asStateFlow()
    override val pronta: StateFlow<Boolean> = _pronta.asStateFlow()

    /** Da chiamare fuori dal filo principale, una volta all'avvio. */
    fun carica() = synchronized(this) {
        val postazioni = Postazioni.elenca(contesto)
        _elenco.value = postazioni.map { p ->
            Composizione.pc(p, collegamento.chiaveDi(p.indirizzo), leggiStrade(p.indirizzo), leggiPercorsi(p.indirizzo))
        }
        _corrente.value = collegamento.indirizzo.takeIf { it.isNotBlank() }
        _pronta.value = true
    }

    private fun leggiStrade(id: String): Composizione.Salvato? = try {
        prefs.getString("$STRADE:$id", null)?.let { Api.json.decodeFromString(Composizione.Salvato.serializer(), it) }
    } catch (e: Exception) { null }

    private fun leggiPercorsi(id: String): Composizione.Percorsi? = try {
        prefs.getString("percorsi:$id", null)?.let { Api.json.decodeFromString(Composizione.Percorsi.serializer(), it) }
    } catch (e: Exception) { null }

    private fun scriviStrade(pc: PcNoto) {
        val s = Composizione.Salvato(pc.impronta, pc.indirizzi, pc.saProvare, pc.versione)
        prefs.edit().putString("$STRADE:${pc.id}", Api.json.encodeToString(Composizione.Salvato.serializer(), s)).apply()
    }

    private fun cambia(id: String, f: (PcNoto) -> PcNoto) = synchronized(this) {
        val prima = _elenco.value.firstOrNull { it.id == id } ?: return@synchronized
        val dopo = f(prima)
        if (dopo == prima) return@synchronized
        _elenco.value = _elenco.value.map { if (it.id == id) dopo else it }
        scriviStrade(dopo)
    }

    override fun scegli(id: String?) {
        if (id == null) collegamento.dimentica() else { collegamento.indirizzo = id; Postazioni.usata(contesto, id) }
        _corrente.value = id
    }

    override fun impara(id: String, impronta: String?, indirizzi: List<IndirizzoNoto>, versione: String?) =
        cambia(id) { Composizione.impara(it, impronta, indirizzi, versione) }

    override fun riuscita(id: String, indirizzo: String, rete: String?) =
        cambia(id) { Composizione.riuscita(it, indirizzo, rete, System.currentTimeMillis()) }

    override fun saProvare(id: String) = cambia(id) { it.copy(saProvare = true) }

    override fun accoppiato(indirizzo: String, chiave: String, nome: String, impronta: String, indirizzi: List<IndirizzoNoto>): String {
        val pulito = Collegamento.pulisci(indirizzo)
        // Lo stesso PC raggiunto da un altro indirizzo: si aggiorna quello che c'è, niente doppioni.
        val gia = _elenco.value.firstOrNull { impronta.isNotBlank() && it.impronta == impronta } ?: _elenco.value.firstOrNull { it.id == pulito }
        val id = gia?.id ?: pulito
        collegamento.ricordaChiave(id, chiave)
        Postazioni.usata(contesto, id, nome)
        synchronized(this) {
            val base = gia ?: PcNoto(id = id, nome = nome, chiave = chiave)
            val nuovo = Composizione.impara(base.copy(chiave = chiave, nome = nome.ifBlank { base.nome }, saProvare = false), impronta, indirizzi + IndirizzoNoto(pulito, Strade.tipoDi(pulito) ?: "casa"), null)
            _elenco.value = if (gia == null) listOf(nuovo) + _elenco.value else _elenco.value.map { if (it.id == id) nuovo else it }
            scriviStrade(nuovo)
        }
        scegli(id)
        return id
    }

    override fun dimentica(id: String) {
        Postazioni.dimentica(contesto, id)
        prefs.edit().remove("$STRADE:$id").apply()
        synchronized(this) { _elenco.value = _elenco.value.filter { it.id != id } }
        if (_corrente.value == id) _corrente.value = null
    }

    companion object {
        const val STRADE = "strade"
    }
}

/** Le regole pure della rubrica (provate in `RubricaTest`). */
object Composizione {
    @Serializable
    data class Salvato(val impronta: String = "", val indirizzi: List<IndirizzoNoto> = emptyList(), val saProvare: Boolean = false, val versione: String = "")

    /** Quello che teneva `Percorsi` (codice fino alla 0.100.0). */
    @Serializable
    data class Percorsi(val impronta: String = "", val indirizzi: List<String> = emptyList(), val buono: String = "")

    const val MASSIMO_INDIRIZZI = 8

    fun pc(p: Postazioni.Postazione, chiave: String, strade: Salvato?, percorsi: Percorsi?): PcNoto {
        val daPercorsi = percorsi?.indirizzi.orEmpty().mapNotNull { a ->
            Strade.tipoDi(a)?.let { IndirizzoNoto(a, it, ultimaRiuscita = if (a == percorsi?.buono) 1 else 0) }
        }
        val indirizzi = unisci(strade?.indirizzi.orEmpty(), daPercorsi)
        return PcNoto(
            id = p.indirizzo, nome = p.nome, chiave = chiave,
            impronta = strade?.impronta?.ifBlank { null } ?: percorsi?.impronta.orEmpty(),
            indirizzi = indirizzi, saProvare = strade?.saProvare ?: false,
            host = p.host, tenuta = p.tenuta, ultimoUso = p.ultimoUso, versione = strade?.versione.orEmpty()
        )
    }

    /** Senza doppioni (vince la prima lista), al massimo 8, i più recenti prima. */
    fun unisci(primi: List<IndirizzoNoto>, altri: List<IndirizzoNoto>): List<IndirizzoNoto> {
        val visti = LinkedHashMap<String, IndirizzoNoto>()
        for (i in primi + altri) {
            val k = Collegamento.pulisci(i.indirizzo)
            if (k.isBlank()) continue
            val prima = visti[k]
            visti[k] = if (prima == null) i.copy(indirizzo = k) else prima.copy(ultimaRiuscita = maxOf(prima.ultimaRiuscita, i.ultimaRiuscita), rete = prima.rete ?: i.rete)
        }
        return visti.values.sortedByDescending { it.ultimaRiuscita }.take(MASSIMO_INDIRIZZI)
    }

    /** Un'impronta diversa da quella nota non si impara: è un altro PC (lo decide `Strade.verifica`, qui non si sovrascrive). */
    fun impara(pc: PcNoto, impronta: String?, indirizzi: List<IndirizzoNoto>, versione: String?): PcNoto {
        val nuovaImpronta = if (pc.impronta.isBlank() && !impronta.isNullOrBlank()) impronta else pc.impronta
        return pc.copy(impronta = nuovaImpronta, indirizzi = unisci(pc.indirizzi, indirizzi), versione = versione ?: pc.versione)
    }

    fun riuscita(pc: PcNoto, indirizzo: String, rete: String?, ora: Long): PcNoto {
        val k = Collegamento.pulisci(indirizzo)
        val tipo = Strade.tipoDi(k) ?: return pc
        val c = pc.indirizzi.firstOrNull { it.indirizzo == k }
        val nuovo = (c ?: IndirizzoNoto(k, tipo)).copy(ultimaRiuscita = ora, rete = rete ?: c?.rete)
        return pc.copy(indirizzi = unisci(listOf(nuovo), pc.indirizzi.filter { it.indirizzo != k }), ultimoUso = ora)
    }
}
