package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.border
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface

/** Numeri di token leggibili: 12.4k, 3.1M. */
private fun tokenBrevi(n: Long): String = when {
    n >= 1_000_000 -> "%.1fM".format(n / 1_000_000.0)
    n >= 1_000 -> "%.1fk".format(n / 1_000.0)
    else -> n.toString()
}

/**
 * Le parti di quella che era la scheda «Computer» (app 2.61.0, PC 0.61.0):
 * Nicholas voleva il menu ordinato per importanza, uguale al PC. Le
 * impostazioni vere restano in Impostazioni; gli altri computer e i consumi
 * vanno in Salute; il Drive e le code dei progetti in Progetti; i workspace
 * in Chat.
 */
enum class ParteComputer { IMPOSTAZIONI, SALUTE, PROGETTI, CHAT }

/**
 * «Computer»: ciò che si governa del banco da lontano — i workspace, gli
 * avvisi, l'account, i consumi e i limiti del piano, le code dei progetti, gli
 * altri computer, l'aspetto, il Drive e gli aggiornamenti. Dalla 2.61.0 si
 * mostra a parti (`ParteComputer`), una per voce del menu principale.
 */
@Composable
fun Computer(api: Api, stato: Stato?, parte: ParteComputer = ParteComputer.IMPOSTAZIONI) {
    // Ogni parte è una funzione sua (0.83.0): prima una sola funzione di 690 righe le disegnava
    // tutte e quattro, e ognuna rileggeva anche i dati delle altre (lo stato dell'aggiornamento
    // ogni 2 secondi, gli altri PC ogni 15, i consumi ogni 30) mentre guardavi i workspace.
    when (parte) {
        ParteComputer.IMPOSTAZIONI -> ComputerImpostazioni(api)
        ParteComputer.SALUTE -> ComputerSalute(api)
        ParteComputer.PROGETTI -> ComputerProgetti(api, stato)
        ParteComputer.CHAT -> ComputerWorkspace(api, stato)
    }
}

/** Chat, linguetta «Workspace»: dove sei, dove puoi andare, e il campo per crearne uno. */
@Composable
fun ComputerWorkspace(api: Api, stato: Stato?) {
    val scope = rememberCoroutineScope()
    var nuovoWs by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        // ─── Workspace ───
        // Tutto dentro una tessera sola: prima i workspace erano chip sospesi e
        // sotto, staccato, un campo con una scritta di fianco — tre cose che non
        // sembravano la stessa cosa. Qui si vede subito dove sei e dove puoi
        // andare, e il campo per crearne uno sta nello stesso pannello.
        Sezione("Workspace")
        val ws = stato?.workspace
        // Rinominare ed eliminare (app 2.55.0): prima la funzione c'era ma
        // nessun tasto la chiamava, e un workspace dal telefono non si toglieva.
        var gestisci by remember { mutableStateOf(false) }
        if (gestisci) GestioneWorkspace(api, ws ?: Workspace(), PcCorrente.nome, onChiudi = { gestisci = false })
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                if ((ws?.nomi ?: emptyList()).isEmpty()) {
                    Text("Nessun workspace.", color = Banco.testoQuieto, fontSize = 13.sp)
                } else {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        for (nome in (ws?.nomi ?: emptyList()).filter { it.isNotBlank() }) {
                            VoceWorkspace(
                                nome = nome,
                                attivo = nome == ws?.attivo,
                                onClick = { scope.launch { tenta("cambiare workspace") { api.cambiaWorkspace(nome) } } }
                            )
                        }
                    }
                }
                // «Su altri PC» (PC 0.65.1): a parte, sotto quelli di questo PC.
                val altrove = ws?.altrove ?: emptyList()
                if (altrove.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text("SU ALTRI PC", color = Banco.testoQuieto, fontSize = 11.sp)
                        Aiuto("Workspace che vivono su altri PC e qui non ci sono. La lista di questo PC resta sua: qui si vedono a parte.", di = "SU ALTRI PC")
                    }
                    for (p in altrove) Text("${p.nome}: ${p.workspace.joinToString(", ")}", color = Banco.testo, fontSize = 13.sp)
                }
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = Banco.incisione)
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = nuovoWs,
                        onValueChange = { nuovoWs = it.take(40) },
                        placeholder = { Text("Nome del nuovo", color = Banco.testoQuieto, fontSize = 14.sp) },
                        textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Banco.accento,
                            unfocusedBorderColor = Banco.incisione,
                            focusedContainerColor = Banco.fondo,
                            unfocusedContainerColor = Banco.fondo
                        ),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(10.dp))
                    Button(
                        enabled = nuovoWs.isNotBlank(),
                        shape = MaterialTheme.shapes.small,
                        onClick = {
                            val e = AzioniTelefono.erroreNomeWorkspace(nuovoWs, ws?.nomi ?: emptyList())
                            if (e != null) { Nota.mostra(e); return@Button }
                            val n = nuovoWs.trim(); nuovoWs = ""
                            scope.launch { tentaGestione("creare il workspace «$n»", PcCorrente.nome) { api.creaWorkspace(n) } }
                        }
                    ) { Text("Crea") }
                }
                Spacer(Modifier.height(6.dp))
                TextButton(onClick = { gestisci = true }) { Text("Rinomina o elimina un workspace…") }
            }
        }
            Divisore()

        Spacer(Modifier.height(24.dp))
    }
}

