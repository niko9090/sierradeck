package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable

/** Il segnale di una chat all'autopilota (PC 0.84.0), già in parole e con il colore del PC. */
@Serializable
data class SegnalePunto(
    /** parto | avanti | fatto | bloccata | aspetto */
    val tipo: String = "",
    val parola: String = "",
    /** verde | ambra | rosso | blu | quieto, come `COLORE_SEGNALE` sul PC. */
    val colore: String = "quieto",
    val simbolo: String = ""
)

/** La velocità misurata (PC 0.85.0): dalla richiesta alla versione, con il «?». */
@Serializable
data class VelocitaPunto(
    val testo: String = "",
    val aiuto: String = ""
)

@Serializable
data class ChatNelPunto(
    val id: String = "",
    val chi: String = "",
    val compito: String = "",
    val testo: String = "",
    /** lavoro | aspetta | pausa | ferma */
    val tono: String = "lavoro",
    /** Il colore della riga, già deciso dal PC (`COLORE_ADESSO`). */
    val colore: String = "verde",
    val segnale: SegnalePunto? = null
)

/** Una richiesta di Nicholas in cima al Punto (PC 0.85.0), con lo stato già in parole. */
@Serializable
data class RichiestaNelPunto(
    val id: String = "",
    /** «23/10». */
    val giorno: String = "",
    val titolo: String = "",
    /** da-fare | in-corso | fatta */
    val stato: String = "da-fare",
    /** «da fare», «in corso», «fatta nella versione 0.85.0». */
    val parola: String = "",
    /** ambra | blu | verde, come `COLORE_RICHIESTA` sul PC. */
    val colore: String = "ambra"
)

/**
 * **Il Punto** (PC 0.84.3) in cima alla conversazione dell'autopilota: passo
 * in corso, ogni chat con il suo segnale, cosa è finito, cosa viene dopo, cosa
 * serve da te, i limiti del piano solo come informazione. Le righe le scrive
 * il PC (`puntoDi`): qui si mostrano e basta. Assente con un PC più vecchio.
 */
@Serializable
data class PuntoAutopilota(
    /** In cima (PC 0.85.0): le richieste di Nicholas aperte o fatte da poco. */
    val richieste: List<RichiestaNelPunto> = emptyList(),
    val richiesteTotale: Int = 0,
    val passo: String = "",
    val chat: List<ChatNelPunto> = emptyList(),
    val finite: Int = 0,
    val fatto: List<String> = emptyList(),
    val fattoTotale: Int = 0,
    val dopo: List<String> = emptyList(),
    val dopoTotale: Int = 0,
    val daTe: List<String> = emptyList(),
    val limiti: String? = null,
    val aiuto: String = "",
    /** Assente con un PC più vecchio della 0.85.0, o finché nessuna richiesta è uscita in una versione. */
    val velocita: VelocitaPunto? = null
)

/** Le parole del Punto, uguali alla pagina del telefono: pure, si provano senza schermo. */
object RighePunto {
    /** «e altri 3», o niente. */
    fun altri(totale: Int, mostrati: Int): String = when (val n = totale - mostrati) {
        in Int.MIN_VALUE..0 -> ""
        1 -> " e un altro"
        else -> " e altri $n"
    }

    fun lista(v: List<String>, totale: Int): String? =
        if (v.isEmpty()) null else v.joinToString(" · ") + altri(totale, v.size)

    fun daTe(p: PuntoAutopilota): String =
        if (p.daTe.isEmpty()) "niente, va avanti da solo." else p.daTe.joinToString(" ")

    /** «23/10 · Il titolo — in corso», come sulla pagina del telefono. */
    fun richiesta(r: RichiestaNelPunto): String =
        (if (r.giorno.isBlank()) "" else "${r.giorno} · ") + "${r.titolo} — ${r.parola}"

    fun finite(n: Int): String? = when {
        n <= 0 -> null
        n == 1 -> "1 chat finita"
        else -> "$n chat finite"
    }
}

@Composable
fun PuntoAutopilotaVista(p: PuntoAutopilota) {
    Spacer(Modifier.height(6.dp))
    Column(Modifier.fillMaxWidth().border(1.dp, Banco.incisione, RoundedCornerShape(6.dp)).padding(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Punto", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Aiuto(p.aiuto, di = "Punto")
        }
        if (p.richieste.isNotEmpty()) {
            Text("Le tue richieste:", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
            p.richieste.forEach { r ->
                Text(
                    buildAnnotatedString {
                        append(if (r.giorno.isBlank()) "" else "${r.giorno} · ")
                        append(r.titolo)
                        append(" — ")
                        withStyle(SpanStyle(color = coloreVista(r.colore))) { append(r.parola) }
                    },
                    color = Banco.testo,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            RighePunto.altri(p.richiesteTotale, p.richieste.size).takeIf { it.isNotBlank() }?.let {
                Text(it.trim(), color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
        if (p.passo.isNotBlank()) Text(p.passo, color = Banco.testo, fontSize = 12.sp)
        p.chat.forEach { r ->
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = coloreVista(r.colore))) { append(r.chi) }
                    if (r.compito.isNotBlank()) withStyle(SpanStyle(color = Banco.testoQuieto)) { append(" · ${r.compito}") }
                    append(" — ")
                    if (r.tono == "lavoro") append(r.testo)
                    else withStyle(SpanStyle(color = coloreVista(r.colore))) { append(r.testo) }
                    r.segnale?.let { s ->
                        append("  ")
                        withStyle(SpanStyle(color = coloreVista(s.colore))) { append("${s.simbolo} ${s.parola}".trim()) }
                    }
                },
                color = Banco.testo,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 3.dp)
            )
        }
        RighePunto.finite(p.finite)?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp)) }
        RighePunto.lista(p.fatto, p.fattoTotale)?.let { RigaPunto("Finito", it) }
        RighePunto.lista(p.dopo, p.dopoTotale)?.let { RigaPunto("Dopo", it) }
        RigaPunto("Da te", RighePunto.daTe(p), if (p.daTe.isEmpty()) null else Banco.ambra)
        p.limiti?.takeIf { it.isNotBlank() }?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp)) }
        p.velocita?.takeIf { it.testo.isNotBlank() }?.let { v ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { RigaPunto("Velocità", v.testo) }
                Aiuto(v.aiuto, di = "Velocità")
            }
        }
    }
}

@Composable
private fun RigaPunto(nome: String, testo: String, colore: androidx.compose.ui.graphics.Color? = null) {
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("$nome: ") }
            append(testo)
        },
        color = colore ?: Banco.testo,
        fontSize = 12.sp,
        modifier = Modifier.padding(top = 3.dp)
    )
}
