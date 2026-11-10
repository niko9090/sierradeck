package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/*
 * Le due procedure che Nicholas vuole vedere passo per passo (k-310, «fa
 * vedere la percentuale e le azioni, perché continua a farmi errori»):
 *
 * 1. «Sposta su questo PC»: il PC la mette nel pannello dei progetti
 *    (`sposta` di `/api/drive/pannello`, `VistaSposta` in src/shared/sposta.ts).
 *    Qui la percentuale, i passi (fatto / in corso / da fare / errore),
 *    il messaggio, l'errore detto chiaro e «Riprova».
 * 2. «Libera spazio sul Drive»: la procedura la tiene il PC
 *    (`/api/drive/spazio/procedura` e `/passo`, src/main/libera-spazio-app.ts),
 *    con le stesse regole della finestra e della pagina. Qui la percentuale,
 *    i passi con la conferma, i byte prima e dopo, e «Riprova».
 *
 * Le regole qui sotto sono pure (ProcedureTest); i test in tests/android le
 * confrontano con quelle del PC.
 */

// ─── «Sposta su questo PC» ───

@Serializable data class VistaSpostaDrive(
    val progetto: String = "", val nome: String = "", val daNome: String = "",
    val fase: String = "controlli", val messaggio: String = "", val errore: String? = null,
    val percorso: String = "", val avvisi: List<String> = emptyList(),
    val fileFatti: Double? = null, val fileTotali: Double? = null,
    val byteFatti: Double? = null, val byteTotali: Double? = null,
    val percentuale: Double? = null, val percentualePasso: Double? = null,
    val ultimoContatto: String? = null, val attesa: String? = null,
    val puoRiprovare: Boolean = false, val fallitaIn: String? = null
)

object SpostaRegole {
    /** Gli stessi passi di `PASSI_SPOSTA` del PC, nello stesso ordine (un test li confronta). */
    val PASSI = listOf(
        "controlli" to "Controlli",
        "chiesta" to "Il PC di prima ferma le chat del progetto e carica tutto sul Drive",
        "scarico" to "Scarico file e chat dal Drive",
        "verifica" to "Verifico le impronte, file per file",
        "cambio" to "Il progetto diventa di questo PC",
        "vecchia-copia" to "La copia di prima va nel recupero (30 giorni)"
    )

    const val SPIEGA = "Lo spostamento ha sei passi. Il PC di prima ferma le chat del progetto (mai una che sta lavorando) e carica tutto sul Drive; " +
        "questo PC scarica file e chat e controlla le impronte, file per file. Solo se tutto torna il progetto diventa di questo PC, " +
        "e la copia di prima va nel recupero per 30 giorni: niente si cancella. Se un passo si ferma, il progetto resta dov’era: " +
        "«Riprova» riparte dal punto giusto. Se il PC di prima è spento, la richiesta aspetta nella sua posta e riparte da sola."

    fun finita(v: VistaSpostaDrive): Boolean = v.fase == "fatta" || v.fase == "fallita"

    /** Come `statiPassiSposta` del PC: fatto, in-corso, da-fare o errore per ogni passo. */
    fun stati(v: VistaSpostaDrive): List<String> {
        if (v.fase == "fatta") return PASSI.map { "fatto" }
        fun indice(f: String?): Int = PASSI.indexOfFirst { it.first == (if (f == "attesa-proprietario") "chiesta" else f) }
        if (v.fase == "fallita") {
            val i = indice(v.fallitaIn).coerceAtLeast(0)
            return PASSI.indices.map { k -> if (k < i) "fatto" else if (k == i) "errore" else "da-fare" }
        }
        val i = indice(v.fase)
        return PASSI.indices.map { k -> if (k < i) "fatto" else if (k == i) "in-corso" else "da-fare" }
    }

    /** La percentuale complessiva: dal PC; da un PC che non la manda, 100 a cosa fatta, se no 0. */
    fun percentuale(v: VistaSpostaDrive): Int =
        (v.percentuale ?: if (v.fase == "fatta") 100.0 else 0.0).coerceIn(0.0, 100.0).let { Math.round(it).toInt() }