/** Progetti, linguetta «Drive e code»: le code dei progetti e il contenuto del Drive. */
@Composable
fun ComputerProgetti(api: Api, stato: Stato?) {
    val scope = rememberCoroutineScope()
    // La coda condivisa: quale progetto e' aperto, le sue voci, il comando da mettere in fila.
    var codaAperta by remember { mutableStateOf<String?>(null) }
    var codaVoci by remember { mutableStateOf<List<VoceCoda>>(emptyList()) }
    var codaDisponibile by remember { mutableStateOf(true) }
    var codaTesto by remember { mutableStateOf("") }
    var codaGuasto by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(codaAperta) {
        val id = codaAperta ?: return@LaunchedEffect
        while (isActive) {
            try { val c = api.coda(id); codaVoci = c.voci; codaDisponibile = c.disponibile; codaGuasto = null } catch (e: Exception) {
                codaGuasto = "Non riesco a leggere la coda: ${e.message ?: "il computer non risponde"}. Riprovo ogni dieci secondi."
            }
            Davanti.pausa(10_000)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        // ─── Le code dei progetti ───
        // Un comando in fila per un progetto lo consegna il PC che ha il
        // testimone, appena una chat ha finito: da qui si vede, si aggiunge,
        // si toglie. Poco per volta: il telefono non e' il posto per scriverne
        // dieci.
        Sezione("Code dei progetti", aiuto = "Una fila di istruzioni per progetto, sul Drive: le consegna il PC che ha il progetto in mano, una per volta, alla prima chat del progetto che ha finito il turno. Serve a lasciare il lavoro dopo quello di adesso senza stare a guardare. Si rilegge ogni dieci secondi mentre è aperta.")
        Spacer(Modifier.height(8.dp))
        val progetti = stato?.progetti ?: emptyList()
        if (progetti.isEmpty()) Text("Nessun progetto sul Drive: le code esistono solo per i progetti portati sul Drive (sul computer: Account → Progetti).", color = Banco.testoQuieto, fontSize = 13.sp)
        else for (p in progetti) {
            val aperto = codaAperta == p.id
            Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.nome, color = Banco.testo, maxLines = 1)
                            Text(
                                "${p.inCoda} in coda · " + when (p.chi) {
                                    "io" -> "in lavoro qui"
                                    "altro" -> "in mano a ${p.pcNome ?: "un altro PC"}"
                                    else -> "libero: nessun PC lo sta usando"
                                },
                                color = Banco.testoQuieto, fontSize = 12.sp
                            )
                        }
                        OutlinedButton(onClick = { codaAperta = if (aperto) null else p.id; codaVoci = emptyList(); codaTesto = "" }) {
                            Text(if (aperto) "Chiudi" else "Coda")
                        }
                    }
                    if (aperto) {
                        Spacer(Modifier.height(10.dp))
                        HorizontalDivider(color = Banco.incisione)
                        Spacer(Modifier.height(10.dp))
                        if (!codaDisponibile) {
                            Text("La coda sta sul Drive: sul computer serve la cassaforte sbloccata e il Drive collegato.", color = Banco.testoQuieto, fontSize = 12.sp)
                        }
                        codaGuasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
                        val attesa = codaVoci.filter { it.stato == "attesa" }
                        val consegnate = codaVoci.filter { it.stato == "consegnata" }
                        if (attesa.isEmpty()) Text("Nessun comando in attesa.", color = Banco.testoQuieto, fontSize = 13.sp)
                        attesa.forEachIndexed { i, v ->
                            Row(Modifier.padding(vertical = 4.dp), verticalAlignment = androidx.compose.ui.Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    Text("${i + 1}. ${v.testo}", color = Banco.testo, fontSize = 13.sp)
                                    Text("da ${v.daNome}" + (if (v.sessione != null) " · per una chat precisa" else " · alla prima chat libera"), color = Banco.testoQuieto, fontSize = 11.sp)
                                }
                                TextButton(onClick = { scope.launch { tenta("togliere la voce dalla coda") { api.codaTogli(p.id, v.id).voci }?.let { codaVoci = it } } }) { Text("Togli") }
                            }
                        }
                        if (consegnate.isNotEmpty()) {
                            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Text("${consegnate.size} consegnate", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
                                TextButton(onClick = { scope.launch { tenta("pulire la coda") { api.codaPulisci(p.id).voci }?.let { codaVoci = it } } }) { Text("Pulisci") }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = codaTesto,
                            onValueChange = { codaTesto = it.take(4000) },
                            placeholder = { Text("Il comando da mettere in fila", color = Banco.testoQuieto, fontSize = 14.sp) },
                            textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                            minLines = 2,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Banco.accento,
                                unfocusedBorderColor = Banco.incisione,
                                focusedContainerColor = Banco.fondo,
                                unfocusedContainerColor = Banco.fondo
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            enabled = codaTesto.isNotBlank(),
                            shape = MaterialTheme.shapes.small,
                            onClick = {
                                val t = codaTesto.trim(); codaTesto = ""
                                scope.launch {
                                    // Se non parte, il comando torna nel campo: riscriverlo e' il modo peggiore di riaverlo.
                                    val voci = tenta("mettere in coda") { api.codaAggiungi(p.id, t).voci }
                                    if (voci != null) codaVoci = voci else if (codaTesto.isBlank()) codaTesto = t
                                }
                            }
                        ) { Text("Metti in coda") }
                    }
                }
            }
        }
            Divisore()

        // ─── Il Drive ───
        // Il magazzino comune dei PC, da sfogliare e da cui far portare
        // qualcosa al computer: la stessa scheda «Drive» del computer.
        Sezione("Drive")
        SezioneDrive(api)
        // Il pannello delle chat e dei progetti è la linguetta accanto, «Progetti e chat» (app 2.61.0).
        Text("Chat e progetti dei tuoi PC: linguetta «Progetti e chat».", color = Banco.testoQuieto, fontSize = 12.sp)
        Spacer(Modifier.height(10.dp))
            Divisore()

        Spacer(Modifier.height(24.dp))
    }
}

