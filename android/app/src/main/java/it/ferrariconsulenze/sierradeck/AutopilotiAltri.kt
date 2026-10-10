package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.Serializable

/**
 * **Gli autopiloti degli altri PC** (PC 0.59.0, app 2.59.0, la richiesta più
 * importante di Nicholas): in «Lavori» compaiono anche quelli che girano
 * sugli altri PC della stessa chiave di casa, con «gira su <PC>». La scheda è
 * quella di sempre (`DettaglioAutopilota`) con le chiamate attraverso il ponte
 * (`Api.suPc`): ogni azione va al PC dove gira.
 */
@Serializable
data class AutopilotiDiPc(
    val pcId: String = "",
    val nome: String = "",
    val autopiloti: List<AutopilotaBreve> = emptyList(),
    val strada: String? = null,
    /** Non ha risposto: il perché, per esteso, con le strade provate (lo scrive il PC). */
    val errore: String? = null,
    val motivo: String? = null
)

@Serializable
data class RispostaAutopilotiAltri(val pc: List<AutopilotiDiPc> = emptyList())

object AutopilotiAltri {
    /** Le stesse parole del PC e della pagina (`giraSu` in src/shared/autopiloti-altri.ts). */
    fun giraSu(nomePc: String): String = "gira su $nomePc"

    /** Le righe da mostrare: prima quelli che aspettano te, come per quelli di qui. */
    fun righe(pc: List<AutopilotiDiPc>): List<Pair<AutopilotiDiPc, AutopilotaBreve>> =
        pc.flatMap { p -> p.autopiloti.map { p to it } }.sortedBy { urgenzaDi(it.second.stato) }

    /** I PC che non hanno risposto, con il loro perché. */
    fun guasti(pc: List<AutopilotiDiPc>): List<AutopilotiDiPc> = pc.filter { !it.errore.isNullOrBlank() }
}