    fun titolo(v: VistaSpostaDrive): String = when (v.fase) {
        "fatta" -> "«${v.nome}» adesso vive su questo PC"
        "fallita" -> "Spostamento di «${v.nome}» fermo"
        else -> "Sposto «${v.nome}» da ${v.daNome} su questo PC"
    }

    /** Sotto il passo in corso: «120 di 300 file · 40 MB di 1,2 GB · 40%». Vuoto se il passo non si conta. */
    fun dettaglio(v: VistaSpostaDrive): String {
        val pezzi = mutableListOf<String>()
        if (v.fileTotali != null && v.fileTotali > 0) pezzi += "${(v.fileFatti ?: 0.0).toLong()} di ${v.fileTotali.toLong()} file"
        if (v.byteTotali != null && v.byteTotali > 0) pezzi += "${SpazioRegole.byte(v.byteFatti ?: 0.0)} di ${SpazioRegole.byte(v.byteTotali)}"
        v.percentualePasso?.let { pezzi += "${Math.round(it)}%" }
        return pezzi.joinToString(" · ")
    }

    /** Dove l'errore: «Si è fermato al passo 3 di 6: Scarico file e chat dal Drive.» */
    fun doveFermo(v: VistaSpostaDrive): String? {
        if (v.fase != "fallita") return null
        val i = stati(v).indexOf("errore")
        return if (i < 0) null else "Si è fermato al passo ${i + 1} di ${PASSI.size}: ${PASSI[i].second}."
    }
}

// ─── «Libera spazio sul Drive» ───

@Serializable data class QuotaVistaApp(
    val percentuale: Double? = null, val usato: Double = 0.0, val limite: Double? = null,
    val sierraDeck: Double = 0.0, val fuori: Double = 0.0, val nelCestino: Double? = null
)
@Serializable data class RigaPassoApp(
    val id: String = "", val titolo: String = "", val breve: String = "", val spiega: String = "",
    val stima: Double = 0.0, val circa: Boolean = false, val liberaSubito: Boolean = false, val annullabile: Boolean = false,
    val azione: String = "", val tipo: String? = null, val bottone: String = "", val conferma: String = "",
    val stato: String = "da-fare", val motivo: String? = null, val prima: Double? = null, val dopo: Double? = null, val inSospeso: Boolean = false
)
@Serializable data class SospesaApp(val titolo: String = "", val byte: Double = 0.0)
@Serializable data class VistaLiberaApp(
    val misurata: Boolean = false, val percentuale: Double = 0.0, val inCorso: String? = null,
    val righe: List<RigaPassoApp> = emptyList(), val prima: QuotaVistaApp? = null, val adesso: QuotaVistaApp? = null,
    val liberati: Double? = null, val drivePieno: Boolean = false, val grossoFuori: String? = null,
    val inSospeso: List<SospesaApp> = emptyList(), val errore: String? = null
)
@Serializable data class RipresaSospese(val riprese: Int = 0, val ancoraInSospeso: Int = 0)

object LiberaRegole {
    const val SPIEGA = "Prima misura quanto è pieno il Drive del tuo account Google e quanto ne usa SierraDeck. Poi propone dei passi, uno alla volta, " +
        "dal più sicuro: ognuno dice cosa fa, quanto libera (una stima), se si può annullare, e chiede la tua conferma. " +
        "I passi li fa il PC: se il telefono perde la linea, il passo continua e qui si rilegge. " +
        "Le chat tolte dal Drive restano sul PC. Quello che va nel recupero si può annullare per 30 giorni, ma lo spazio si libera solo quando il recupero si svuota. " +
        "A Drive pieno il recupero non libera niente: per questo i file si cancellano subito dal Drive (la copia resta sul PC). " +
        "Una pulizia lasciata a metà si finisce da sola appena il Drive accetta scritture."

