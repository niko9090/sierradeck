package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/*
 * «Libera spazio sul Drive» (PC k-307): la procedura guidata, uguale sul PC,
 * sulla pagina del telefono e qui. La logica è la stessa di
 * src/shared/libera-spazio.ts (passi, stati, percentuali, casi «Drive pieno»
 * e «il grosso è fuori da SierraDeck»); le rotte sono `/api/drive/spazio/*`
 * e `/api/drive/azione`. tests/android/avanzamento-app.test.ts tiene
 * allineati ordine dei passi, azioni e rotte.
 */

@Serializable data class PerTipoQuota(val file: Int = 0, val byte: Double = 0.0)
@Serializable data class SierraDeckQuota(val file: Int = 0, val byte: Double = 0.0, val perTipo: Map<String, PerTipoQuota> = emptyMap())
@Serializable data class QuotaMisurataDrive(
    val limite: Double? = null, val usato: Double = 0.0, val percentuale: Double? = null,
    val usatoNelDrive: Double? = null, val nelCestino: Double? = null,
    val sierraDeck: SierraDeckQuota = SierraDeckQuota(), val misuratoIl: String = ""
)
@Serializable data class RispostaSpazioStato(val stato: StatoSpazioDrive? = null)
@Serializable data class RispostaSpazioQuota(val quota: QuotaMisurataDrive? = null)
@Serializable data class FattoInSospeso(val file: Boolean = false, val indice: Boolean = false, val registro: Boolean = false)
/** Una pulizia annotata in locale e non ancora completa (`InSospesoVista`). */
@Serializable data class InSospesoDrive(val id: String = "", val titolo: String = "", val recupero: String = "salta", val file: Int = 0, val byte: Double = 0.0, val fatto: FattoInSospeso = FattoInSospeso())
@Serializable data class RispostaSpazioInSospeso(val inSospeso: List<InSospesoDrive> = emptyList())
@Serializable data class EsitoRiprendiSpazio(val riprese: Int = 0, val ancoraInSospeso: Int = 0)

enum class StatoPassoSpazio(val parola: String) {
    DA_FARE("da fare"), IN_CORSO("in corso…"), FATTO("fatto"), SALTATO("saltato"), ERRORE("errore")
}

data class PassoSpazio(
    val id: String, val titolo: String, val breve: String, val spiega: String,
    val stima: Double, val circa: Boolean, val liberaSubito: Boolean, val annullabile: Boolean,
    /** conta · togli · pulisci · svuota */
    val azione: String, val tipo: String? = null, val bottone: String, val conferma: String
)

data class EsitoPassoSpazio(
    val stato: StatoPassoSpazio, val motivo: String? = null, val prima: Double? = null, val dopo: Double? = null,
    val inSospeso: Boolean = false, val contate: Boolean = false
)

data class RigaPassoSpazio(val passo: PassoSpazio, val stato: StatoPassoSpazio, val esito: EsitoPassoSpazio? = null)

/** Quello che serve per muoversi: lo stesso sulla pagina (rotte) e qui. */
interface ApiLiberaSpazio {
    suspend fun stato(forza: Boolean): StatoSpazioDrive?
    suspend fun quota(forza: Boolean): QuotaMisurataDrive?
    suspend fun azione(azione: String, tipo: String = "", id: String = "", recupero: String = ""): EsitoAzioneDrive
}

class ApiLiberaSpazioRotte(private val api: Api) : ApiLiberaSpazio {
    override suspend fun stato(forza: Boolean) = api.spazioStato(forza)
    override suspend fun quota(forza: Boolean) = api.spazioQuota(forza)
    override suspend fun azione(azione: String, tipo: String, id: String, recupero: String) = api.azioneSpazio(azione, tipo, id, recupero)
}

data class RipartizioneDrive(val usato: Double, val sierraDeck: Double, val fuori: Double, val percSierraDeck: Double, val percFuori: Double)
data class RiepilogoFinale(val prima: Double?, val dopo: Double?, val liberatiSierraDeck: Double?, val inSospeso: Int) { val riprova get() = inSospeso > 0 }

