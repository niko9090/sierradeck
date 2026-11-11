package it.ferrariconsulenze.sierradeck.schermate.altro

import it.ferrariconsulenze.sierradeck.schermate.comune.Nota

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import it.ferrariconsulenze.sierradeck.nucleo.AzioniTelefono
import it.ferrariconsulenze.sierradeck.nucleo.Chat
import it.ferrariconsulenze.sierradeck.nucleo.ChiuseDaTe
import it.ferrariconsulenze.sierradeck.nucleo.Conferma
import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.nucleo.ElencoVuoto
import it.ferrariconsulenze.sierradeck.nucleo.FunzionePc
import it.ferrariconsulenze.sierradeck.nucleo.FunzioniPc
import it.ferrariconsulenze.sierradeck.nucleo.MenuWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.PcCorrente
import it.ferrariconsulenze.sierradeck.nucleo.SessioneRipresa
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.nucleo.TonoChat
import it.ferrariconsulenze.sierradeck.nucleo.VoceRecuperoWs
import it.ferrariconsulenze.sierradeck.nucleo.Workspace
import it.ferrariconsulenze.sierradeck.nucleo.chatCheTiAspettano
import it.ferrariconsulenze.sierradeck.nucleo.leggiChat
import it.ferrariconsulenze.sierradeck.nucleo.nomeChat
import it.ferrariconsulenze.sierradeck.nucleo.parolaPerRiga
import it.ferrariconsulenze.sierradeck.nucleo.raggruppaChat
import it.ferrariconsulenze.sierradeck.nucleo.riassuntoChat
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Collegamenti
import it.ferrariconsulenze.sierradeck.rete.EventoLinea
import it.ferrariconsulenze.sierradeck.rete.Linea
import it.ferrariconsulenze.sierradeck.rete.PcPonte
import it.ferrariconsulenze.sierradeck.rete.SuPc
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.Serigrafia
import it.ferrariconsulenze.sierradeck.schermate.comune.Tessera
import it.ferrariconsulenze.sierradeck.schermate.comune.TitoloDialogo
import it.ferrariconsulenze.sierradeck.schermate.comune.tocco
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.tema.ColoreStato
import it.ferrariconsulenze.sierradeck.schermate.tema.FontTerminale
import it.ferrariconsulenze.sierradeck.sottofondo.Aggiornamenti
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Pezzi delle schermate di prima che le sezioni di Altro usano ancora. */

/** Il colore di ogni stato: ambra per ciò che aspetta te, verde per chi lavora, accento per chi è guidato. */
fun coloreTono(t: TonoChat?): androidx.compose.ui.graphics.Color = when (t) {
    TonoChat.SCEGLIE -> ColoreStato.ambra
    TonoChat.LAVORA -> ColoreStato.verde
    TonoChat.GUIDATA -> Banco.accento
    TonoChat.FERMA, TonoChat.SPENTA, null -> ColoreStato.quieto
}

/** Il LED di una chat: pieno se ha un terminale acceso, solo contorno se è spenta o chiusa (`null`). */
@Composable
fun LedChat(tono: TonoChat?) {
    val c = coloreTono(tono)
    Box(
        Modifier
            .size(10.dp)
            .clip(CircleShape)
            .then(if (tono == null || tono == TonoChat.SPENTA) Modifier.border(1.dp, c, CircleShape) else Modifier.background(c))
    )
}

/**
 * Un PC indietro con la versione (app 2.56.2): lo si dice in cima, con quello
 * che là non c'è ancora e il tasto «Installa là», che chiede al PC accoppiato
 * di aggiornarlo (come dalla Salute del PC). Mai un errore muto.
 */
object PcIndietro {
    /** Il testo, o `null` se quel PC è aggiornato quanto serve. */
    fun testo(nome: String, versione: String?, accoppiato: String?): String? {
        if (versione.isNullOrBlank()) return null
        // Il quaderno personale non conta: è solo del PC accoppiato e non passa dal ponte,
        // quindi su un altro PC non manca niente di quello che il telefono userebbe là.
        // Manca là solo ciò che il PC collegato ha già (PC 0.82.0, «Apri cartella»): a versioni uguali non manca niente.
        val mancano = FunzionePc.entries.filter { FunzioniPc.disponibile(it, versione) == false && FunzioniPc.disponibile(it, accoppiato) != false && it.minima != FunzionePc.INSTALLA_LA.minima && it != FunzionePc.QUADERNO_PERSONALE && it != FunzionePc.PANNELLO_DRIVE && it != FunzionePc.GESTIONE_CHAT && it != FunzionePc.CARTELLA }
        val indietroDalCollegato = accoppiato != null && Aggiornamenti.piuNuova(versione, accoppiato)
        if (mancano.isEmpty() && !indietroDalCollegato) return null
        val cosa = if (mancano.isEmpty()) "" else " Là non ci sono ancora: " + mancano.joinToString("; ") { it.nome.replaceFirstChar { c -> c.lowercase() } } + "."
        return "$nome ha la versione $versione" + (accoppiato?.let { ", il PC a cui è collegato il telefono la $it" } ?: "") + ".$cosa Aggiornalo con «Installa là»: si installa quando le sue chat finiscono il turno, e niente si perde."
    }
}

@Composable
fun BandaPcIndietro(apiAccoppiato: Api, pcId: String, nome: String, versione: String?) {
    val testo = PcIndietro.testo(nome, versione, PcCorrente.versione) ?: return
    val scope = rememberCoroutineScope()
    var nota by remember(pcId) { mutableStateOf<String?>(null) }
    var segui by remember(pcId) { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(pcId, segui) {
        while (segui) {
            nota = try { apiAccoppiato.installaLaStato().avanzamenti.firstOrNull { it.pcId == pcId }?.messaggio ?: nota } catch (_: Exception) { nota }
            Davanti.pausa(3000)
        }
    }
    Column(Modifier.fillMaxWidth().background(Banco.ambra.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 6.dp)) {
        Text(testo, color = Banco.testo, fontSize = 12.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = {
                scope.launch {
                    nota = try { apiAccoppiato.installaLa(pcId); segui = true; "Chiesto: busso a $nome…" } catch (e: Api.Errore) {
                        if (FunzioniPc.mancaSulPc(e)) FunzioniPc.testoMancante(FunzionePc.INSTALLA_LA, PcCorrente.nome) + " Intanto si aggiorna dalla Salute del PC." else Nota.spiega(e, "chiedere l’aggiornamento di $nome")
                    } catch (e: Exception) { "Non sono riuscito a chiederlo: ${e.message ?: "il computer non risponde"}" }
                }
            }) { Text("Installa là") }
            nota?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f)) }
        }
    }
}

