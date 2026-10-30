package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Il Drive del computer: la catena di tessere (Drive → Cassaforte →
 * Salvataggio) con le parole e i colori decisi dal PC, e il prossimo passo.
 *
 * L'account di SierraDeck non c'è più (PC 0.88.0): `/api/account` risponde
 * senza account (`entrato: false`), e «Entra» / «Esci» rispondono 410. Qui
 * resta solo da guardare; il Drive si collega sul computer.
 */
@Composable
internal fun CatenaDrive(account: Account?) {
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            val catena = account?.catena
            if (catena == null || catena.tessere.isEmpty()) {
                Text(
                    if (account == null) "Leggo lo stato del Drive…" else "Il computer non manda ancora lo stato del Drive: aggiornalo.",
                    color = Banco.testoQuieto,
                    fontSize = 12.sp
                )
                return@Column
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (t in catena.tessere) {
                    Column(Modifier.weight(1f)) {
                        Text(t.titolo, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                        Text(t.vista?.parola ?: "", color = coloreVista(t.vista?.colore ?: "quieto"), fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                    }
                }
            }
            catena.tessere.firstOrNull { it.vista?.id == "scade" }?.vista?.ragione?.let {
                Spacer(Modifier.height(6.dp))
                Text("⚠ $it", color = Banco.ambra, fontSize = 12.sp)
            }
            passoAccount(account)?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
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