object LiberaSpazioRegole {
    /** L'ordine in cui si fanno i passi (`righeDa`). */
    val ORDINE = listOf("versioni", "chat-non-usate", "doppie", "doppioni-nome", "recupero")
    /** La scelta a Drive pieno (`RECUPERO_DRIVE_PIENO_DEFAULT`). */
    const val RECUPERO_PREDEFINITO = "salta"
    const val FRASE_GROSSO_FUORI = "Il grosso è fuori da SierraDeck: Gmail, Foto o altri file del tuo Drive. Da qui non si toccano."
    const val SPIEGA = "Prima misura quanto è pieno il Drive del tuo account Google e quanto ne usa SierraDeck. Poi propone dei passi, uno alla volta, dal più sicuro: ognuno dice cosa fa, quanto libera (una stima), se si può annullare, e chiede la tua conferma. Le chat tolte dal Drive restano sul PC. Quello che metti nel recupero resta 30 giorni e si annulla, ma libera spazio solo quando lo svuoti. Alla fine misura di nuovo: Google aggiorna la quota con un po' di ritardo."

    /** 0-100 con un decimale; null se il limite non si sa. */
    fun percentuale(q: QuotaMisurataDrive?): Double? {
        if (q == null) return null
        val p = q.percentuale ?: q.limite?.takeIf { it > 0 }?.let { Math.round(q.usato / it * 1000) / 10.0 } ?: return null
        return p.coerceIn(0.0, 100.0)
    }

    fun drivePieno(q: QuotaMisurataDrive?, segnalato: Boolean = false): Boolean {
        if (segnalato) return true
        val p = percentuale(q)
        return p != null && p >= 99.5
    }

    fun ripartizione(q: QuotaMisurataDrive): RipartizioneDrive {
        val fuori = (q.usato - q.sierraDeck.byte).coerceAtLeast(0.0)
        val base = q.usato.coerceAtLeast(1.0)
        val perc = minOf(100.0, Math.round(q.sierraDeck.byte / base * 1000) / 10.0)
        return RipartizioneDrive(q.usato, q.sierraDeck.byte, fuori, perc, maxOf(0.0, Math.round((100 - perc) * 10) / 10.0))
    }

    /** Il grosso dello spazio è fuori da SierraDeck: le pulizie qui servirebbero a poco. */
    fun grossoFuori(q: QuotaMisurataDrive?): Boolean = q != null && q.usato > 0 && q.sierraDeck.byte * 2 < q.usato

    /** «12,5%» all'italiana. */
    fun perc(p: Double): String = p.toString().removeSuffix(".0").replace('.', ',') + "%"