    fun parola(stato: String): String = when (stato) {
        "in-corso" -> "in corso…"; "fatto" -> "fatto"; "saltato" -> "saltato"; "errore" -> "errore"; else -> "da fare"
    }

    /** «87,5%» come il PC (una cifra decimale, la virgola). */
    fun percento(p: Double): String {
        val r = Math.round(p * 10) / 10.0
        val t = if (r == Math.floor(r)) r.toLong().toString() else r.toString()
        return t.replace('.', ',') + "%"
    }

    /** «99,8% · 14,9 GB di 15 GB»; senza limite noto lo dice. */
    fun quota(q: QuotaVistaApp): String =
        (q.percentuale?.let { percento(it) } ?: "limite non noto") + " · " + SpazioRegole.byte(q.usato) + (q.limite?.let { " di ${SpazioRegole.byte(it)}" } ?: "")

    fun ripartizione(q: QuotaVistaApp): String =
        "Google (Gmail, Foto, altri file): ${SpazioRegole.byte(q.fuori)} · SierraDeck: ${SpazioRegole.byte(q.sierraDeck)}"

    /** Quanto libera e se si annulla, come la riga del PC. */
    fun stima(r: RigaPassoApp): String =
        (if (r.azione == "conta") "Non libera ancora niente" else "Libera ${if (r.circa) "circa " else ""}${SpazioRegole.byte(r.stima)}${if (r.liberaSubito) "" else " dopo «Svuota il recupero»"}") +
            " · " + (if (r.annullabile) "si annulla" else "non si annulla")

    /** Com'è andata: il motivo, i byte di SierraDeck prima e dopo, le pulizie in sospeso. Null se il passo non è chiuso. */
    fun esito(r: RigaPassoApp): String? {
        if (r.stato != "fatto" && r.stato != "errore" && r.stato != "saltato") return null
        val pezzi = mutableListOf<String>()
        r.motivo?.takeIf { it.isNotBlank() }?.let { pezzi += it }
        if (r.prima != null && r.dopo != null) pezzi += "SierraDeck sul Drive: ${SpazioRegole.byte(r.prima)} → ${SpazioRegole.byte(r.dopo)}."
        if (r.stato == "fatto" && r.inSospeso) pezzi += "Indice e registro si aggiornano da soli appena il Drive accetta scritture."
        return pezzi.joinToString(" ").ifBlank { null }
    }

    /** Il tasto di un passo: da fare il suo, in errore «Riprova», altrimenti nessuno. */
    fun tasto(r: RigaPassoApp): String? = when (r.stato) {
        "da-fare" -> r.bottone + if (r.azione == "conta") "" else "…"
        "errore" -> "Riprova…"
        else -> null
    }

    /** Contare non cancella niente: parte senza conferma. Tutto il resto la chiede. */
    fun serveConferma(r: RigaPassoApp): Boolean = r.azione != "conta"

    /** «Passo 2 di 4: Chat non usate» mentre lavora, se no null. */
    fun inCorso(v: VistaLiberaApp): String? {
        val id = v.inCorso ?: return null
        val i = v.righe.indexOfFirst { it.id == id }
        return if (i < 0) "Un passo è in corso…" else "Passo ${i + 1} di ${v.righe.size}: ${v.righe[i].titolo}"
    }

    /** In fondo: «Dal 99,8% al 92,1% · SierraDeck ha liberato 1,2 GB». Null finché non si è fatto niente. */
    fun riepilogo(v: VistaLiberaApp): String? {
        if (v.righe.none { it.stato == "fatto" }) return null
        val p = v.prima?.percentuale
        val a = v.adesso?.percentuale
        val pezzi = mutableListOf<String>()
        if (p != null && a != null) pezzi += "Dal ${percento(p)} al ${percento(a)}"
        v.liberati?.let { pezzi += "SierraDeck ha liberato ${SpazioRegole.byte(it)}" }
        return if (pezzi.isEmpty()) null else pezzi.joinToString(" · ") + ". Google aggiorna la quota con un po’ di ritardo."
    }

