package it.ferrariconsulenze.sierradeck.schermate.notifiche

import android.Manifest
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.Tessera
import it.ferrariconsulenze.sierradeck.schermate.comune.tocco
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco

/**
 * La schermata «Notifiche» (app 2.100.0): se gli avvisi arrivano, la prova,
 * quali tipi suonano, le ore di silenzio, le ultime notifiche. Le scelte
 * stanno sul PC: le stesse su PC, pagina e app.
 *
 * Ingresso: questa funzione, senza parametri; il ViewModel lo prende da sé.
 * Non scorre da sola: chi la ospita la mette in una colonna che scorre.
 */
@Composable
fun SchermataNotifiche(vm: NotificheViewModel = viewModel()) {
    val s by vm.stato.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.aggiornaLocale(); vm.carica() }
    val contesto = LocalContext.current
    val chiediPermesso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { vm.aggiornaLocale() }
    val accendiNotifiche = {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !s.permesso) chiediPermesso.launch(Manifest.permission.POST_NOTIFICATIONS)
        else apriNotificheAndroid(contesto)
    }
    VistaNotifiche(
        s = s,
        onRimedio = { r ->
            when (r) {
                Rimedio.PERMESSO -> accendiNotifiche()
                Rimedio.BATTERIA -> chiediBatteria(contesto)
                Rimedio.RIACCENDI -> vm.riaccendi()
                Rimedio.NESSUNO -> Unit
            }
        },
        onProva = vm::prova,
        onModo = vm::scegliModo,
        onChatFerma = vm::chatFerma,
        onSilenzio = { acceso ->
            if (!acceso) vm.silenzio(null) else vm.silenzio(s.vista?.impostazioni?.silenzio ?: OreSilenzio("22:00", "07:00"))
        },
        onOraSilenzio = { inizio ->
            val ore = s.vista?.impostazioni?.silenzio ?: OreSilenzio("22:00", "07:00")
            val adesso = if (inizio) ore.da else ore.a
            TimePickerDialog(contesto, { _, h, m ->
                val nuova = RegoleNotifiche.ora(h, m)
                vm.silenzio(if (inizio) ore.copy(da = nuova) else ore.copy(a = nuova))
            }, adesso.take(2).toIntOrNull() ?: 22, adesso.takeLast(2).toIntOrNull() ?: 0, true).show()
        },
        onApriCanali = { apriNotificheAndroid(contesto) },
        onChiudiGuida = vm::chiudiGuida
    )
}

