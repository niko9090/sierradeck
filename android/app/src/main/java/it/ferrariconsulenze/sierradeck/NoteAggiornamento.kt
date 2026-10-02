package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable

// ─── /api/aggiornamento/note (0.39.0) ───
//
// «Installa» dal telefono mostra prima cosa cambia: le stesse note della
// finestra del PC. Il computer le manda gia' scomposte in blocchi e pezzi di
// testo (note-aggiornamento.ts): qui non si interpreta Markdown e non si
// esegue HTML, si mette solo lo stile. Un link si apre solo se porta a
// https://github.com/.

@Serializable
data class PezzoNote(
    val testo: String = "",
    val grassetto: Boolean = false,
    val corsivo: Boolean = false,
    val codice: Boolean = false,
    val link: String? = null
)

@Serializable
data class BloccoNote(
    /** «titolo», «paragrafo», «elenco» o «codice». */
    val tipo: String = "",
    val pezzi: List<PezzoNote> = emptyList(),
    val voci: List<List<PezzoNote>> = emptyList(),
    val testo: String? = null
)

@Serializable
data class NotaResa(val versione: String = "", val blocchi: List<BloccoNote> = emptyList())

@Serializable
data class NoteAggiornamento(
    val versione: String = "",
    val installata: String = "",
    val note: List<NotaResa> = emptyList(),
    val fonte: String = "",
    val dove: String = PAGINA_VERSIONI,
    val avviso: String? = null
)

const val PAGINA_VERSIONI = "https://github.com/niko9090/sierradeck/releases"

/** Solo https://github.com/…: il computer lo controlla, e qui di nuovo. */
fun linkAmmessoApp(url: String?): String? {
    if (url == null) return null
    val u = url.trim()
    return if (u.startsWith("https://github.com/") && !u.contains('@') && u.none { it.isWhitespace() }) u else null
}

/** Come si chiama una versione nella finestra: la nuova in cima, le saltate sotto. */
fun etichettaNota(n: NotaResa, indice: Int, nuova: String): String =
    if (indice == 0 && n.versione == nuova) "La nuova · ${n.versione}" else "Saltata · ${n.versione}"

/** La riga sotto il titolo: che versione c'e' adesso, e quante se ne vedono. */
fun sottotitoloNote(n: NoteAggiornamento): String = when {
    n.installata.isEmpty() -> ""
    n.note.size > 1 -> "Sul computer adesso c’è la ${n.installata}: qui sotto la nuova e le ${n.note.size - 1} che aveva saltato."
    else -> "Sul computer adesso c’è la ${n.installata}."
}

/**
 * Quando le note non arrivano: detto per esteso, e senza impedire di
 * installare. Le note servono a sapere cosa cambia, non sono un permesso.
 */
fun noteMancanti(motivo: String?): NoteAggiornamento = NoteAggiornamento(
    avviso = "Non sono riuscito a leggere le note dal computer${motivo?.let { " ($it)" } ?: ""}. Le trovi scritte per esteso su $PAGINA_VERSIONI. Puoi installare lo stesso."
)

/** Un tratto di testo con il suo stile: la forma che la finestra disegna. */
data class Tratto(val testo: String, val grassetto: Boolean = false, val corsivo: Boolean = false, val codice: Boolean = false, val link: String? = null)

/** Una riga della finestra: un titolo, un paragrafo, o una voce d'elenco. */
data class RigaNote(val tipo: String, val tratti: List<Tratto>)

/**
 * Le note di una versione in righe da disegnare. Funzione pura: e' quello che
 * i test controllano (stili, voci, link filtrati), il disegno vero e' sotto.
 */
fun righeNote(n: NotaResa): List<RigaNote> {
    fun tratti(pezzi: List<PezzoNote>) = pezzi.filter { it.testo.isNotEmpty() }.map {
        Tratto(it.testo, it.grassetto, it.corsivo, it.codice, linkAmmessoApp(it.link))
    }
    return n.blocchi.flatMap { b ->
        when (b.tipo) {
            "titolo" -> listOf(RigaNote("titolo", tratti(b.pezzi)))
            "paragrafo" -> listOf(RigaNote("paragrafo", tratti(b.pezzi)))
            "elenco" -> b.voci.map { RigaNote("voce", tratti(it)) }
            "codice" -> listOf(RigaNote("codice", listOf(Tratto(b.testo ?: "", codice = true))))
            else -> emptyList()
        }
    }.filter { r -> r.tratti.isNotEmpty() }
}

