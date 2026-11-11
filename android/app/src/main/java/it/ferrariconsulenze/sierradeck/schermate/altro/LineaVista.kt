package it.ferrariconsulenze.sierradeck.schermate.altro

import it.ferrariconsulenze.sierradeck.schermate.altro.*
import it.ferrariconsulenze.sierradeck.schermate.file.*
import it.ferrariconsulenze.sierradeck.schermate.comune.*
import it.ferrariconsulenze.sierradeck.schermate.radice.*
import it.ferrariconsulenze.sierradeck.nucleo.*

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import it.ferrariconsulenze.sierradeck.rete.Linea
import it.ferrariconsulenze.sierradeck.rete.MappaPc
import it.ferrariconsulenze.sierradeck.rete.Percorsi
import it.ferrariconsulenze.sierradeck.rete.StatoLinea
import it.ferrariconsulenze.sierradeck.rete.VoceCodaLinea
import it.ferrariconsulenze.sierradeck.schermate.comune.RigaConAiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.tocco
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.tema.ColoreStato

fun coloreDa(hex: String): Color = try { Color(android.graphics.Color.parseColor(hex)) } catch (_: Exception) { Color.Gray }

/* ─── i pezzi a schermo ─── */

/** L'orologio della fascia: avanza ogni mezzo secondo mentre serve. */
@Composable
fun adessoVivo(attivo: Boolean): Long {
    var adesso by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(attivo) {
        while (attivo) { adesso = System.currentTimeMillis(); delay(500) }
    }
    return if (attivo) adesso else System.currentTimeMillis()
}

/** Icona della strada, tacche e ritardo, accanto a «SU <PC>». Toccando: la storia. */
@Composable
fun IndicatoreLinea(linea: StatoLinea, nomePc: String, spiega: String? = null) {
    var storia by remember { mutableStateOf(false) }
    val q = Linea.qualita(linea.misure)
    val giu = linea.fase == "ricollego"
    val tacche = if (giu) 0 else q.tacche
    val adesso = adessoVivo(true)
    // «Linea lenta» (app 2.56.0): qualcosa non arriva ma non è caduta — giallo, niente «giù».
    val lenta = !giu && Linea.faseVista(linea, adesso) == "lenta"
    val colore = when { giu -> Banco.rosso; lenta -> Banco.ambra; tacche >= 3 -> Banco.verde; tacche == 2 -> Banco.ambra; else -> Banco.rosso }
    Row(
        Modifier.tocco { storia = true }.background(Banco.fondo.copy(alpha = 0.6f)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        Text(Linea.icona(linea.strada), fontSize = 13.sp)
        Spacer(Modifier.width(4.dp))
        for (i in 0 until 4) {
            Box(Modifier.padding(horizontal = 1.dp).width(3.dp).height((4 + i * 3).dp).background(if (i < tacche) colore else Banco.incisione))
        }
        Spacer(Modifier.width(4.dp))
        Text((if (giu) "non connesso" else if (lenta) "linea lenta" else q.ritardoMs?.let { "$it ms" } ?: "…") +
            (if (giu) "" else Percorsi.comeCollegato(linea.strada)?.let { " · $it" } ?: ""), color = if (giu || lenta) colore else Banco.testoQuieto, fontSize = 12.sp)
    }
    if (storia) {
        AlertDialog(
            onDismissRequest = { storia = false },
            title = { Text("Collegamento con $nomePc") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        "Adesso: " + (if (giu) "non connesso: niente arriva da più di ${Linea.GIU_DOPO_MS / 1000} secondi, riprovo da solo" else if (lenta) "linea lenta: qualcosa tarda o non arriva, ma il collegamento c'è ancora" else "${Percorsi.comeCollegato(linea.strada)?.let { "$it, " } ?: ""}${Linea.stradaBreve(linea.strada)}, qualità ${q.parola}" + (q.ritardoMs?.let { ", $it ms di ritardo tipico" } ?: "") + (if (q.perdite > 0) ", ${Math.round(q.perdite * 100)}% di chiamate perse" else "")) + ".",
                        color = Banco.testo, fontSize = 13.sp
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        spiega ?: "Le cadute, i ritorni e i cambi di strada di questa schermata, con l'ora e il motivo (gli ultimi trenta). Le strade si provano in quest'ordine: rete di casa 🏠, poi Tailscale 🔐; se nessuna risponde, i messaggi aspettano nella posta sul Drive ☁️. Quando ne torna una migliore il PC ci passa da solo, senza chiudere niente. Il ritardo è il giro completo: dal telefono al PC accoppiato, a $nomePc e ritorno. Le tacche: 4 = sotto 150 ms e niente perso; ne tolgono una le chiamate perse e il ritardo che sale (400 ms, 1 s).",
                        color = Banco.testoQuieto, fontSize = 12.sp
                    )
                    Spacer(Modifier.height(8.dp))
                    if (linea.storia.isEmpty()) Text("Ancora niente da raccontare.", color = Banco.testoQuieto, fontSize = 12.sp)
                    for (e in linea.storia.reversed()) {
                        Text(Linea.rigaStoria(e), fontSize = 12.sp, color = when (e.tipo) { "caduta" -> Banco.rosso; "cambio" -> VIOLA_ALTRO_PC; else -> Banco.verde })
                    }
                }
            },
            confirmButton = { TextButton(onClick = { storia = false }) { Text("Chiudi") } }
        )
    }
}