/** Il disegno, solo stato e callback. */
@Composable
fun VistaNotifiche(
    s: StatoNotifiche,
    onRimedio: (Rimedio) -> Unit,
    onProva: () -> Unit,
    onModo: (String, String) -> Unit,
    onChatFerma: (Boolean) -> Unit,
    onSilenzio: (Boolean) -> Unit,
    onOraSilenzio: (Boolean) -> Unit,
    onApriCanali: () -> Unit,
    onChiudiGuida: () -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // ─── Come va ───
        val riga = s.riga
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(riga.testo, color = if (riga.buona) Banco.verde else Banco.ambra, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Aiuto(
                        "Il telefono resta in ascolto del computer anche ad app chiusa: un avviso arriva in un paio di secondi. " +
                            "Per farlo Android vuole una riga fissa nelle notifiche: la puoi nascondere dalle impostazioni del canale «In ascolto», l’ascolto continua.",
                        di = "Avvisi"
                    )
                }
                if (riga.rimedio != Rimedio.NESSUNO && riga.etichetta != null) {
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { onRimedio(riga.rimedio) }) { Text(riga.etichetta, fontSize = 15.sp) }
                }
                s.vista?.riga?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(6.dp))
                    Text("Dal computer: $it", color = Banco.testoQuieto, fontSize = 14.sp)
                }
            }
        }

        // ─── La prima volta: tre passi con la spunta ───
        val passi = s.passi
        if (!passi.finita && !s.guidaChiusa) Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Per avere gli avvisi subito", color = Banco.testo, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Passo(1, "Permetti le notifiche", passi.permesso, "Permetti") { onRimedio(Rimedio.PERMESSO) }
                Passo(2, "Togli il risparmio batteria", passi.batteria, "Togli") { onRimedio(Rimedio.BATTERIA) }
                Passo(3, "Manda una notifica di prova", passi.prova, "Prova", onProva)
                TextButton(onClick = onChiudiGuida) { Text("Ho finito", fontSize = 15.sp) }
            }
        }

        // ─── La prova ───
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = onProva) { Text("Prova notifica", fontSize = 15.sp) }
                    Spacer(Modifier.width(12.dp))
                    val esito = s.provaErrore
                        ?: RegoleNotifiche.tempoProva(s.provaChiesta, s.provaArrivata)
                        ?: if (s.provaChiesta != null) "Aspetto la notifica…" else null
                    esito?.let { Text(it, color = if (s.provaErrore != null) Banco.ambra else Banco.testoQuieto, fontSize = 14.sp, modifier = Modifier.weight(1f)) }
                }
            }
        }

        if (s.pcVecchio) {
            Text("Il computer va aggiornato per scegliere qui quali notifiche suonano.", color = Banco.testoQuieto, fontSize = 14.sp)
        }
        s.errore?.let { Text(it, color = Banco.ambra, fontSize = 14.sp) }

        // ─── Quali suonano ───
        val imp = s.vista?.impostazioni
        if (imp != null) Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Quali suonano", color = Banco.testo, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Aiuto("Le scelte stanno sul computer: sono le stesse sul PC, sulla pagina e qui. «Spenta» = la notifica non nasce proprio.", di = "Quali suonano")
                }
                for (t in RegoleNotifiche.TIPI) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(t.titolo, color = Banco.testo, fontSize = 15.sp, modifier = Modifier.weight(1f))
                            Aiuto(t.spiega, di = t.titolo)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            val scelto = imp.tipi[t.chiave]
                            for ((modo, nome) in RegoleNotifiche.MODI) {
                                FilterChip(selected = scelto == modo, onClick = { onModo(t.chiave, modo) }, label = { Text(nome, fontSize = 14.sp) })
                            }
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Chat ferma da 3 minuti", color = Banco.testo, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    Aiuto("Anche una tua chat senza autopilota che ha finito e aspetta te da tre minuti.", di = "Chat ferma")
                    Switch(checked = imp.chatFerma, onCheckedChange = onChatFerma)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Ore di silenzio", color = Banco.testo, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    Aiuto("In queste ore le notifiche arrivano lo stesso, ma senza suono. L’ora è quella del computer.", di = "Ore di silenzio")
                    Switch(checked = imp.silenzio != null, onCheckedChange = onSilenzio)
                }
                imp.silenzio?.let { o ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("dalle", color = Banco.testoQuieto, fontSize = 14.sp)
                        TextButton(onClick = { onOraSilenzio(true) }) { Text(o.da, fontSize = 15.sp) }
                        Text("alle", color = Banco.testoQuieto, fontSize = 14.sp)
                        TextButton(onClick = { onOraSilenzio(false) }) { Text(o.a, fontSize = 15.sp) }
                    }
                }
                TextButton(onClick = onApriCanali) { Text("Suoni e vibrazione in Android", fontSize = 14.sp) }
            }
        }

        // ─── Le ultime ───
        val ultimi = s.vista?.ultimi.orEmpty()
        if (ultimi.isNotEmpty()) Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Ultime notifiche", color = Banco.testo, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                for (u in ultimi) {
                    Column {
                        Text(u.titolo, color = Banco.testo, fontSize = 15.sp)
                        Text(listOf(u.ora, u.esito).filter { it.isNotBlank() }.joinToString(" · "), color = Banco.testoQuieto, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun Passo(n: Int, testo: String, fatto: Boolean, tasto: String, onClick: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().tocco(enabled = !fatto, onClick = onClick)) {
        Text(if (fatto) "✓" else "$n", color = if (fatto) Banco.verde else Banco.testoQuieto, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp))
        Text(testo, color = Banco.testo, fontSize = 15.sp, modifier = Modifier.weight(1f))
        if (!fatto) TextButton(onClick = onClick) { Text(tasto, fontSize = 15.sp) }
    }
}

private fun apriNotificheAndroid(c: Context) {
    try {
        c.startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, c.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    } catch (_: Exception) { }
}

/**
 * La richiesta diretta di Android («Consenti all'app di restare attiva?»):
 * ammessa per un'app che non può usare FCM; se il telefono non la offre,
 * l'elenco del risparmio batteria.
 */
private fun chiediBatteria(c: Context) {
    try {
        c.startActivity(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${c.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    } catch (_: Exception) {
        try { c.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { }
    }
}
