package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/**
 * Lo spazio sul Drive (PC 0.65.0), nel pannello «Progetti»: quanto usa
 * SierraDeck per tipo, la quota dell'account, le proposte di pulizia e le
 * pulizie nel recupero. Gli stessi dati e le stesse azioni del PC e della
 * pagina (`/api/drive/pannello`, `/api/drive/azione`).
 */
@Serializable data class QuotaDrive(val limite: Double? = null, val usato: Double = 0.0)
@Serializable data class ContoSpazio(val file: Int = 0, val byte: Double = 0.0)
@Serializable data class MisuraSpazioDrive(
    val quota: QuotaDrive? = null,
    val totale: ContoSpazio = ContoSpazio(),
    val perTipo: Map<String, ContoSpazio> = emptyMap(),
    val inRecupero: ContoSpazio = ContoSpazio(),
    val misuratoIl: String = ""
)
@Serializable data class PropostaSpazio(val tipo: String = "", val titolo: String = "", val breve: String = "", val spiega: String = "", val byte: Double = 0.0)
@Serializable data class VocePulitaDrive(val nome: String = "")
@Serializable data class PuliziaDrive(
    val id: String = "", val titolo: String = "", val quando: String = "", val chi: String = "", val scadeIl: String = "",
    val voci: List<VocePulitaDrive> = emptyList(), val byte: Double = 0.0, val annullataIl: String? = null, val svuotataIl: String? = null
)
@Serializable data class StatoSpazioDrive(
    val misura: MisuraSpazioDrive? = null,
    val proposte: List<PropostaSpazio> = emptyList(),
    val pulizie: List<PuliziaDrive> = emptyList(),
    val errore: String? = null
)

object SpazioRegole {
    /** Gli stessi tipi e nomi del PC (`ETICHETTA_SPAZIO`), nello stesso ordine. */
    val TIPI = listOf(
        "chat" to "Chat",
        "progetti" to "Progetti",
        "battiti" to "Battiti e posta dei PC",
        "recupero" to "Recupero e copie di sicurezza",
        "sistema" to "Indice, chiavi e workspace",
        "orfani" to "File senza voce nell’indice"
    )

    /** Come `byteLeggibili` del PC: 1,5 KB, 340 MB, 3,2 GB. */
    fun byte(n: Double): String {
        val u = listOf("byte", "KB", "MB", "GB", "TB")
        var x = n
        var i = 0
        while (x >= 1024 && i < u.size - 1) { x /= 1024; i += 1 }
        if (i == 0) return "${x.toLong()} ${u[i]}"
        val testo = if (x < 10) String.format(java.util.Locale.ROOT, "%.1f", x) else Math.round(x).toString()
        return "${testo.replace('.', ',')} ${u[i]}"
    }

    /** La riga in cima: quanto usa SierraDeck, e l'account. */
    fun riepilogo(m: MisuraSpazioDrive): String =
        "SierraDeck usa ${byte(m.totale.byte)} in ${m.totale.file} file" +
            (m.quota?.let { q -> " · account: ${byte(q.usato)}" + (q.limite?.let { " di ${byte(it)}" } ?: "") } ?: "") +
            (if (m.inRecupero.byte > 0) " · nel recupero ${byte(m.inRecupero.byte)}" else "")

    /** Le righe per tipo, solo i tipi che hanno file. */
    fun righe(m: MisuraSpazioDrive): List<String> = TIPI.mapNotNull { (id, nome) ->
        m.perTipo[id]?.takeIf { it.file > 0 }?.let { "$nome: ${byte(it.byte)} · ${it.file} file" }
    }

    /** Le pulizie ancora nel recupero: né annullate né svuotate. */
    fun inRecupero(s: StatoSpazioDrive): List<PuliziaDrive> = s.pulizie.filter { it.annullataIl == null && it.svuotataIl == null }
}