    /** I passi di adesso, nell'ordine in cui conviene farli: solo quelli che hanno qualcosa da fare. */
    fun passiDa(stato: StatoSpazioDrive?, contate: Boolean, drivePieno: Boolean, recupero: String = RECUPERO_PREDEFINITO): List<PassoSpazio> {
        if (stato == null) return emptyList()
        fun proposta(tipo: String) = stato.proposte.firstOrNull { it.tipo == tipo && it.voci.isNotEmpty() }
        // A Drive pieno con «salta» le pulizie cancellano subito (liberano, non si annullano);
        // altrimenti vanno nel recupero per 30 giorni (si annullano, liberano allo svuotamento).
        val subito = drivePieno && recupero == "salta"
        val passi = mutableListOf<PassoSpazio>()

        val ver = stato.proposte.firstOrNull { it.tipo == "versioni" }
        if (ver != null) {
            passi += PassoSpazio("versioni", "Versioni vecchie", "${ver.versioni} versioni vecchie dei file",
                "Google Drive tiene le versioni vecchie di ogni file e le conta nello spazio. Qui se ne tengono poche per file e le altre si cancellano. Si cancellano per sempre: non c’è recupero. Le versioni si rileggono file per file subito prima di cancellare.",
                ver.byte, true, true, false, "togli", null, "Togli le versioni", "Si cancellano per sempre. Non si può annullare.")
        } else if (!contate) {
            passi += PassoSpazio("versioni", "Versioni vecchie", "Prima si contano. Può durare qualche minuto.",
                "Google Drive tiene le versioni vecchie di ogni file e le conta nello spazio. Per sapere quante sono serve una richiesta per file: per questo si contano solo adesso, a richiesta. Contare non cancella niente.",
                0.0, true, true, false, "conta", null, "Conta le versioni", "Conta soltanto: non cancella niente.")
        }

        val chat = stato.chatNonUsate
        if (chat != null && chat.voci.isNotEmpty()) {
            passi += PassoSpazio("chat-non-usate", "Chat non usate", chat.breve,
                if (subito) "Chat ferme da più di 30 giorni, di cui un PC ha la copia intera. Qui si cancella la copia sul Drive; sul PC resta tutta. Se la chat torna a essere usata, risale da sola. A Drive pieno il recupero di 30 giorni non libera niente: la copia sul Drive si cancella subito e non si annulla."
                else "Chat ferme da più di 30 giorni, di cui un PC ha la copia intera. Qui si toglie la copia sul Drive; sul PC resta tutta. Vanno nel recupero per 30 giorni e «Annulla» le rimette; lo spazio si libera col passo «Svuota il recupero». Se la chat torna a essere usata, risale da sola.",
                chat.byte, false, subito, !subito, "pulisci", "chat-non-usate",
                if (subito) "Togli dal Drive" else "Metti nel recupero",
                if (subito) "Si cancellano dal Drive. Sul PC restano. Non si annulla." else "Vanno nel recupero per 30 giorni. Si annulla.")
        }

        for (tipo in listOf("doppie", "doppioni-nome")) {
            val p = proposta(tipo) ?: continue
            passi += PassoSpazio(tipo, p.titolo, p.breve,
                if (subito) "${p.spiega} A Drive pieno si cancellano subito dal Drive e non si annullano." else p.spiega,
                p.byte, false, subito, !subito, "pulisci", tipo,
                if (subito) "Cancella dal Drive" else "Metti nel recupero",
                if (subito) "Si cancellano dal Drive. Non si annulla." else "Vanno nel recupero per 30 giorni. Si annulla.")
        }

        val scaduto = proposta("recupero-scaduto")
        val totale = (scaduto?.byte ?: 0.0) + (stato.misura?.inRecupero?.byte ?: 0.0)
        if (totale > 0) {
            passi += PassoSpazio("recupero", "Svuota il recupero", "Cancella adesso quello che aspetta nel recupero.",
                "Quello che hai tolto con le pulizie resta 30 giorni nel recupero, e in quei giorni occupa ancora spazio. Qui si cancella adesso, compresi i vecchi file di recupero e le copie di sicurezza scadute. Dopo non si annulla più.",
                totale, false, true, false, "svuota", null, "Svuota adesso", "Si cancella tutto il recupero. Non si annulla.")
        }
        return passi
    }

    /** Le righe da mostrare: i passi di adesso più quelli già toccati, nell'ordine dei passi. */
    fun righeDa(passi: List<PassoSpazio>, memoria: Map<String, Pair<PassoSpazio, EsitoPassoSpazio>>): List<RigaPassoSpazio> {
        val righe = mutableListOf<RigaPassoSpazio>()
        for (id in ORDINE) {
            val attuale = passi.firstOrNull { it.id == id }
            val m = memoria[id]
            if (m != null && m.second.stato != StatoPassoSpazio.DA_FARE) {
                // Un errore si può riprovare: il passo è quello di adesso, se c'è ancora.
                righe += RigaPassoSpazio(if (m.second.stato == StatoPassoSpazio.ERRORE && attuale != null) attuale else m.first, m.second.stato, m.second)
            } else if (attuale != null) righe += RigaPassoSpazio(attuale, StatoPassoSpazio.DA_FARE)
        }
        return righe
    }

    fun riepilogo(iniziale: QuotaMisurataDrive?, finale: QuotaMisurataDrive?, inSospeso: Int) = RiepilogoFinale(
        percentuale(iniziale), percentuale(finale),
        if (iniziale != null && finale != null) maxOf(0.0, iniziale.sierraDeck.byte - finale.sierraDeck.byte) else null,
        inSospeso
    )

    private val NIENTE_DA_FARE = Regex("niente da (pulire|togliere|svuotare)|non c.è niente", RegexOption.IGNORE_CASE)

