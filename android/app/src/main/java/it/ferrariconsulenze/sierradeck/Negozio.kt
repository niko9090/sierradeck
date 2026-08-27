package it.ferrariconsulenze.sierradeck

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
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

/**
 * «Negozio»: cosa Claude Code ha in dotazione, e cosa è acceso.
 *
 * Sul computer è un pannello a schede da cui si installa, si cerca, si aggiungono
 * fonti. Qui è meno, ed è una scelta: da un telefono si **guarda** cosa c'è e si
 * accende o si spegne qualcosa — il gesto che ha senso da fermi, con una mano.
 * Installare passa dal CLI di Claude Code e ci mette qualche secondo, ma resta
 * reversibile. Disinstallare no: quello si fa al computer, dove vedi bene cosa
 * stai togliendo.
 */
@Composable
fun Negozio(api: Api) {
    var dati by remember { mutableStateOf<DatiNegozio?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    var famiglia by remember { mutableStateOf(Famiglia.PLUGIN) }
    var inCorso by remember { mutableStateOf<String?>(null) }
    var nota by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun ricarica() {
        try {
            dati = api.negozio()
            guasto = null
        } catch (e: Exception) {
            guasto = "Questo computer non sa ancora aprire il negozio da qui: aggiornalo."
        }
    }

    LaunchedEffect(Unit) { ricarica() }

    Column(Modifier.fillMaxSize()) {
        // ─── fascia ───
        Column {
            Row(
                Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Serigrafia("Negozio")
                    Spacer(Modifier.height(3.dp))
                    Text(
                        "Cosa Claude Code ha in dotazione, e cosa è acceso.",
                        color = Banco.testoQuieto,
                        fontSize = 12.sp
                    )
                }
            }
            HorizontalDivider(color = Banco.incisione)
        }

        // ─── le quattro famiglie ───
        Row(
            Modifier.fillMaxWidth().background(Banco.fondo).padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            for (fam in Famiglia.entries) {
                val quanti = fam.quanti(dati)
                Voce(
                    testo = "${fam.etichetta}${if (quanti > 0) "  $quanti" else ""}",
                    attiva = fam == famiglia,
                    onClick = { famiglia = fam }
                )
            }
        }
        HorizontalDivider(color = Banco.incisione)

        nota?.let {
            Text(
                it,
                color = Banco.ambra,
                fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)
            )
        }

        when {
            guasto != null -> Vuoto(guasto!!)
            dati == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Banco.accento)
            }
            else -> {
                val voci = famiglia.voci(dati!!)
                if (voci.isEmpty()) {
                    Vuoto("Niente in «${famiglia.etichetta.lowercase()}».")
                } else {
                    LazyColumn(Modifier.fillMaxSize()) {
                        items(voci, key = { it.chiave }) { v ->
                            RigaNegozio(
                                voce = v,
                                inCorso = inCorso == v.chiave,
                                onCommuta = { acceso ->
                                    inCorso = v.chiave
                                    scope.launch {
                                        val esito = try {
                                            api.commutaNegozio(famiglia.cosa, v.nome, acceso)
                                        } catch (e: Exception) {
                                            EsitoNegozio(ok = false, messaggio = e.message)
                                        }
                                        nota = if (esito.ok) null else esito.messaggio ?: "Non ci sono riuscito."
                                        ricarica()
                                        inCorso = null
                                    }
                                },
                                onInstalla = {
                                    inCorso = v.chiave
                                    scope.launch {
                                        nota = "Installo ${v.nome}… ci mette qualche secondo."
                                        val esito = try {
                                            api.installaPlugin(v.nome)
                                        } catch (e: Exception) {
                                            EsitoNegozio(ok = false, messaggio = e.message)
                                        }
                                        nota = if (esito.ok) null else esito.messaggio ?: "Non sono riuscito a installarlo."
                                        ricarica()
                                        inCorso = null
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Le quattro cose che si possono avere: come si chiamano e dove stanno. */
private enum class Famiglia(val etichetta: String, val cosa: String) {
    PLUGIN("Plugin", "plugin"),
    SKILL("Skill", "skill"),
    AGENTI("Agenti", "agente"),
    MCP("MCP", "mcp");

    fun quanti(d: DatiNegozio?): Int = when (this) {
        PLUGIN -> d?.plugin?.count { it.installato } ?: 0
        SKILL -> d?.skill?.size ?: 0
        AGENTI -> d?.agenti?.size ?: 0
        MCP -> d?.mcp?.size ?: 0
    }

    fun voci(d: DatiNegozio): List<VoceNegozio> = when (this) {
        // Prima gli installati: sono i tuoi, il resto è catalogo.
        PLUGIN -> d.plugin.sortedByDescending { it.installato }.map {
            VoceNegozio(
                chiave = "p:${it.id}",
                nome = it.id,
                titolo = it.nome,
                sotto = it.descrizione.ifBlank { it.marketplace },
                acceso = it.abilitato,
                installabile = !it.installato,
                commutabile = it.installato
            )
        }
        SKILL -> d.skill.map {
            VoceNegozio(
                chiave = "s:${it.nome}",
                nome = it.nome,
                titolo = it.nome,
                sotto = it.descrizione.ifBlank { it.origine },
                acceso = it.abilitata,
                installabile = false,
                commutabile = true
            )
        }
        // Gli agenti non si accendono: ci sono, e Claude Code li chiama quando
        // servono. Mostrarli con un interruttore finto sarebbe una bugia.
        AGENTI -> d.agenti.map {
            VoceNegozio(
                chiave = "a:${it.nome}",
                nome = it.nome,
                titolo = it.nome,
                sotto = it.descrizione.ifBlank { it.origine },
                acceso = true,
                installabile = false,
                commutabile = false
            )
        }
        MCP -> d.mcp.map {
            VoceNegozio(
                chiave = "m:${it.nome}",
                nome = it.nome,
                titolo = it.nome,
                sotto = it.come,
                acceso = it.abilitato,
                installabile = false,
                commutabile = true
            )
        }
    }
}

private data class VoceNegozio(
    val chiave: String,
    val nome: String,
    val titolo: String,
    val sotto: String,
    val acceso: Boolean,
    val installabile: Boolean,
    val commutabile: Boolean
)

@Composable
private fun RigaNegozio(
    voce: VoceNegozio,
    inCorso: Boolean,
    onCommuta: (Boolean) -> Unit,
    onInstalla: () -> Unit
) {
    Tessera(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(voce.titolo, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1)
                if (voce.sotto.isNotBlank()) {
                    Spacer(Modifier.height(3.dp))
                    Text(voce.sotto, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
                }
            }
            Spacer(Modifier.width(10.dp))
            when {
                inCorso -> CircularProgressIndicator(
                    color = Banco.accento,
                    strokeWidth = 2.dp,
                    modifier = Modifier.width(20.dp).height(20.dp)
                )
                voce.installabile -> Voce(testo = "Installa", attiva = false, onClick = onInstalla)
                voce.commutabile -> Switch(checked = voce.acceso, onCheckedChange = onCommuta)
                else -> Text("c’è", color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Vuoto(testo: String) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(testo, color = Banco.testoQuieto, fontSize = 13.sp)
    }
}
