package it.ferrariconsulenze.sierradeck.schermate.notifiche

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Esito
import it.ferrariconsulenze.sierradeck.rete.motivo
import it.ferrariconsulenze.sierradeck.sottofondo.Ascolto
import it.ferrariconsulenze.sierradeck.sottofondo.Avvisatore
import it.ferrariconsulenze.sierradeck.sottofondo.PortaPc
import it.ferrariconsulenze.sierradeck.sottofondo.Porte
import it.ferrariconsulenze.sierradeck.sottofondo.StatoAscolto
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

/** Tutto quello che la schermata «Notifiche» mostra. */
data class StatoNotifiche(
    val accoppiato: Boolean = true,
    val permesso: Boolean = true,
    val batteriaLibera: Boolean = true,
    val ascolto: StatoAscolto = StatoAscolto(),
    /** Dal PC; null finché non arriva (o se il PC è di prima). */
    val vista: VistaAvvisi? = null,
    /** Il PC non ha ancora le rotte delle notifiche (PC prima della 0.101.0). */
    val pcVecchio: Boolean = false,
    val errore: String? = null,
    val provaChiesta: Long? = null,
    val provaArrivata: Long? = null,
    val provaErrore: String? = null,
    /** «Fatto» toccato sulla guida, anche senza tutte le spunte. */
    val guidaChiusa: Boolean = false,
    /** Una prova è già arrivata una volta (su disco): il passo resta spuntato. */
    val provata: Boolean = false,
    val adesso: Long = System.currentTimeMillis()
) {
    val passi: PassiGuida get() = PassiGuida(permesso, batteriaLibera, provata || RegoleNotifiche.provaArrivata(provaChiesta, provaArrivata))
    val riga: RigaStato get() = RegoleNotifiche.rigaStato(permesso, batteriaLibera, accoppiato, ascolto, adesso)
}

class NotificheViewModel(app: Application) : AndroidViewModel(app) {
    private val c: Context get() = getApplication()
    private val preferenze get() = c.getSharedPreferences("schermata-notifiche", Context.MODE_PRIVATE)

    private val _stato = MutableStateFlow(StatoNotifiche())
    val stato: StateFlow<StatoNotifiche> = _stato.asStateFlow()

    init {
        viewModelScope.launch {
            combine(Ascolto.stato, Avvisatore.provaArrivata) { a, p -> a to p }.collect { (a, p) ->
                _stato.update { s -> s.copy(ascolto = a, provaArrivata = p).conGuida() }
                if (p != null && RegoleNotifiche.provaArrivata(_stato.value.provaChiesta, p)) preferenze.edit().putBoolean(PROVATA, true).apply()
            }
        }
        // «1 min fa» deve scorrere da solo.
        viewModelScope.launch { while (true) { delay(30_000); _stato.update { it.copy(adesso = System.currentTimeMillis()).conGuida() } } }
        aggiornaLocale()
        carica()
    }

    private fun StatoNotifiche.conGuida(): StatoNotifiche =
        copy(guidaChiusa = preferenze.getBoolean(GUIDA_CHIUSA, false), provata = preferenze.getBoolean(PROVATA, false))

    /** Permesso, batteria, accoppiamento: si rileggono quando la schermata torna davanti. */
    fun aggiornaLocale() {
        _stato.update {
            it.copy(
                accoppiato = Collegamento(c).pronto,
                permesso = Ascolto.notificheAccese(c),
                batteriaLibera = Ascolto.batteriaLibera(c),
                adesso = System.currentTimeMillis()
            ).conGuida()
        }
        if (_stato.value.accoppiato && !Ascolto.stato.value.attivo) Ascolto.avvia(c)
    }

    fun carica() {
        viewModelScope.launch {
            val p = Porte.delPc(c) ?: return@launch
            when (val e = p.leggi("/api/avvisi/stato")) {
                is Esito.Riuscito -> {
                    val v = try { Api.json.decodeFromString(VistaAvvisi.serializer(), e.valore) } catch (_: Exception) { null }
                    _stato.update { it.copy(vista = v, pcVecchio = false, errore = if (v == null) "Il computer ha risposto in un modo che non capisco." else null) }
                }
                is Esito.MancaSulPc -> _stato.update { it.copy(pcVecchio = true, errore = null) }
                else -> _stato.update { it.copy(errore = e.motivo()) }
            }
        }
    }

    fun riaccendi() { Ascolto.avvia(c); aggiornaLocale() }

    fun prova() {
        val chiesta = System.currentTimeMillis()
        _stato.update { it.copy(provaChiesta = chiesta, provaErrore = null) }
        viewModelScope.launch {
            val p = Porte.delPc(c) ?: return@launch
            when (val e = p.manda("/api/avvisi/prova", "{}", UUID.randomUUID().toString())) {
                is Esito.Riuscito -> {
                    // Se l'ascolto non gira, un giro breve qui: la prova arriva lo stesso.
                    if (!Ascolto.stato.value.attivo) try { Ascolto.ciclo(c).giro(attesaS = 0) } catch (_: Exception) { }
                    carica()
                }
                is Esito.MancaSulPc -> _stato.update { it.copy(provaErrore = "Il computer va aggiornato per mandare la prova.", provaChiesta = null) }
                else -> _stato.update { it.copy(provaErrore = e.motivo(), provaChiesta = null) }
            }
        }
    }

    fun scegliModo(tipo: String, modo: String) = imposta(buildJsonObject { put("tipi", buildJsonObject { put(tipo, modo) }) }.toString()) { i ->
        i.copy(tipi = i.tipi + (tipo to modo))
    }

    fun chatFerma(si: Boolean) = imposta(buildJsonObject { put("chatFerma", si) }.toString()) { it.copy(chatFerma = si) }

    fun silenzio(ore: OreSilenzio?) = imposta(
        buildJsonObject {
            if (ore == null) put("silenzio", JsonNull) else put("silenzio", buildJsonObject { put("da", ore.da); put("a", ore.a) })
        }.toString()
    ) { it.copy(silenzio = ore) }

    /** Subito a schermo, poi al PC; si tiene quello che il PC risponde (le scelte stanno lì). */
    private fun imposta(corpo: String, subito: (ImpostazioniAvvisi) -> ImpostazioniAvvisi) {
        val prima = _stato.value.vista
        _stato.update { s -> s.copy(vista = (s.vista ?: VistaAvvisi()).let { v -> v.copy(impostazioni = subito(v.impostazioni)) }) }
        viewModelScope.launch {
            val p: PortaPc = Porte.delPc(c) ?: return@launch
            when (val e = p.manda("/api/avvisi/impostazioni", corpo, UUID.randomUUID().toString())) {
                is Esito.Riuscito -> {
                    val i = try { Api.json.decodeFromString(ImpostazioniAvvisi.serializer(), e.valore) } catch (_: Exception) { null }
                    if (i != null) _stato.update { s -> s.copy(vista = (s.vista ?: VistaAvvisi()).copy(impostazioni = i), errore = null) }
                }
                else -> _stato.update { it.copy(vista = prima, errore = e.motivo()) }
            }
        }
    }

    fun chiudiGuida() {
        preferenze.edit().putBoolean(GUIDA_CHIUSA, true).apply()
        _stato.update { it.conGuida() }
    }

    private companion object {
        const val GUIDA_CHIUSA = "guida-chiusa"
        const val PROVATA = "provata"
    }
}