    /** Le pulizie in sospeso, in una riga. */
    fun sospese(v: VistaLiberaApp): String? {
        if (v.inSospeso.isEmpty()) return null
        val n = v.inSospeso.size
        return "${if (n == 1) "1 pulizia" else "$n pulizie"} in sospeso: ${v.inSospeso.joinToString(", ") { "${it.titolo} (${SpazioRegole.byte(it.byte)})" }}. Si finiscono da sole appena il Drive accetta scritture."
    }

    /** Un errore di lettura detto chiaro; un PC senza la procedura «va aggiornato». */
    fun errore(e: Throwable, cosa: String): String = when {
        e is Api.Errore && e.codice == 404 && e.corpo.contains("\"non trovato\"") -> "Questo PC non ha ancora la procedura per l’app: aggiornalo."
        e is Api.Errore -> Nota.spiega(e, cosa)
        else -> "Non sono riuscito a $cosa: ${e.message ?: "il computer non risponde"}"
    }
}

// ─── I pezzi comuni ───

/** Il colore dello stato di un passo. */
private fun coloreDelPasso(stato: String): Color = when (stato) {
    "fatto" -> ColoreStato.verde
    "in-corso" -> ColoreStato.blu
    "errore" -> ColoreStato.rosso
    else -> Banco.testoQuieto
}

private fun segnoDelPasso(stato: String): String = when (stato) {
    "fatto" -> "✓"; "in-corso" -> "●"; "errore" -> "✕"; else -> "○"
}

/** La barra di una procedura con la percentuale accanto. */
@Composable
internal fun BarraProcedura(percentuale: Int, colore: Color = ColoreStato.verde) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
        val f = (percentuale / 100f).coerceIn(0f, 1f)
        Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(Banco.incisione)) {
            Box(Modifier.fillMaxWidth(f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(colore))
        }
        Text("$percentuale%", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(start = 8.dp).width(44.dp))
    }
}

/** Una riga di un passo: segno, numero, titolo, e la parola dello stato a destra. */
@Composable
private fun RigaPassoProcedura(n: Int, titolo: String, stato: String, aiuto: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
        Text(segnoDelPasso(stato), color = coloreDelPasso(stato), fontSize = 14.sp, modifier = Modifier.width(20.dp))
        Text("$n. $titolo", color = if (stato == "da-fare") Banco.testoQuieto else Banco.testo, fontSize = 13.sp,
            fontWeight = if (stato == "in-corso" || stato == "errore") FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f))
        if (aiuto != null) Aiuto(aiuto, di = titolo)
        Text(LiberaRegole.parola(stato), color = coloreDelPasso(stato), fontSize = 12.sp)
    }
}

// ─── «Sposta su questo PC»: la vista ───

/**
 * Lo spostamento in corso o appena finito, in cima a «Progetti». `onRiprova`
 * rifà partire lo spostamento (la stessa azione di «Sposta su questo PC»),
 * `onChiudi` lo toglie dalla vista quando è finito.
 */
