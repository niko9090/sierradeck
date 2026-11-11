package it.ferrariconsulenze.sierradeck.rete

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.UnknownHostException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Come sta il telefono con un PC, in una parola: la fonte unica della riga in alto. */
sealed interface Contatto {
    data class Collegato(val strada: TipoStrada, val dal: Long) : Contatto
    data class MiCollego(val dal: Long) : Contatto
    data class NonCollegato(val dal: Long, val motivo: String) : Contatto
    /** Il PC c'è ma non conosce (più) questo telefono: serve un nuovo accoppiamento. */
    data class NonMiConosce(val dal: Long) : Contatto
}

/**
 * Il Centralino (11/11): l'unico cliente del PC. Lo usano le schermate, le
 * notifiche, i lavori in sottofondo.
 *
 * - Il PC è la sua impronta: si prova ogni indirizzo che si conosce di lui
 *   (casa, Tailscale, visti in rete) **in gara**, con tempi diversi per strada,
 *   più il ponte da un altro PC già collegato dopo 2 s; tetto 6 s.
 * - La chiave parte solo verso chi ha dimostrato di essere lui (`Strade.verifica`).
 * - Dopo un fallimento si aspetta 1, 2, 4, 8, 15 s, mai oltre; si riprova subito
 *   se cambia una rete, l'app torna davanti, la scoperta lo vede, o si tocca Riprova.
 * - Una gara per PC alla volta, ma PC diversi in parallelo.
 * - Le letture cadute si riprovano una volta sull'altra strada; le scritture
 *   portano `x-sierradeck-richiesta` e si riprovano solo se il PC sa scartare i
 *   doppioni o se la richiesta non era nemmeno partita.
 * - Le risposte si leggono fuori dal filo principale, col tetto della rotta.
 */
