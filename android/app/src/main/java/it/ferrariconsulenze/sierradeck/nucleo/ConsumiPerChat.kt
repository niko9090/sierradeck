package it.ferrariconsulenze.sierradeck.nucleo

import kotlinx.serialization.Serializable
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// ─── /api/consumi → perChat (k-con1) ───
// I numeri li fa il PC: qui si leggono e si mettono in parole. Niente conti.

/** Quanto resta di una finestra. Senza dato vero `noto` e' false e `motivo` dice perche'. */
@Serializable
data class Rimasto(
    val noto: Boolean = false,
    val percentoUsato: Int? = null,
    val percentoRimasto: Int? = null,
    val azzeraIl: Long? = null,
    val azzeraEtichetta: String? = null,
    val vecchia: Boolean? = null,
    val lettoIl: Long? = null,
    val motivo: String? = null
)

@Serializable
data class UsoChat(
    val chiave: String = "",
    val chat: String = "",
    val workspace: String = "",
    val pc: String = "",
    val oggi: Long = 0,
    val settimana: Long = 0,
    val ultimo: Long? = null
)

@Serializable
data class RimastoTutto(
    val giornata: Rimasto = Rimasto(),
    val cinqueOre: Rimasto = Rimasto(),
    val settimana: Rimasto = Rimasto()
)

@Serializable
data class ConsumiPerChat(
    val aggiornatoIl: Long = 0,
    val pc: String = "",
    val chat: List<UsoChat> = emptyList(),
    val rimasto: RimastoTutto = RimastoTutto()
)

/** Una voce in alto: etichetta, numero grande, riga sotto e (se serve) la spiegazione per il «?». */
data class VoceInAlto(
    val etichetta: String,
    val grande: String,
    val sotto: String,
    val noto: Boolean,
    val aiuto: String? = null
)

object ConsumiVistaPura {
    const val NON_NOTO = "non noto"
    const val MOTIVO_GIORNATA =
        "Claude non dà un limite per la giornata: dà una finestra di 5 ore e una settimana. Per questo il resto di oggi non si può dire."
    const val MOTIVO_ASSENTE = "Il computer non ha ancora mandato questo dato."

    /** «dom 09:00»: l'azzeramento in parole, dal momento se il PC non ha mandato la frase. */
    fun quandoSiAzzera(r: Rimasto, zona: TimeZone = TimeZone.getDefault()): String? {
        r.azzeraEtichetta?.takeIf { it.isNotBlank() }?.let { return it }
        val t = r.azzeraIl ?: return null
        val f = SimpleDateFormat("EEE HH:mm", Locale.ITALY).apply { timeZone = zona }
        return f.format(Date(t))
    }

    private fun voce(etichetta: String, r: Rimasto?, zona: TimeZone): VoceInAlto {
        if (r == null) return VoceInAlto(etichetta, NON_NOTO, "", false, MOTIVO_ASSENTE)
        if (!r.noto || r.percentoRimasto == null) {
            val quando = quandoSiAzzera(r, zona)
            return VoceInAlto(
                etichetta, NON_NOTO,
                if (quando != null) "si azzera $quando" else "",
                false,
                r.motivo?.takeIf { it.isNotBlank() } ?: MOTIVO_ASSENTE
            )
        }
        val parti = mutableListOf<String>()
        quandoSiAzzera(r, zona)?.let { parti.add("si azzera $it") }
        if (r.vecchia == true) parti.add("lettura vecchia")
        return VoceInAlto(etichetta, "${r.percentoRimasto.coerceIn(0, 100)}%", parti.joinToString(" · "), true)
    }

    /** Le tre voci in alto, nell'ordine: 5 ore, settimana, oggi. */
    fun vociInAlto(p: ConsumiPerChat?, zona: TimeZone = TimeZone.getDefault()): List<VoceInAlto> = listOf(
        voce("Resta nelle 5 ore", p?.rimasto?.cinqueOre, zona),
        voce("Resta questa settimana", p?.rimasto?.settimana, zona),
        // La giornata: Claude non la da', il PC lo scrive. Mai un numero nostro.
        VoceInAlto("Oggi", NON_NOTO, "", false, p?.rimasto?.giornata?.motivo?.takeIf { it.isNotBlank() } ?: MOTIVO_GIORNATA)
    )

    /** Le chat dal consumo piu' alto: oggi, poi settimana, poi nome. */
    fun chatOrdinate(p: ConsumiPerChat?): List<UsoChat> =
        p?.chat.orEmpty().sortedWith(compareByDescending<UsoChat> { it.oggi }.thenByDescending { it.settimana }.thenBy { it.chat.lowercase() })

    /** Token leggibili: 842, 12.4k, 3.1M. */
    fun token(n: Long): String = when {
        n >= 1_000_000 -> String.format(Locale.ITALY, "%.1fM", n / 1_000_000.0)
        n >= 1_000 -> String.format(Locale.ITALY, "%.1fk", n / 1_000.0)
        else -> n.toString()
    }

    /** «Portfolio · PC-uno»: dove sta la chat. */
    fun doveStaChat(c: UsoChat): String = listOf(c.workspace, c.pc).filter { it.isNotBlank() }.joinToString(" · ")
}
