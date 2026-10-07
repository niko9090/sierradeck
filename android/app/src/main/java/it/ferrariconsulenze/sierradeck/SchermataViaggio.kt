package it.ferrariconsulenze.sierradeck

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * Il cambio di computer a tutto schermo (app 2.52.3): cosa sta succedendo,
 * passo per passo, e dove si ferma. I passi li fa `Viaggi.passi`.
 */
@Composable
fun SchermataViaggio(
    v: Viaggio,
    versionePc: String?,
    ultimoSegno: String?,
    adesso: Long,
    puoiTornare: String?,
    onRiprova: () -> Unit,
    onTornaIndietro: () -> Unit,
    onAnnulla: () -> Unit
) {
    val contesto = LocalContext.current
    val passi = Viaggi.passi(v, adesso)
    val fase = Viaggi.fase(passi)
    val pulsa = rememberInfiniteTransition(label = "viaggio")
    val luce by pulsa.animateFloat(0.3f, 1f, infiniteRepeatable(tween(600), RepeatMode.Reverse), label = "luce")
    Dialog(onDismissRequest = onAnnulla, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false)) {
        Box(Modifier.fillMaxSize().background(Banco.fondo)) {
            if (fase == "collegato") {
                // Il ✓ per un istante, poi la schermata si chiude da sola.
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("✓", color = Banco.verde, fontSize = 96.sp, fontWeight = FontWeight.Bold)
                    Text("Collegato a ${v.nomePc}", color = Banco.testo, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    passi.lastOrNull()?.motivo?.let { Text(it, color = Banco.testoQuieto, fontSize = 13.sp) }
                }
                return@Box
            }
            Column(Modifier.fillMaxSize().padding(16.dp)) {
                Text(
                    if (fase == "fallito") "Non riesco a collegarmi a ${v.nomePc}" else "Mi collego a ${v.nomePc}…",
                    color = if (fase == "fallito") Banco.rosso else Banco.accento, fontSize = 20.sp, fontWeight = FontWeight.Bold
                )
                Text(
                    listOfNotNull(
                        versionePc?.let { "SierraDeck $it" },
                        ultimoSegno?.let { "ultima risposta $it" },
                        "⏱ ${(adesso - v.inizio) / 1000} s"
                    ).joinToString(" · "),
                    color = Banco.testoQuieto, fontSize = 12.sp
                )
                Text(
                    "Ogni riga è un passo: ✓ fatto, ✗ non riuscito (sotto c'è il perché e cosa fare), … in corso, – saltato perché non serve o non si può dal telefono. Provo solo il computer che hai scelto: se non risponde resto qui e non torno da solo su un altro.",
                    color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)
                )
                Spacer(Modifier.height(8.dp))
                HorizontalDivider(color = Banco.incisione)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                    for (p in passi) {
                        Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.Top) {
                            val colore = when (p.stato) { "ok" -> Banco.verde; "fallita" -> Banco.rosso; "provo" -> Banco.accento; else -> Banco.testoQuieto }
                            Text(Viaggi.segno(p.stato), color = colore, fontSize = 16.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.width(22.dp).alpha(if (p.stato == "provo") luce else 1f))
                            Column(Modifier.weight(1f)) {
                                Text("${p.icona} ${p.titolo}", color = if (p.stato == "salta" || p.stato == "attesa") Banco.testoQuieto else Banco.testo, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    listOfNotNull(Viaggi.parolaStato(p.stato), p.indirizzo, p.durataMs?.let { "$it ms" }).joinToString(" · "),
                                    color = Banco.testoQuieto, fontSize = 12.sp
                                )
                                p.motivo?.let { Text(it, color = if (p.stato == "fallita") Banco.rosso else Banco.testoQuieto, fontSize = 12.sp) }
                                p.cosaFare?.let { Text("Cosa fare: $it", color = Banco.testo, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp)) }
                            }
                        }
                        HorizontalDivider(color = Banco.incisione)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onRiprova) { Text("Riprova") }
                    if (puoiTornare != null) OutlinedButton(onClick = onTornaIndietro) { Text("Torna a $puoiTornare", maxLines = 1) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        val cm = contesto.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        cm.setPrimaryClip(ClipData.newPlainText("Collegamento SierraDeck", Viaggi.testo(v, versionePc, ultimoSegno, adesso)))
                        Nota.mostra("Dettagli copiati: incollali dove vuoi.")
                    }) { Text("Copia i dettagli") }
                    TextButton(onClick = onAnnulla) { Text("Annulla") }
                }
                Text(
                    "«Annulla» chiude questa schermata e resta su ${v.nomePc}: l'indicatore in alto continua a riprovare da solo. «Torna al PC di prima» è una scelta come le altre: riparte da capo verso quello.",
                    color = Banco.testoQuieto, fontSize = 11.sp
                )
            }
        }
    }
}