    /** Esegue un passo e dice com'è andata. Mai un'eccezione: un errore diventa ERRORE con il motivo. */
    suspend fun eseguiPasso(passo: PassoSpazio, api: ApiLiberaSpazio, recupero: String = RECUPERO_PREDEFINITO): EsitoPassoSpazio {
        fun finale(r: EsitoAzioneDrive): EsitoPassoSpazio? =
            if (r.ok) null else if (NIENTE_DA_FARE.containsMatchIn(r.messaggio)) EsitoPassoSpazio(StatoPassoSpazio.SALTATO, r.messaggio) else EsitoPassoSpazio(StatoPassoSpazio.ERRORE, r.messaggio)
        return try {
            if (passo.azione == "conta") {
                val r = api.azione("spazio-versioni-conta")
                if (!r.ok) return EsitoPassoSpazio(StatoPassoSpazio.ERRORE, r.messaggio)
                val st = api.stato(true)
                return if (st?.proposte?.any { it.tipo == "versioni" } == true) EsitoPassoSpazio(StatoPassoSpazio.DA_FARE, r.messaggio, contate = true)
                else EsitoPassoSpazio(StatoPassoSpazio.SALTATO, "Niente da togliere.", contate = true)
            }
            val prima = api.quota(true)?.sierraDeck?.byte
            var inSospeso = false
            val messaggio: String
            when (passo.azione) {
                "togli" -> {
                    val r = api.azione("spazio-versioni-libera")
                    finale(r)?.let { return it }
                    messaggio = r.messaggio
                }
                "pulisci" -> {
                    val r = api.azione("spazio-pulisci", tipo = passo.tipo ?: "", recupero = recupero)
                    finale(r)?.let { return it }
                    inSospeso = r.inSospeso
                    messaggio = r.messaggio
                }
                else -> {
                    // Il recupero scaduto va prima nel recupero (o si cancella, a Drive pieno), poi si svuota tutto.
                    val st = api.stato(true)
                    if (st?.proposte?.any { it.tipo == "recupero-scaduto" && it.voci.isNotEmpty() } == true) {
                        val r = api.azione("spazio-pulisci", tipo = "recupero-scaduto", recupero = recupero)
                        if (!r.ok && !NIENTE_DA_FARE.containsMatchIn(r.messaggio)) return EsitoPassoSpazio(StatoPassoSpazio.ERRORE, r.messaggio)
                        inSospeso = r.inSospeso
                    }
                    val attive = SpazioRegole.inRecupero(api.stato(true) ?: StatoSpazioDrive())
                    val errori = mutableListOf<String>()
                    for (p in attive) {
                        val r = api.azione("spazio-svuota", id = p.id)
                        if (!r.ok) errori += r.messaggio
                    }
                    if (errori.isNotEmpty()) return EsitoPassoSpazio(StatoPassoSpazio.ERRORE, errori.first())
                    messaggio = if (attive.isEmpty()) "Niente da svuotare." else "Svuotate ${attive.size} ${if (attive.size == 1) "pulizia" else "pulizie"}."
                }
            }
            val dopo = api.quota(true)?.sierraDeck?.byte
            EsitoPassoSpazio(StatoPassoSpazio.FATTO, messaggio, prima, dopo, inSospeso)
        } catch (e: Exception) {
            EsitoPassoSpazio(StatoPassoSpazio.ERRORE, e.message ?: e.toString())
        }
    }
}

@Composable
private fun BarraDrive(p: Double?) {
    val v = (p ?: 0.0).toFloat()
    val colore = if (v >= 95) Banco.rosso else if (v >= 80) Banco.ambra else Banco.verde
    LinearProgressIndicator(progress = { v / 100f }, color = colore, trackColor = Banco.incisione, modifier = Modifier.fillMaxWidth().height(10.dp))
}