/** Una finestra dei limiti del piano: nome, percentuale, azzeramento, e la barra colorata. */
@Composable
internal fun FinestraRiga(nome: String, f: Finestra?) {
    val p = if (f == null) 0 else f.percento.toInt().coerceIn(0, 100)
    val colore = if (p >= 95) Banco.rosso else if (p >= 80) Banco.ambra else Banco.accento
    val quando = f?.resettaIl?.let { " · si azzera " + java.text.SimpleDateFormat("EEE HH:mm", java.util.Locale.ITALY).format(java.util.Date(it)) } ?: ""
    Spacer(Modifier.height(6.dp))
    Row(Modifier.fillMaxWidth()) {
        Text(nome, color = Banco.testo, fontSize = 13.sp, modifier = Modifier.weight(1f))
        // PC 0.70: la parola del PC con il suo colore, prima della frase.
        f?.vista?.let { Text("${it.parola} · ", color = coloreVista(it.colore), fontSize = 12.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) }
        Text(fraseFinestra(f, quando), color = Banco.testoQuieto, fontSize = 12.sp)
    }
    Spacer(Modifier.height(4.dp))
    Box(Modifier.fillMaxWidth().height(8.dp).background(Banco.chassisAlto, RoundedCornerShape(4.dp))) {
        Box(Modifier.fillMaxWidth(p / 100f).height(8.dp).background(colore, RoundedCornerShape(4.dp)))
    }
}

@Composable
internal fun QuotaRiga(nome: String, q: Quota) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(nome, color = Banco.testo, modifier = Modifier.width(90.dp))
        Text(
            "↑${tokenBrevi(q.ingresso)}  ↓${tokenBrevi(q.uscita)}  ⟳${tokenBrevi(q.cache)}  · ${q.chat} chat",
            color = Banco.testoQuieto,
            fontSize = 13.sp
        )
    }
}

@Composable
internal fun Sezione(titolo: String, aiuto: String? = null) {
    TitoloConAiuto(titolo, aiuto)
    Spacer(Modifier.height(8.dp))
}

@Composable
internal fun Divisore() {
    Spacer(Modifier.height(16.dp))
    HorizontalDivider(color = Banco.incisione)
    Spacer(Modifier.height(16.dp))
}

/**
 * Un workspace nell'elenco.
 *
 * Quello in cui sei ha il pieno dell'accento, gli altri il contorno inciso: si
 * capisce dove sei senza leggere, che e' il punto di guardarli tutti insieme.
 * Il chip di Material non lo diceva abbastanza — due grigi appena diversi.
 */