/** La fascia di riconnessione (non blocca niente) e l'annuncio del cambio di strada. */
@Composable
fun FasciaLinea(linea: StatoLinea, nomePc: String, onRiprova: () -> Unit) {
    val adesso = adessoVivo(linea.fase == "ricollego" || linea.cambio != null)
    val cambio = Linea.cambioVisibile(linea, adesso)
    AnimatedVisibility(visible = cambio != null, enter = slideInVertically() + fadeIn(), exit = fadeOut()) {
        Text(
            "⇄ ${cambio ?: ""}", color = VIOLA_ALTRO_PC, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().background(VIOLA_ALTRO_PC.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
    val giu = Linea.testoRiconnessione(linea, nomePc, adesso) ?: return
    Row(
        Modifier.fillMaxWidth().background(Banco.rosso.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(giu, color = Banco.rosso, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            Text(
                (linea.messaggio?.let { "${it.trimEnd('.')}. " } ?: "") + "Lo schermo resta, attenuato: al ritorno si aggiorna da solo. Quello che scrivi intanto resta in coda e parte al ritorno, una volta sola.",
                color = Banco.testo, fontSize = 12.sp, maxLines = 4
            )
        }
        Spacer(Modifier.width(8.dp))
        OutlinedButton(onClick = onRiprova) { Text("Riprova adesso", fontSize = 12.sp) }
    }
}

/** I messaggi in coda: in attesa di invio, o in volo. */
@Composable
fun CodaLinea(coda: List<VoceCodaLinea>, onTogli: (String) -> Unit) {
    if (coda.isEmpty()) return
    Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 10.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (v in coda) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text((if (v.stato == "invio") "↗ sto mandando: «" else "⏳ in attesa di invio: «") + v.testo.take(100) + "»", color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 2)
                if (v.stato == "attesa") TextButton(onClick = { onTogli(v.id) }) { Text("Togli", fontSize = 12.sp) }
            }
        }
    }
}

/** La mappa dei PC nella Salute: questo PC al centro, gli altri intorno, linee colorate. */
@Composable
fun MappaPcVista(m: MappaPc) {
    val centro = m.nodi.firstOrNull() ?: return
    Text("MAPPA DEI PC", color = Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    Box(Modifier.fillMaxWidth().aspectRatio(1.4f)) {
        Canvas(Modifier.matchParentSize()) {
            val sx = size.width / 100f
            val sy = size.height / 100f
            for (l in m.linee) {
                val n = m.nodi.firstOrNull { it.id == l.a } ?: continue
                drawLine(
                    coloreDa(l.colore), Offset(centro.x.toFloat() * sx, centro.y.toFloat() * sy), Offset(n.x.toFloat() * sx, n.y.toFloat() * sy),
                    strokeWidth = 4f, pathEffect = if (l.stato == "ok") null else PathEffect.dashPathEffect(floatArrayOf(14f, 10f))
                )
            }
            for (n in m.nodi) {
                drawCircle(if (n.io) VIOLA_ALTRO_PC else when (n.stato) { "acceso" -> ColoreStato.verde; "incerto" -> ColoreStato.quieto; else -> ColoreStato.rosso }, radius = if (n.io) 22f else 16f, center = Offset(n.x.toFloat() * sx, n.y.toFloat() * sy))
            }
        }
    }
    for (n in m.nodi) {
        val l = m.linee.firstOrNull { it.a == n.id }
        Text(if (n.io) "● ${n.nome} (questo PC, al centro)" else "● ${l?.testo ?: n.nome}", color = if (n.io) VIOLA_ALTRO_PC else l?.let { coloreDa(it.colore) } ?: Banco.testo, fontSize = 12.sp)
        // L'hostname piccolo sotto il nome scelto (2.52.4).
        if (!n.host.isNullOrBlank()) Text("   ${n.host}", color = Banco.testoQuieto, fontSize = 12.sp)
    }
    RigaConAiuto("Come leggere le linee", "Linea piena: si raggiunge direttamente. Tratteggiata ambra: solo via Drive, lento. Tratteggiata rossa: adesso non risponde.")
}
