package it.ferrariconsulenze.sierradeck.nucleo

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/**
 * Un PC che si sta aggiornando (k-agg1 sul PC, k-agg3 qui). Stesso campo del
 * battito sul Drive (`aggiornando`: `{ versione, da }`), stessa scadenza e
 * stesso testo di `src/shared/aggiornamento-remoto.ts`: chi guarda una chat di
 * quel PC legge «Computer in aggiornamento, attendere», non «non risponde»,
 * l'invio resta fermo e la chat riprende da sola al ritorno.
 */
object AggiornamentoRemoto {
    const val TESTO = "Computer in aggiornamento, attendere"

    /** Oltre questo il segno non vale più (il PC può essersi spento). */
    const val VALE_MS = 15 * 60_000L

    /** Un orologio che anticipa di poco non invalida il segno. */
    private const val ANTICIPO_AMMESSO_MS = 60_000L

    /** La versione che sta installando e quando (ms dal 1970). */
    data class Aggiornando(val versione: String, val da: Long)

    /** Il campo `aggiornando` di un battito, se ha la forma giusta; altrimenti null. */
    fun leggi(x: JsonElement?): Aggiornando? {
        val o = x as? JsonObject ?: return null
        val v = (o["versione"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim() ?: return null
        if (v.isEmpty() || v.length > 40) return null
        val d = (o["da"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull ?: return null
        if (d.isNaN() || d.isInfinite()) return null
        return Aggiornando(v, d.toLong())
    }

    /** La versione che sta installando, se l'aggiornamento vale ancora adesso; altrimenti null. */
    fun inCorso(campo: JsonElement?, versioneDelBattito: String, adesso: Long): String? {
        val a = leggi(campo) ?: return null
        val eta = adesso - a.da
        if (eta > VALE_MS || eta < -ANTICIPO_AMMESSO_MS) return null
        // Il battito dice già la versione nuova: è finito.
        if (versioneDelBattito == a.versione) return null
        return a.versione
    }

    /** La frase intera per il riquadro. */
    fun frase(nomePc: String, versione: String): String {
        val v = versione.trim()
        return "$nomePc: computer in aggiornamento${if (v.isNotEmpty()) " alla $v" else ""}, attendere. Riprende da solo."
    }
}
