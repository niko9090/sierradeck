package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Il ponte (PC 0.48.0, app 2.48.0): dal telefono le chat di **tutti** i PC dal
 * vivo, passando dal PC a cui il telefono è accoppiato.
 *
 * Il telefono chiede al suo PC `POST /api/ponte {pc, percorso, corpo}` e quel
 * PC la gira all'altro con le sue strade (rete di casa, Tailscale, WebRTC,
 * Drive) e la chiave di casa, che il telefono non ha mai. La risposta è
 * quella dell'altro PC, intera: le schermate delle chat sono le stesse.
 *
 * **Gli stessi permessi del PC**: solo quello che il PC fa dal suo riquadro
 * remoto. Rinominare e chiudere una chat, la cartella nuova da sfogliare, le
 * conversazioni salvate: no, e i tasti non si mostrano.
 */
object Ponte {
    /** Le rotte che passano, uguali a `ROTTE_PONTE` del PC (src/shared/ponte-telefono.ts). */
    val ROTTE = setOf("/api/stato", "/api/storia", "/api/scrivi", "/api/scegli", "/api/sessioni/riprendi", "/api/apri", "/api/pin/sblocca",
        // I file dal telefono (PC 0.50.0): a pezzi fino a quel PC.
        "/api/allegati/inizia", "/api/allegati/pezzo", "/api/allegati/stato", "/api/allegati/fine", "/api/allegati/annulla")

    /** Il corpo di `/api/ponte`: il PC, la rotta, e il corpo della richiesta se c'è. */
    fun corpo(pc: String, percorso: String, corpoJson: String?): String {
        val interno: JsonElement? = corpoJson?.takeIf { it.isNotBlank() }?.let { Api.json.parseToJsonElement(it) }
        return Api.json.encodeToString(JsonElement.serializer(), buildJsonObject {
            put("pc", pc)
            put("percorso", percorso)
            if (interno != null) put("corpo", interno)
        })
    }

    /** Il rifiuto, nella stessa forma di quelli del PC (`{"errore": …}`). */
    fun nonSiPuo(percorso: String): String = Api.json.encodeToString(JsonElement.serializer(), buildJsonObject {
        put("errore", "Su un altro PC il telefono può fare quello che fa il PC dal suo riquadro remoto: vedere le chat e la loro storia, scrivere, premere un’opzione, riprendere o aprire una chat, mandarle un file. «$percorso» no.")
    })
}

/** Il PC che si sta guardando attraverso il ponte. */
data class PcPonte(val pcId: String, val nome: String)

object SuPc {
    /** `null` = le chat del PC accoppiato, come sempre. */
    var corrente by mutableStateOf<PcPonte?>(null)
}

/** Il viola delle chat di un altro PC: lo stesso del riquadro remoto sul PC. */
val VIOLA_ALTRO_PC = Color(0xFFA77BF3)

/**
 * La fascia viola «SU <PC>», in cima a ogni schermata del ponte: non deve
 * mai esserci il dubbio di quale computer si stia comandando.
 */
@Composable
fun FasciaSuPc(pc: PcPonte, viaNome: String?, onTorna: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(VIOLA_ALTRO_PC.copy(alpha = 0.22f)).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text("SU ${pc.nome.uppercase()}", color = VIOLA_ALTRO_PC, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
            Text(
                "Stai comandando ${pc.nome}" + (if (!viaNome.isNullOrBlank()) " attraverso $viaNome" else " attraverso il PC accoppiato") + ": quello che scrivi arriva là.",
                color = Banco.testo, fontSize = 11.sp, maxLines = 2
            )
        }
        Spacer(Modifier.width(8.dp))
        OutlinedButton(onClick = onTorna) { Text("Torna", fontSize = 12.sp) }
    }
}
