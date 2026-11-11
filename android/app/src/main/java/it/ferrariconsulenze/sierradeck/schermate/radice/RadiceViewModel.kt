package it.ferrariconsulenze.sierradeck.schermate.radice

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import it.ferrariconsulenze.sierradeck.dati.Telefono
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Contatto
import it.ferrariconsulenze.sierradeck.rete.Indirizzi
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import it.ferrariconsulenze.sierradeck.rete.TipoStrada
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** La parola colorata accanto al nome del PC, in alto: l'unico posto che dice come sta il collegamento. */
data class Parola(val testo: String, val tono: Tono) {
    enum class Tono { BENE, ATTESA, MALE }

    companion object {
        fun di(c: Contatto?, ora: (Long) -> String = ::oraBreve): Parola = when (c) {
            null, is Contatto.MiCollego -> Parola("mi collego…", Tono.ATTESA)
            is Contatto.Collegato -> Parola(when (c.strada) { TipoStrada.CASA -> "in WiFi"; TipoStrada.TAILSCALE -> "via VPN"; TipoStrada.PONTE -> "da un altro PC" }, Tono.BENE)
            is Contatto.NonCollegato -> Parola("non collegato dalle ${ora(c.dal)}", Tono.MALE)
            is Contatto.NonMiConosce -> Parola("da riaccoppiare", Tono.MALE)
        }

        fun oraBreve(ms: Long): String = SimpleDateFormat("HH:mm", Locale.ITALY).format(Date(ms))
    }
}

/**
 * La radice: dove si è (`Posto`, salvato), quale PC, come sta. Le schermate
 * non leggono le preferenze né chiamano la rete per sapere queste cose.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RadiceViewModel(private val t: Telefono.Insieme, private val salvato: SavedStateHandle) : ViewModel() {
    private val _posto = MutableStateFlow(Navigazione.riprendi(salvato.get<ArrayList<String>>(CHIAVE_POSTO)))
    val posto: StateFlow<Posto> = _posto.asStateFlow()

    val pronta: StateFlow<Boolean> = t.rubrica.pronta
    val elenco: StateFlow<List<PcNoto>> = t.rubrica.elenco

    val pc: StateFlow<PcNoto?> = combine(t.rubrica.elenco, t.rubrica.corrente) { e, id -> e.firstOrNull { it.id == id } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val contatto: StateFlow<Contatto?> = pc.map { it?.id }.flatMapLatest { id -> if (id == null) flowOf(null) else t.centralino.contatto(id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private fun metti(p: Posto) { _posto.value = p; salvato[CHIAVE_POSTO] = Navigazione.salva(p) }

    fun tocca(v: VoceBarra) = metti(Navigazione.tocca(_posto.value, v))
    fun apri(d: Dettaglio) = metti(Navigazione.apri(_posto.value, d))
    fun verso(r: Richiesta) = metti(Navigazione.verso(_posto.value, r))
    fun verso(s: it.ferrariconsulenze.sierradeck.schermate.vecchie.Scheda) = metti(Navigazione.verso(_posto.value, s))

    /** `false` = non c'è più niente da chiudere: si esce dall'app. */
    fun indietro(): Boolean {
        val dopo = Navigazione.indietro(_posto.value) ?: return false
        metti(dopo)
        return true
    }

    fun riprova() = t.centralino.riprova(pc.value?.id)
    fun scegli(id: String?) = t.rubrica.scegli(id)

    /** L'Api di prima per il PC scelto: passa dal Centralino. */
    fun api(p: PcNoto): Api = Api(p.id, p.chiave)

    /**
     * L'accoppiamento a sei cifre. Restituisce il motivo se non è andato, null se è andato
     * (il PC nuovo diventa quello scelto).
     */
    suspend fun accoppia(indirizzoScritto: String, codice: String, nome: String): String? {
        val indirizzo = Collegamento.pulisci(indirizzoScritto)
        if (indirizzo.isBlank()) return "Serve l’indirizzo del computer."
        if (!Indirizzi.accettabile(indirizzo)) return "Quell’indirizzo è su Internet, non sulla tua rete: non ci parlo in chiaro."
        if (codice.length < 6) return "Il codice sono sei cifre."
        return try {
            val esito = Api(indirizzo, null).accoppia(codice, nome.ifBlank { "telefono" })
            if (esito.chiave.isBlank()) return "Il computer non ha dato una chiave: il codice era giusto?"
            t.rubrica.accoppiato(indirizzo, esito.chiave, Indirizzi.hostDi(indirizzo), "", emptyList())
            null
        } catch (e: Api.Errore) {
            if (e.codice == 403) "Codice sbagliato o scaduto: guardane uno nuovo sul computer." else "Il computer ha risposto ${e.codice}."
        } catch (e: Exception) {
            "$indirizzo non risponde. Il telefono è sulla stessa WiFi del computer?"
        }
    }

    companion object {
        private const val CHIAVE_POSTO = "posto"

        val Fabbrica: ViewModelProvider.Factory = viewModelFactory {
            initializer { RadiceViewModel(Telefono.pronto ?: error("Telefono non avviato"), createSavedStateHandle()) }
        }
    }
}