@Composable
private fun VoceWorkspace(nome: String, attivo: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        color = if (attivo) Banco.accento else Banco.fondo,
        contentColor = if (attivo) Banco.fondo else Banco.testo,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, if (attivo) Banco.accento else Banco.incisione)
    ) {
        Text(
            nome,
            fontSize = 13.sp,
            fontWeight = if (attivo) FontWeight.Bold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}

/**
 * Quando sono stati letti i limiti: «alle 14:20» se è oggi, «ieri alle 14:20»,
 * altrimenti con la data. Prima era sempre «alle HH:mm», e un numero di tre
 * giorni fa sembrava di adesso.
 */
/**
 * La frase di una finestra del piano: quella del computer quando c'e' (dalla
 * 0.37, con «letto N minuti fa», «azzerata, in attesa…», «lettura vecchia»),
 * altrimenti come prima.
 */
fun fraseFinestra(f: Finestra?, quando: String = ""): String = when {
    f == null -> "non ancora letta"
    !f.etichetta.isNullOrBlank() -> f.etichetta
    else -> "${f.percento.toInt().coerceIn(0, 100)}% usato$quando"
}

/** «Portfolio · Opus 5: 42% · 84k di 200k token», con la frase del computer. */
fun rigaContesto(c: ChatConsumo): String {
    val nome = c.titolo?.ifBlank { null } ?: c.sessione.take(8)
    val modello = c.modello?.let { " · $it" } ?: ""
    val parola = c.vista?.let { "${it.parola} · " } ?: ""
    return "$nome$modello: $parola${c.contestoEtichetta ?: c.contesto?.let { "${it.percento}%" } ?: "contesto non ancora letto"}"
}

fun quandoLetti(letti: Long, adesso: Long, zona: java.util.TimeZone = java.util.TimeZone.getDefault()): String {
    val cal = { t: Long -> java.util.Calendar.getInstance(zona).apply { timeInMillis = t } }
    val l = cal(letti); val a = cal(adesso)
    val ora = java.text.SimpleDateFormat("HH:mm", java.util.Locale.ITALY).apply { timeZone = zona }.format(java.util.Date(letti))
    val stessoGiorno = { x: java.util.Calendar, y: java.util.Calendar -> x.get(java.util.Calendar.YEAR) == y.get(java.util.Calendar.YEAR) && x.get(java.util.Calendar.DAY_OF_YEAR) == y.get(java.util.Calendar.DAY_OF_YEAR) }
    if (stessoGiorno(l, a)) return "alle $ora"
    val ieri = cal(adesso).apply { add(java.util.Calendar.DAY_OF_YEAR, -1) }
    if (stessoGiorno(l, ieri)) return "ieri alle $ora"
    val data = java.text.SimpleDateFormat("d MMM", java.util.Locale.ITALY).apply { timeZone = zona }.format(java.util.Date(letti))
    return "il $data alle $ora (da allora nessuna chat aperta dal computer ha risposto)"
}

/** La testata di una sezione delle impostazioni: il titolo e cosa c'è dentro (app 2.56.0). */
@Composable
internal fun GruppoImpostazioni(s: StrutturaImp, id: String) {
    val sez = s.sezioni.firstOrNull { it.id == id } ?: return
    Spacer(Modifier.height(10.dp))
    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
        Text(sez.titolo.uppercase(), color = Banco.accento, fontWeight = FontWeight.Bold, fontSize = 13.sp, letterSpacing = 1.2.sp)
        Aiuto(sez.spiega, di = sez.titolo)
    }
}

/** «Copia i dettagli» (app 2.56.0): un testo da incollare quando si chiede aiuto. Senza chiavi né indirizzi. */
object Dettagli {
    fun testo(app: String, codice: Int, nomePc: String?, versionePc: String?, l: StatoLinea, adesso: Long): String {
        val q = Linea.qualita(l.misure)
        val fase = Linea.parolaFase(Linea.faseVista(l, adesso))
        val righe = mutableListOf(
            "SierraDeck — dettagli per l’aiuto",
            "App: $app (codice $codice)",
            "Computer: ${nomePc ?: "non ancora letto"}, SierraDeck ${versionePc ?: "versione non ancora letta"}",
            "Collegamento: $fase, strada ${Linea.stradaBreve(l.strada)}, qualità ${q.parola}" + (q.ritardoMs?.let { ", $it ms" } ?: "")
        )
        val storia = l.storia.takeLast(8)
        if (storia.isNotEmpty()) { righe += "Ultimi eventi del collegamento:"; for (e in storia) righe += "  " + Linea.rigaStoria(e) }
        return righe.joinToString("\n")
    }
}