@Composable
private fun MisuraDrive(q: QuotaMisurataDrive?, titolo: String) {
    if (q == null) { Text("Non riesco a leggere la quota del Drive.", color = Banco.testoQuieto, fontSize = 12.sp); return }
    val p = LiberaSpazioRegole.percentuale(q)
    val r = LiberaSpazioRegole.ripartizione(q)
    Text("$titolo: ${p?.let { LiberaSpazioRegole.perc(it) } ?: "limite non noto"} · ${SpazioRegole.byte(q.usato)}${q.limite?.let { " di ${SpazioRegole.byte(it)}" } ?: ""}", color = Banco.testo, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    BarraDrive(p)
    Text("SierraDeck ${SpazioRegole.byte(r.sierraDeck)} (${LiberaSpazioRegole.perc(r.percSierraDeck)}) · resto dell'account ${SpazioRegole.byte(r.fuori)} (${LiberaSpazioRegole.perc(r.percFuori)})", color = Banco.testoQuieto, fontSize = 12.sp)
}

/** La procedura guidata: la misura in alto, i passi in ordine, la nuova misura in fondo. */
@Composable
fun LiberaSpazioSchermata(api: Api, drivePienoSegnalato: Boolean = false, onChiudi: () -> Unit) {
    val scope = rememberCoroutineScope()
    val rotte = remember(api) { ApiLiberaSpazioRotte(api) }
    var letto by remember { mutableStateOf(false) }
    var occupato by remember { mutableStateOf(false) }
    var iniziale by remember { mutableStateOf<QuotaMisurataDrive?>(null) }
    var quota by remember { mutableStateOf<QuotaMisurataDrive?>(null) }
    var stato by remember { mutableStateOf<StatoSpazioDrive?>(null) }
    var memoria by remember { mutableStateOf<Map<String, Pair<PassoSpazio, EsitoPassoSpazio>>>(emptyMap()) }
    var contate by remember { mutableStateOf(false) }
    var confermaDi by remember { mutableStateOf("") }
    var sospese by remember { mutableStateOf<List<InSospesoDrive>>(emptyList()) }
    var errore by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf("") }

    suspend fun misura(prima: Boolean) {
        try {
            val q = rotte.quota(true)
            val st = rotte.stato(false)
            quota = q; stato = st
            if (prima) iniziale = q
            errore = st?.errore ?: ""
            sospese = try { api.spazioInSospeso() } catch (e: Exception) { emptyList() }
        } catch (e: Exception) { errore = "Non riesco a misurare il Drive: ${e.message ?: "il computer non risponde"}" }
        letto = true
    }
    LaunchedEffect(Unit) { misura(true) }

    val pieno = LiberaSpazioRegole.drivePieno(quota, drivePienoSegnalato)
    val righe = LiberaSpazioRegole.righeDa(LiberaSpazioRegole.passiDa(stato, contate, pieno), memoria)
    val toccato = memoria.values.any { it.second.stato == StatoPassoSpazio.FATTO || it.second.stato == StatoPassoSpazio.ERRORE }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        RigaConAiuto("Libera spazio sul Drive", LiberaSpazioRegole.SPIEGA, di = "Libera spazio sul Drive")
        if (!letto) { Text("Misuro il Drive…", color = Banco.testoQuieto, fontSize = 12.sp); return@Column }
        if (errore.isNotEmpty()) Text(errore, color = Banco.ambra, fontSize = 12.sp)
        MisuraDrive(if (toccato) iniziale ?: quota else quota, if (toccato) "Prima" else "Adesso")
        if (pieno) Text("Il Drive è pieno: non accetta scritture.", color = Banco.ambra, fontSize = 12.sp)
        if (LiberaSpazioRegole.grossoFuori(quota)) {
            Text(LiberaSpazioRegole.FRASE_GROSSO_FUORI + (quota?.nelCestino?.takeIf { it > 0 }?.let { " Nel cestino di Google: ${SpazioRegole.byte(it)}." } ?: ""), color = Banco.ambra, fontSize = 12.sp)
        }
        if (righe.isEmpty() && stato != null) Text("Niente da liberare da qui.", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        for ((i, r) in righe.withIndex()) {
            val p = r.passo
            val colore = when (r.stato) {
                StatoPassoSpazio.FATTO -> Banco.verde
                StatoPassoSpazio.IN_CORSO -> Banco.accento
                StatoPassoSpazio.ERRORE -> Banco.rosso
                else -> Banco.testoQuieto
            }
            Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}. ${p.titolo} · ${p.breve}", color = Banco.testo, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Aiuto(p.spiega, di = p.titolo)
                }
                Text(r.stato.parola, color = colore, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                val libera = if (p.azione == "conta") "Non libera ancora niente" else "Libera ${if (p.circa) "circa " else ""}${SpazioRegole.byte(p.stima)}${if (p.liberaSubito) "" else " dopo «Svuota il recupero»"}"
                Text("$libera · ${if (p.annullabile) "si annulla" else "non si annulla"}", color = Banco.testoQuieto, fontSize = 12.sp)
                val e = r.esito
                if (e != null && r.stato != StatoPassoSpazio.DA_FARE) {
                    val byte = if (e.prima != null && e.dopo != null) " SierraDeck sul Drive: ${SpazioRegole.byte(e.prima)} → ${SpazioRegole.byte(e.dopo)}." else ""
                    val sospeso = if (r.stato == StatoPassoSpazio.FATTO && e.inSospeso) " Indice e registro si aggiornano da soli appena il Drive accetta scritture." else ""
                    Text((e.motivo ?: "") + byte + sospeso, color = if (r.stato == StatoPassoSpazio.ERRORE) Banco.rosso else Banco.testoQuieto, fontSize = 12.sp)
                }
                if (r.stato == StatoPassoSpazio.DA_FARE || r.stato == StatoPassoSpazio.ERRORE) {
                    fun fai() {
                        confermaDi = ""
                        occupato = true
                        memoria = memoria + (p.id to (p to EsitoPassoSpazio(StatoPassoSpazio.IN_CORSO)))
                        scope.launch {
                            val es = LiberaSpazioRegole.eseguiPasso(p, rotte)
                            if (es.contate) contate = true
                            memoria = memoria + (p.id to (p to es))
                            misura(false)
                            occupato = false
                        }
                    }
                    if (p.azione == "conta") OutlinedButton(onClick = { fai() }, enabled = !occupato) { Text(p.bottone) }
                    else if (confermaDi == p.id) {
                        Text(p.conferma, color = Banco.testo, fontSize = 12.sp)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { fai() }, enabled = !occupato) { Text("Sì: ${p.bottone.lowercase()}") }
                            OutlinedButton(onClick = { confermaDi = "" }) { Text("No") }
                        }
                    } else OutlinedButton(onClick = { confermaDi = p.id }, enabled = !occupato) { Text(if (r.stato == StatoPassoSpazio.ERRORE) "Riprova…" else "${p.bottone}…") }
                }
            }
        }
        // In fondo: la nuova misura.
        Column(Modifier.fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            MisuraDrive(quota, if (toccato) "Adesso" else "Misura attuale")
            val fine = LiberaSpazioRegole.riepilogo(iniziale, quota, sospese.size)
            if (toccato && fine.prima != null && fine.dopo != null) {
                Text("Dal ${LiberaSpazioRegole.perc(fine.prima)} al ${LiberaSpazioRegole.perc(fine.dopo)}" + (fine.liberatiSierraDeck?.let { " · SierraDeck ha liberato ${SpazioRegole.byte(it)}" } ?: "") + ". Google aggiorna la quota con un po' di ritardo.", color = Banco.testo, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            if (sospese.isNotEmpty()) {
                Text("${if (sospese.size == 1) "1 pulizia" else "${sospese.size} pulizie"} in sospeso: ${sospese.joinToString(", ") { "${it.titolo} (${SpazioRegole.byte(it.byte)})" }}. Si finiscono da sole appena il Drive accetta scritture.", color = Banco.ambra, fontSize = 12.sp)
                OutlinedButton(enabled = !occupato, onClick = {
                    occupato = true
                    scope.launch {
                        nota = try {
                            val e = api.spazioRiprendi()
                            if (e.ancoraInSospeso == 0) "Finito tutto." else "${e.riprese} finite, ${e.ancoraInSospeso} ancora in attesa: il Drive non accetta ancora scritture."
                        } catch (err: Exception) { "Non riuscito: ${err.message ?: "il computer non risponde"}" }
                        misura(false)
                        occupato = false
                    }
                }) { Text("Riprova ora") }
                if (nota.isNotEmpty()) Text(nota, color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
            OutlinedButton(enabled = !occupato, onClick = { occupato = true; scope.launch { misura(false); occupato = false } }) { Text("Misura di nuovo") }
            Button(enabled = !occupato, onClick = onChiudi) { Text("Chiudi") }
        }
    }
}