@Composable
fun AvanzamentoSpostaVista(v: VistaSpostaDrive, riprovando: Boolean, onRiprova: () -> Unit, onChiudi: () -> Unit) {
    val stati = SpostaRegole.stati(v)
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp).clip(RoundedCornerShape(8.dp)).background(Banco.incisione).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(SpostaRegole.titolo(v), color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Aiuto(SpostaRegole.SPIEGA, di = "Sposta su questo PC")
        }
        BarraProcedura(SpostaRegole.percentuale(v), if (v.fase == "fallita") ColoreStato.rosso else ColoreStato.verde)
        for ((i, p) in SpostaRegole.PASSI.withIndex()) {
            val s = stati[i]
            RigaPassoProcedura(i + 1, p.second, s)
            if (s == "in-corso") SpostaRegole.dettaglio(v).takeIf { it.isNotBlank() }?.let { Text(it, color = ColoreStato.blu, fontSize = 12.sp, modifier = Modifier.padding(start = 20.dp)) }
        }
        if (v.messaggio.isNotBlank() && v.messaggio != v.errore) Text(v.messaggio, color = Banco.testo, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        v.attesa?.takeIf { it.isNotBlank() }?.let { Text("Aspetto: $it", color = Banco.ambra, fontSize = 12.sp) }
        if (v.fase == "fallita") {
            SpostaRegole.doveFermo(v)?.let { Text(it, color = Banco.rosso, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp)) }
            v.errore?.takeIf { it.isNotBlank() }?.let { Text("⚠ $it", color = Banco.rosso, fontSize = 13.sp) }
            Text("Il progetto resta dov’era: niente è perso.", color = Banco.testoQuieto, fontSize = 12.sp)
        }
        for (a in v.avvisi) Text(a, color = Banco.testoQuieto, fontSize = 12.sp)
        if (SpostaRegole.finita(v)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                if (v.fase == "fallita" && v.puoRiprovare) Button(onClick = onRiprova, enabled = !riprovando) { Text(if (riprovando) "Riparto…" else "Riprova") }
                OutlinedButton(onClick = onChiudi, enabled = !riprovando) { Text(if (v.fase == "fatta") "OK" else "Chiudi") }
            }
        }
    }
}

// ─── «Libera spazio sul Drive»: la vista ───

/**
 * La procedura guidata. Si apre da «Spazio sul Drive»; la tiene il PC, qui si
 * legge e, mentre un passo lavora, si rilegge ogni 2 secondi.
 */
