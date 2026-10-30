package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * «Altro» (app 2.83.0): quello che prima stava in Salute e Impostazioni, a
 * elenco. Un tocco apre una sezione, «indietro» torna all'elenco. In cima
 * «Cerca» nelle impostazioni, come prima; una voce trovata apre la sua sezione.
 */
@Composable
fun Altro(api: Api, sezione: SezioneAltro?, onApri: (SezioneAltro) -> Unit, onIndietro: () -> Unit) {
    val contesto = LocalContext.current
    val struttura = remember { ImpostazioniVoci.carica(contesto) }
    if (sezione == null) {
        ElencoAltro(struttura, onApri)
        return
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onIndietro, modifier = Modifier.heightIn(min = 48.dp)) { Text("‹ Altro", fontSize = 15.sp) }
            Spacer(Modifier.weight(1f))
            sezione.impostazione?.let { id -> struttura.sezioni.firstOrNull { it.id == id }?.let { Aiuto(it.spiega, di = it.titolo) } }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            SezioneDiAltro(api, sezione)
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SezioneDiAltro(api: Api, s: SezioneAltro) {
    when (s) {
        SezioneAltro.SALUTE -> { Sezione(s.titolo); SezioneSalute(api) }
        SezioneAltro.ALTRI_PC -> {
            AltriComputer(api)
            Spacer(Modifier.height(10.dp))
            Text("Per cambiare il computer a cui è collegata l’app tocca il suo nome in alto.", color = Banco.testoQuieto, fontSize = 13.sp)
        }
        SezioneAltro.CONSUMI -> SezioneConsumi(api)
        SezioneAltro.AGGIORNAMENTI -> SezioneAggiornamenti(api)
        SezioneAltro.CHAT -> { Sezione(s.titolo); SezioneMigrazione(api) }
        SezioneAltro.QUADERNO -> { Sezione(s.titolo); SezioneQuadernoPersonale(api) }
        SezioneAltro.DRIVE -> SezioneDrive(api)
        SezioneAltro.ASPETTO -> SezioneAspetto(api)
        SezioneAltro.AVVISI -> SezioneAvvisi()
        SezioneAltro.INFO -> SezioneInfo(api)
    }
}

@Composable
private fun ElencoAltro(struttura: StrutturaImp, onApri: (SezioneAltro) -> Unit) {
    var cerca by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        OutlinedTextField(
            value = cerca, onValueChange = { cerca = it.take(60) }, singleLine = true,
            placeholder = { Text("Cerca (per esempio: aggiornamento, PIN, notifiche)", fontSize = 14.sp) },
            modifier = Modifier.fillMaxWidth()
        )
        if (cerca.isNotBlank()) {
            val trovate = ImpostazioniVoci.cerca(struttura, cerca)
            if (trovate.isEmpty()) Text("Niente con «${cerca.trim()}». Prova con un’altra parola.", color = Banco.testoQuieto, fontSize = 14.sp, modifier = Modifier.padding(vertical = 8.dp))
            for (v in trovate) {
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(v.titolo, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    Aiuto(v.spiega, di = v.titolo)
                    TextButton(onClick = { onApri(SezioneAltro.diImpostazione(v.sezione, v.id)) }) { Text("Apri ›") }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        for (s in SezioneAltro.entries) {
            Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp), onClick = { onApri(s) }) {
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(s.titolo, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(s.sotto, color = Banco.testoQuieto, fontSize = 13.sp)
                    }
                    Text("›", color = Banco.testoQuieto, fontSize = 20.sp)
                }
            }
        }
    }
}
