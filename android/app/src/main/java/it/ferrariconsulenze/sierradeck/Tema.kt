package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * I colori del banco, gli stessi del computer (vedi `res/values/colors.xml`):
 * l'app e la finestra devono sembrare la stessa cosa, perché lo sono.
 *
 * Sono la base statica. La tavolozza *viva* — quella che l'utente sceglie sul
 * computer, con Banco/Foglio e il chiarore — arriva a runtime da `/api/stile` e
 * verrà sovrapposta a questi valori quando serve. Partire da qui evita il lampo
 * bianco fra l'apertura e la prima risposta del computer.
 */
object Banco {
    val fondo = Color(0xFF0B0C0E)
    val chassis = Color(0xFF1D2023)
    val incisione = Color(0xFF2F3439)
    val testo = Color(0xFFDFE3E7)
    val testoQuieto = Color(0xFF9AA1A9)
    val accento = Color(0xFF2F6FB5)
    val ambra = Color(0xFFE0A33C)
    val verde = Color(0xFF57D38C)
    val rosso = Color(0xFFE0554A)
}

private val schemaScuro = darkColorScheme(
    primary = Banco.accento,
    onPrimary = Color.White,
    secondary = Banco.ambra,
    tertiary = Banco.verde,
    background = Banco.fondo,
    onBackground = Banco.testo,
    surface = Banco.chassis,
    onSurface = Banco.testo,
    surfaceVariant = Banco.incisione,
    onSurfaceVariant = Banco.testoQuieto,
    outline = Banco.incisione,
    error = Banco.rosso,
    onError = Color.White
)

/**
 * Il tema dell'app.
 *
 * SierraDeck è scuro come il banco: lo è a prescindere dall'impostazione di
 * sistema, perché è la sua identità, non una preferenza. `_scuroDiSistema` resta
 * agganciato solo per non litigare con eventuali componenti che lo leggono.
 */
@Composable
fun TemaSierraDeck(content: @Composable () -> Unit) {
    @Suppress("UNUSED_VARIABLE")
    val scuroDiSistema = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = schemaScuro,
        typography = Typography(),
        content = content
    )
}