/** Il disegno di una riga: stili e link, mai HTML. */
fun testoRiga(r: RigaNote): AnnotatedString = buildAnnotatedString {
    for (t in r.tratti) {
        val stile = SpanStyle(
            fontWeight = if (t.grassetto || r.tipo == "titolo") FontWeight.Bold else null,
            fontStyle = if (t.corsivo) FontStyle.Italic else null,
            fontFamily = if (t.codice) FontFamily.Monospace else null
        )
        if (t.link != null) {
            withLink(LinkAnnotation.Url(t.link, TextLinkStyles(SpanStyle(color = Banco.accento, textDecoration = TextDecoration.Underline)))) {
                withStyle(stile) { append(t.testo) }
            }
        } else {
            withStyle(stile) { append(t.testo) }
        }
    }
}

/**
 * La finestra di «Installa» sul telefono: cosa cambia con la versione nuova e
 * con quelle saltate, poi «Installa e riavvia» o «Più tardi». `note` nullo
 * vuol dire che sta ancora leggendo.
 */
@Composable
fun DialogoNoteAggiornamento(
    versione: String,
    note: NoteAggiornamento?,
    onInstalla: () -> Unit,
    onPiuTardi: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onPiuTardi,
        title = { Text("Cosa cambia con la ${note?.versione?.ifEmpty { null } ?: versione}") },
        text = {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                if (note == null) {
                    Text("Leggo dal computer cosa cambia…", color = Banco.testoQuieto)
                } else {
                    val sotto = sottotitoloNote(note)
                    if (sotto.isNotEmpty()) Text(sotto, color = Banco.testoQuieto, fontSize = 13.sp)
                    note.avviso?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(testoRiga(RigaNote("paragrafo", listOf(Tratto(it, grassetto = true)))), fontSize = 14.sp)
                    }
                    note.note.forEachIndexed { i, n ->
                        Spacer(Modifier.height(12.dp))
                        Text(etichettaNota(n, i, note.versione).uppercase(), color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        for (r in righeNote(n)) {
                            Spacer(Modifier.height(6.dp))
                            if (r.tipo == "voce") {
                                Row {
                                    Text("•", color = Banco.accento, fontSize = 14.sp)
                                    Spacer(Modifier.width(8.dp))
                                    Text(testoRiga(r), fontSize = 14.sp)
                                }
                            } else {
                                Text(testoRiga(r), fontSize = if (r.tipo == "titolo") 15.sp else 14.sp)
                            }
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        "«Installa e riavvia»: il computer aspetta che le chat finiscano quello che hanno in mano, le avvisa, si chiude, installa e riparte da solo; chat e autopiloti riprendono da dove erano. Per un minuto o due non risponde.\n«Più tardi»: non installa niente adesso; si installa da sola quando chiudi SierraDeck sul computer.",
                        color = Banco.testoQuieto,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
        },
        confirmButton = {
            TextButton(enabled = note != null, onClick = onInstalla) { Text("Installa e riavvia") }
        },
        dismissButton = {
            TextButton(onClick = onPiuTardi) { Text("Più tardi") }
        }
    )
}

/**
 * L'ultima installazione sul computer non e' riuscita (0.39.2): il testo per
 * esteso, uguale a quello del PC e della pagina — cosa e' successo, perche'
 * (certo o probabile, come lo dice il computer), cosa si puo' fare.
 */
fun testoTentativoFallito(f: TentativoFallitoPc): String =
    (listOf(f.titolo, f.motivo).filter { it.isNotBlank() }.joinToString(" ") +
        if (f.strade.isEmpty()) "" else "\nCosa puoi fare:\n" + f.strade.mapIndexed { i, x -> "${i + 1}. $x" }.joinToString("\n")).trim()

/** Le note di «Installa» con davanti l'avviso dell'ultimo tentativo andato male, se c'e'. */
fun conTentativoFallito(n: NoteAggiornamento, f: TentativoFallitoPc?): NoteAggiornamento {
    if (f == null) return n
    val primo = "${f.titolo} ${f.motivo} Se non va di nuovo, scaricala a mano da ${f.pagina}".trim()
    return n.copy(avviso = listOfNotNull(primo, n.avviso).joinToString("\n\n"))
}