class Centralino(
    private val rubrica: Rubrica,
    private val reti: Reti,
    private val diario: Diario,
    private val ambito: CoroutineScope,
    private val orologio: () -> Long = System::currentTimeMillis,
    private val scoperti: (impronta: String) -> List<String> = { emptyList() }
) {
    data class Strada(val base: String, val tipo: TipoStrada, val tramite: String? = null, val idPonte: String? = null)

    private class PerPc {
        val gara = Mutex()
        @Volatile var strada: Strada? = null
        @Volatile var fallimenti = 0
        @Volatile var prossima = 0L
        @Volatile var versione: String? = null
    }

    private val perPc = ConcurrentHashMap<String, PerPc>()
    private val _contatti = MutableStateFlow<Map<String, Contatto>>(emptyMap())
    val contatti: StateFlow<Map<String, Contatto>> = _contatti.asStateFlow()
    private val _sveglia = MutableSharedFlow<String?>(extraBufferCapacity = 8)
    /** Un PC (o null = tutti) da ricontrollare subito: lo ascolta il polso del deposito. */
    val sveglia: SharedFlow<String?> = _sveglia.asSharedFlow()

    fun contatto(pc: String): Flow<Contatto> = contatti.map { it[pc] ?: Contatto.MiCollego(0) }.distinctUntilChanged()

    private fun di(pc: String) = perPc.getOrPut(pc) { PerPc() }

    init {
        reti.osserva { riprova(null, perdiStrada = true) }
    }

    /** Si riprova subito: rete cambiata, app davanti, Riprova toccato. */
    fun riprova(pc: String?, perdiStrada: Boolean = false) {
        val chi = if (pc == null) perPc.values.toList() else listOf(di(pc))
        for (p in chi) { p.fallimenti = 0; p.prossima = 0; if (perdiStrada) p.strada = null }
        _sveglia.tryEmit(pc)
    }

    /** La scoperta in rete ha visto questa impronta: se è di un PC nostro non collegato, si riprova. */
    fun visto(impronta: String) {
        val pc = rubrica.elenco.value.firstOrNull { it.impronta == impronta } ?: return
        if (_contatti.value[pc.id] !is Contatto.Collegato) riprova(pc.id)
    }

    private fun segna(pc: String, c: Contatto) = _contatti.update { m ->
        val prima = m[pc]
        val nuovo = when {
            // «Non collegato dalle …» conta dalla prima caduta, non dall'ultimo tentativo.
            c is Contatto.NonCollegato && prima is Contatto.NonCollegato -> c.copy(dal = prima.dal)
            c is Contatto.MiCollego && prima is Contatto.NonCollegato -> prima
            c is Contatto.Collegato && prima is Contatto.Collegato && prima.strada == c.strada -> prima
            else -> c
        }
        if (prima == nuovo) m else m + (pc to nuovo)
    }

    /**
     * Una chiamata al PC. `corpo` null = GET, altrimenti POST JSON. Mai
     * un'eccezione salvo la cancellazione: l'esito dice com'è andata.
     */
    suspend fun chiama(pc: String, rotta: String, corpo: String? = null, idRichiesta: String = UUID.randomUUID().toString()): Esito<String> {
        val noto = rubrica.pc(pc) ?: return Esito.Rete("Questo computer non è fra quelli accoppiati.")
        val p = di(pc)
        val prima = p.strada ?: collega(noto) ?: return Esito.Rete(motivoAttuale(pc))
        val esito = esegui(noto, prima, rotta, corpo, idRichiesta)
        if (esito !is Fallito) return esito.esito
        // La strada è caduta: si cerca l'altra, e si riprova se si può.
        p.strada = null
        val siPuo = Strade.via(rotta) in Strade.LETTURE || esito.nonPartita || noto.saProvare
        if (!siPuo) { segna(pc, Contatto.NonCollegato(orologio(), esito.motivo)); return Esito.Rete(esito.motivo) }
        val altra = collega(noto, forza = true) ?: return Esito.Rete(motivoAttuale(pc))
        val di2 = esegui(noto, altra, rotta, corpo, idRichiesta)
        if (di2 is Fallito) { p.strada = null; segna(pc, Contatto.NonCollegato(orologio(), di2.motivo)); return Esito.Rete(di2.motivo) }
        return di2.esito
    }

    private fun motivoAttuale(pc: String): String = when (val c = _contatti.value[pc]) {
        is Contatto.NonCollegato -> c.motivo
        is Contatto.NonMiConosce -> "Il computer non riconosce più questo telefono."
        else -> "Il computer non risponde."
    }

    /** La strada per quel PC, con una gara se serve. Null se nessuna risponde (o se è presto per riprovare). */
    suspend fun collega(pc: PcNoto, forza: Boolean = false): Strada? {
        val p = di(pc.id)
        p.strada?.let { if (!forza) return it }
        return p.gara.withLock {
            p.strada?.let { if (!forza) return@withLock it }
            if (!forza && orologio() < p.prossima) return@withLock null
            if (_contatti.value[pc.id] !is Contatto.Collegato) segna(pc.id, Contatto.MiCollego(orologio()))
            val (strada, motivo) = gara(pc)
            if (strada != null) {
                val eraGiu = _contatti.value[pc.id] !is Contatto.Collegato
                p.strada = strada; p.fallimenti = 0; p.prossima = 0
                segna(pc.id, Contatto.Collegato(strada.tipo, orologio()))
                if (eraGiu) ambito.launch { mandaDiario(pc.id) }
            } else {
                p.fallimenti += 1
                p.prossima = orologio() + Strade.attesaDopo(p.fallimenti)
                if (motivo == NON_MI_CONOSCE) segna(pc.id, Contatto.NonMiConosce(orologio()))
                else segna(pc.id, Contatto.NonCollegato(orologio(), motivo))
            }
            strada
        }
    }

    private suspend fun gara(pc: PcNoto): Pair<Strada?, String> = coroutineScope {
        val adesso = reti.adesso()
        val candidati = Strade.candidati(pc, scoperti(pc.impronta))
        val motivi = mutableListOf<String>()
        val prove = mutableListOf<suspend () -> Pair<Strada?, String>>()
        for (c in candidati) {
            val salto = Strade.saltata(c, adesso)
            if (salto != null) {
                motivi += "${c.tipo.parola}: $salto"
                diario.annota(Tentativo(orologio(), pc.nome, c.tipo.name.lowercase(), "saltato", 0, salto))
            } else prove += { prova(pc, c, adesso) }
        }
        prove += { delay(Strade.PONTE_DOPO_MS); ponte(pc) }
        val canale = Channel<Pair<Strada?, String>>(Channel.UNLIMITED)
        val lavori = prove.map { f -> launch { canale.send(try { f() } catch (e: CancellationException) { throw e } catch (e: Exception) { null to (e.message ?: "errore") }) } }
        var trovata: Strada? = null
        withTimeoutOrNull(Strade.GARA_MS) {
            repeat(lavori.size) {
                val (s, m) = canale.receive()
                if (s != null) { trovata = s; return@withTimeoutOrNull }
                if (m.isNotBlank()) motivi += m
            }
        }
        lavori.forEach { it.cancel() }
        val motivo = when {
            trovata != null -> ""
            NON_MI_CONOSCE in motivi -> NON_MI_CONOSCE
            candidati.isEmpty() -> "Non conosco nessun indirizzo di questo computer."
            !adesso.casa && !adesso.vpn -> "Il telefono non è sul wifi di casa e non c'è una VPN accesa."
            else -> "Il computer non risponde."
        }
        trovata to motivo
    }

    private suspend fun prova(pc: PcNoto, c: Strade.Candidato, adesso: Strade.RetiAdesso): Pair<Strada?, String> = withContext(Dispatchers.IO) {
        val t0 = orologio()
        val sfida = ProvaTelefono.sfidaNuova()
        val chi = ProvaTelefono.chi(ProvaTelefono.segno(pc.chiave))
        val tempo = Strade.tempoDi(c.tipo)
        val cliente = reti.cliente(c.tipo).newBuilder().callTimeout(tempo, TimeUnit.MILLISECONDS).build()
        val strada = c.tipo.name.lowercase()
        try {
            val testo = cliente.newCall(Request.Builder().url("${c.indirizzo.trimEnd('/')}/api/ciao?sfida=$sfida&chi=$chi").get().build()).execute().use { r ->
                if (!r.isSuccessful) throw IOException("risponde ${r.code}")
                leggi(r, "/api/ciao")
            }
            val ciao = Api.json.decodeFromString(Strade.RispostaCiao.serializer(), testo)
            when (val v = Strade.verifica(pc, c.indirizzo, ciao, sfida)) {
                is Strade.Verifica.Buona -> {
                    diario.annota(Tentativo(orologio(), pc.nome, strada, "riuscito", orologio() - t0))
                    if (v.provato && !pc.saProvare) rubrica.saProvare(pc.id)
                    if (v.impronta != null || ciao.versione.isNotBlank()) rubrica.impara(pc.id, v.impronta, emptyList(), ciao.versione.ifBlank { null })
                    rubrica.riuscita(pc.id, c.indirizzo, if (c.tipo == TipoStrada.CASA) adesso.etichettaCasa else "vpn")
                    di(pc.id).versione = ciao.versione.ifBlank { null }
                    Strada(c.indirizzo, c.tipo) to ""
                }
                is Strade.Verifica.Estraneo -> { diario.annota(Tentativo(orologio(), pc.nome, strada, "estraneo", orologio() - t0, v.motivo)); null to "" }
                Strade.Verifica.NonMiConosce -> { diario.annota(Tentativo(orologio(), pc.nome, strada, "non-mi-conosce", orologio() - t0)); null to NON_MI_CONOSCE }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            diario.annota(Tentativo(orologio(), pc.nome, strada, "fallito", orologio() - t0, e.message ?: e.javaClass.simpleName))
            null to ""
        }
    }

    private val pcDelPonte = ConcurrentHashMap<String, Pair<Long, List<String>>>()

    /** Attraverso un altro PC già collegato, che conosca questo nel suo elenco (`/api/pc`). */
    private suspend fun ponte(pc: PcNoto): Pair<Strada?, String> {
        if (pc.impronta.isBlank()) return null to ""
        for (altro in rubrica.elenco.value) {
            if (altro.id == pc.id) continue
            val s = di(altro.id).strada ?: continue
            val idi = idDelPonte(altro, s) ?: continue
            val id = idi.firstOrNull { ProvaTelefono.improntaDaId(it) == pc.impronta } ?: continue
            val t0 = orologio()
            val prova = Strada(s.base, TipoStrada.PONTE, tramite = altro.id, idPonte = id)
            val e = esegui(pc, prova, "/api/stato", null, UUID.randomUUID().toString())
            if (e !is Fallito && e.esito is Esito.Riuscito) {
                diario.annota(Tentativo(orologio(), pc.nome, "ponte", "riuscito", orologio() - t0))
                return prova to ""
            }
            diario.annota(Tentativo(orologio(), pc.nome, "ponte", "fallito", orologio() - t0))
        }
        return null to ""
    }

    private suspend fun idDelPonte(altro: PcNoto, s: Strada): List<String>? {
        pcDelPonte[altro.id]?.let { (quando, idi) -> if (orologio() - quando < 60_000) return idi }
        val e = esegui(altro, s, "/api/pc", null, UUID.randomUUID().toString())
        val testo = ((e as? Eseguito)?.esito as? Esito.Riuscito)?.valore ?: return null
        val idi = try {
            Api.json.parseToJsonElement(testo).jsonObject["pc"]?.jsonArray?.mapNotNull { it.jsonObject["pcId"]?.jsonPrimitive?.content } ?: emptyList()
        } catch (e: Exception) { emptyList() }
        pcDelPonte[altro.id] = orologio() to idi
        return idi
    }

    private sealed interface Esecuzione { val esito: Esito<String> }
    private data class Eseguito(override val esito: Esito<String>) : Esecuzione
    private data class Fallito(val motivo: String, val nonPartita: Boolean) : Esecuzione {
        override val esito: Esito<String> get() = Esito.Rete(motivo)
    }

    private suspend fun esegui(pc: PcNoto, s: Strada, rotta: String, corpo: String?, idRichiesta: String): Esecuzione = withContext(Dispatchers.IO) {
        // La rotta senza `?…` per le tabelle (11/11): `/api/eventi?avvisi=…` non trovava
        // né le letture né il suo tetto, e aspettava 15 s anche chiedendone 50.
        val via = Strade.via(rotta)
        val lenta = via in Strade.LENTE
        val (url, chiave, testoCorpo) = if (s.tipo == TipoStrada.PONTE) {
            if (via !in Ponte.ROTTE) return@withContext Eseguito(Esito.Rifiuto(403, "Questo si fa da quel computer.", Ponte.nonSiPuo(rotta)))
            val tramite = rubrica.pc(s.tramite ?: "") ?: return@withContext Fallito("il PC del ponte non c'è più", true)
            Triple("${s.base.trimEnd('/')}/api/ponte", tramite.chiave, Ponte.corpo(s.idPonte ?: "", rotta, corpo))
        } else Triple("${s.base.trimEnd('/')}$rotta", pc.chiave, corpo)
        val b = Request.Builder().url(url)
        if (testoCorpo != null) {
            b.post(testoCorpo.toRequestBody(JSON))
            b.header("x-sierradeck-richiesta", idRichiesta)
        } else b.get()
        if (chiave.isNotBlank()) b.header("x-sierradeck-chiave", chiave)
        val chiaveEtag = if (via in EtagTenuti.ROTTE && s.tipo != TipoStrada.PONTE) EtagTenuti.chiave(pc.id, rotta, corpo) else null
        chiaveEtag?.let { k -> EtagTenuti.etag(k)?.let { b.header("If-None-Match", it) } }
        val tipoCliente = if (s.tipo == TipoStrada.PONTE) (rubrica.pc(s.tramite ?: "")?.let { di(it.id).strada?.tipo } ?: TipoStrada.TAILSCALE) else s.tipo
        val cliente = reti.cliente(tipoCliente).let { c ->
            val ms = Strade.attesaDi(rotta) ?: if (lenta) Strade.LENTE_MS else Strade.NORMALE_MS
            c.newBuilder().readTimeout(ms, TimeUnit.MILLISECONDS).build()
        }
        try {
            cliente.newCall(b.build()).execute().use { r ->
                if (r.code == 304 && chiaveEtag != null) EtagTenuti.testo(chiaveEtag)?.let { return@withContext Eseguito(Esito.Riuscito(it)) }
                val testo = try { leggi(r, rotta) } catch (e: TroppoGrande) {
                    return@withContext Eseguito(Esito.Rifiuto(413, "Risposta troppo grande per il telefono: $rotta, oltre ${Strade.pesoInParole(e.tetto)}."))
                }
                if (s.tipo == TipoStrada.PONTE || r.code != 502) segna(pc.id, Contatto.Collegato(s.tipo, orologio()))
                Eseguito(when {
                    r.isSuccessful -> { chiaveEtag?.let { EtagTenuti.tieni(it, r.header("ETag"), testo) }; Esito.Riuscito(testo) }
                    Strade.eMancaSulPc(r.code, testo) -> Esito.MancaSulPc(rotta, di(pc.id).versione ?: pc.versione.ifBlank { null })
                    r.code == 401 -> { segna(pc.id, Contatto.NonMiConosce(orologio())); Esito.Rifiuto(401, Strade.motivoDa(401, testo), testo) }
                    else -> Esito.Rifiuto(r.code, Strade.motivoDa(r.code, testo), testo)
                })
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: OutOfMemoryError) {
            Eseguito(Esito.Rifiuto(413, "Risposta troppo grande per il telefono: $rotta."))
        } catch (e: IOException) {
            Fallito(e.message ?: "il computer non risponde", e is ConnectException || e is NoRouteToHostException || e is UnknownHostException)
        }
    }

    private class TroppoGrande(val tetto: Long) : IOException("troppo grande")

    /** Il corpo letto a flusso, col tetto della rotta: oltre, si smette di leggere. */
    private fun leggi(r: Response, rotta: String): String {
        val corpo = r.body ?: return ""
        val tetto = Strade.tettoDi(Strade.via(rotta))
        if (corpo.contentLength() > tetto) throw TroppoGrande(tetto)
        val sorgente = corpo.source()
        sorgente.request(tetto + 1)
        if (sorgente.buffer.size > tetto) throw TroppoGrande(tetto)
        return sorgente.readString(corpo.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8)
    }

    /** Il diario dei tentativi, al PC appena ci si ricollega. Un PC che non ha la rotta lo lascia sul telefono. */
    private suspend fun mandaDiario(pc: String) {
        val righe = diario.daMandare()
        if (righe.isEmpty()) return
        val corpo = buildJsonObject {
            put("righe", JsonArray(righe.map { t ->
                buildJsonObject {
                    put("quando", t.quando); put("pc", t.pc); put("strada", t.strada); put("esito", t.esito); put("ms", t.ms)
                    if (t.motivo.isNotBlank()) put("motivo", t.motivo)
                }
            }))
        }
        val e = chiama(pc, "/api/telefono/diario", Api.json.encodeToString(JsonObject.serializer(), corpo))
        if (e is Esito.Riuscito) diario.mandati(righe.maxOf { it.quando })
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private const val NON_MI_CONOSCE = "non-mi-conosce"
    }
}