@Composable
fun LiberaSpazioVista(api: Api, onChiudi: () -> Unit) {
    val scope = rememberCoroutineScope()
    var v by remember { mutableStateOf<VistaLiberaApp?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var occupato by remember { mutableStateOf(false) }
    var conferma by remember { mutableStateOf<RigaPassoApp?>(null) }
    var esitoRipresa by remember { mutableStateOf<String?>(null) }

    suspend fun leggi(misura: Boolean, ricomincia: Boolean = false) {
        try { v = api.liberaSpazio(misura, ricomincia); errore = null }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { errore = LiberaRegole.errore(e, "misurare il Drive") }
    }
    fun esegui(r: RigaPassoApp) {
        conferma = null
        scope.launch {
            occupato = true
            try { v = api.liberaSpazioPasso(r.id); errore = null }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { errore = LiberaRegole.errore(e, r.bottone.lowercase()) }
            occupato = false
        }
    }
    LaunchedEffect(Unit) { occupato = true; leggi(misura = true, ricomincia = true); occupato = false }
    val lavora = v?.inCorso
    LaunchedEffect(lavora) { while (lavora != null && v?.inCorso != null) { Davanti.pausa(2000); leggi(false) } }

    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
        Text("Libera spazio sul Drive", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
        Aiuto(LiberaRegole.SPIEGA, di = "Libera spazio sul Drive")
    }
    errore?.let {
        Text(it, color = Banco.rosso, fontSize = 13.sp)
        TextButton(onClick = { scope.launch { occupato = true; leggi(true); occupato = false } }, enabled = !occupato) { Text("Riprova") }
    }
    val d = v ?: run { if (errore == null) Text("Misuro il Drive…", color = Banco.testoQuieto, fontSize = 13.sp); TextButton(onClick = onChiudi) { Text("Chiudi") }; return }

    // A che punto è la procedura.
    BarraProcedura(Math.round(d.percentuale).toInt())
    Text(LiberaRegole.inCorso(d) ?: if (d.righe.isEmpty()) "Niente da liberare da qui." else "${d.righe.count { it.stato == "fatto" || it.stato == "saltato" }} di ${d.righe.size} passi chiusi.",
        color = if (d.inCorso != null) ColoreStato.blu else Banco.testoQuieto, fontSize = 12.sp)
    d.errore?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }

    // La misura del Drive.
    (d.prima ?: d.adesso)?.let { q ->
        Text((if (d.righe.any { it.stato == "fatto" }) "Prima: " else "Adesso: ") + LiberaRegole.quota(q), color = Banco.testo, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        q.percentuale?.let { BarraProcedura(Math.round(it).toInt(), if (it >= 95) ColoreStato.rosso else if (it >= 80) ColoreStato.ambra else ColoreStato.verde) }
        Text(LiberaRegole.ripartizione(q), color = Banco.testoQuieto, fontSize = 12.sp)
    }
    if (d.drivePieno) Text("Il Drive è pieno: non accetta scritture.", color = Banco.ambra, fontSize = 12.sp)
    d.grossoFuori?.let { Text(it + (d.adesso?.nelCestino?.takeIf { c -> c > 0 }?.let { c -> " Nel cestino di Google: ${SpazioRegole.byte(c)}." } ?: ""), color = Banco.ambra, fontSize = 12.sp) }

    // I passi.
    for ((i, r) in d.righe.withIndex()) {
        Column(Modifier.padding(top = 8.dp)) {
            RigaPassoProcedura(i + 1, r.titolo, r.stato, aiuto = r.spiega)
            Text(r.breve, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(start = 20.dp))
            Text(LiberaRegole.stima(r), color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(start = 20.dp))
            LiberaRegole.esito(r)?.let { Text(it, color = if (r.stato == "errore") Banco.rosso else Banco.testo, fontSize = 12.sp, modifier = Modifier.padding(start = 20.dp)) }
            LiberaRegole.tasto(r)?.let { t ->
                OutlinedButton(onClick = { if (LiberaRegole.serveConferma(r)) conferma = r else esegui(r) }, enabled = !occupato && d.inCorso == null,
                    modifier = Modifier.padding(start = 20.dp)) { Text(t) }
            }
        }
    }

    // In fondo: la misura di adesso, il riepilogo, le pulizie in sospeso.
    if (d.righe.any { it.stato == "fatto" }) d.adesso?.let { q ->
        Text("Adesso: " + LiberaRegole.quota(q), color = Banco.testo, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
        q.percentuale?.let { BarraProcedura(Math.round(it).toInt(), if (it >= 95) ColoreStato.rosso else if (it >= 80) ColoreStato.ambra else ColoreStato.verde) }
    }
    LiberaRegole.riepilogo(d)?.let { Text(it, color = Banco.verde, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
    LiberaRegole.sospese(d)?.let {
        Text(it, color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
        TextButton(enabled = !occupato, onClick = {
            scope.launch {
                occupato = true
                esitoRipresa = try {
                    val e = api.liberaSpazioRiprendi()
                    if (e.ancoraInSospeso == 0) "Finito tutto." else "${e.riprese} finite, ${e.ancoraInSospeso} ancora in attesa: il Drive non accetta ancora scritture."
                } catch (e: CancellationException) { throw e } catch (e: Exception) { LiberaRegole.errore(e, "riprendere le pulizie") }
                leggi(true)
                occupato = false
            }
        }) { Text("Riprova ora") }
        esitoRipresa?.let { e -> Text(e, color = Banco.testoQuieto, fontSize = 12.sp) }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        OutlinedButton(onClick = { scope.launch { occupato = true; leggi(true); occupato = false } }, enabled = !occupato && d.inCorso == null) { Text("Misura di nuovo") }
        Button(onClick = onChiudi) { Text("Chiudi") }
    }

    conferma?.let { r ->
        AlertDialog(
            onDismissRequest = { conferma = null },
            title = { Text(r.titolo) },
            text = { Text("${r.conferma}\n\n${LiberaRegole.stima(r)}") },
            confirmButton = { TextButton(onClick = { esegui(r) }) { Text("Sì: ${r.bottone.lowercase()}") } },
            dismissButton = { TextButton(onClick = { conferma = null }) { Text("No") } }
        )
    }
}
