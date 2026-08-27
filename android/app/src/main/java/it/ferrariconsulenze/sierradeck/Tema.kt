package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * I colori del banco — **vivi**, non copiati.
 *
 * La grafica di SierraDeck la sceglie l'utente sul computer (l'accento, il
 * chiarore del fondo, e se il banco è inciso o un foglio piatto). Il telefono la
 * riceve da `/api/stile` e la indossa: l'app e la finestra sono lo stesso
 * strumento, quindi devono avere la stessa faccia — fino al **raggio degli
 * angoli**, che è quello della console (2px sul banco), non i bordi tondi di un
 * modulo web.
 *
 * I valori sono `mutableStateOf`: ogni lettura `Banco.fondo` dentro una schermata
 * si riaggancia da sola, e quando arriva lo stile del computer tutta l'app si
 * riveste in un colpo, senza passare un tema di mano in mano. I default sono la
 * veste scura di partenza, per non vedere un lampo bianco prima della risposta.
 */
object Banco {
    var fondo by mutableStateOf(Color(0xFF0B0C0E))
    var chassis by mutableStateOf(Color(0xFF1D2023))
    var chassisAlto by mutableStateOf(Color(0xFF262A2E))
    var incisione by mutableStateOf(Color(0xFF2F3439))
    var testo by mutableStateOf(Color(0xFFDFE3E7))
    var testoQuieto by mutableStateOf(Color(0xFF9AA1A9))
    var accento by mutableStateOf(Color(0xFF4AA3FF))
    var ambra by mutableStateOf(Color(0xFFE0A33C))
    var verde by mutableStateOf(Color(0xFF54C07A))
    var rosso by mutableStateOf(Color(0xFFDC5F5F))
    /** Il raggio degli angoli, dal token `--raggio` del computer. */
    var raggio by mutableStateOf(3.dp)

    /** Indossa la tavolozza arrivata da `/api/stile`. I token mancanti restano
     *  quelli di prima: un computer più vecchio non spoglia l'app. */
    fun applica(s: Stile) {
        val t = s.token
        fun c(chiave: String, ora: Color): Color = t[chiave]?.let { coloreDaToken(it, ora) } ?: ora
        fondo = c("--fondo", fondo)
        chassis = c("--chassis", chassis)
        chassisAlto = c("--chassis-alto", chassisAlto)
        incisione = c("--incisione", incisione)
        testo = c("--testo", testo)
        testoQuieto = c("--testo-quieto", testoQuieto)
        accento = c("--accento", accento)
        ambra = c("--ambra", ambra)
        verde = c("--verde", verde)
        rosso = c("--rosso", rosso)
        t["--raggio"]?.let { dpDaToken(it) }?.let { raggio = it }
    }
}

/** `#rrggbb` → Color; `transparent` → il colore di prima con alpha 0. Qualunque
 *  altra forma non tocca niente. */
private fun coloreDaToken(valore: String, ripiego: Color): Color {
    val v = valore.trim()
    if (v.equals("transparent", ignoreCase = true)) return Color.Transparent
    if (v.startsWith("#") && v.length == 7) {
        val n = v.substring(1).toLongOrNull(16) ?: return ripiego
        return Color(0xFF000000 or n)
    }
    return ripiego
}

/** `"2px"` → `2.dp`. */
private fun dpDaToken(valore: String): Dp? =
    valore.trim().removeSuffix("px").trim().toFloatOrNull()?.dp

@Composable
fun TemaSierraDeck(content: @Composable () -> Unit) {
    // Legge lo stato del Banco: quando cambia (stile dal computer), lo schema e le
    // forme si ricalcolano e tutta l'app si riveste.
    val schema = darkColorScheme(
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
    // Un raggio solo, quello della console: tessere, tasti, chip, campi e finestre
    // hanno tutti lo stesso angolo — è ciò che li fa sembrare lo stesso strumento.
    val r = RoundedCornerShape(Banco.raggio)
    val forme = Shapes(extraSmall = r, small = r, medium = r, large = r, extraLarge = r)

    MaterialTheme(
        colorScheme = schema,
        shapes = forme,
        typography = Typography(),
        content = content
    )
}
