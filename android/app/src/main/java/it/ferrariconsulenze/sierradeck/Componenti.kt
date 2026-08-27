package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * I due gesti grafici del banco, in un posto solo.
 *
 * `Tessera`: il pannello inciso — fondo chassis, un solco di un pixel (incisione)
 * al posto della cornice tonda, e l'angolo della console. `Serigrafia`:
 * l'etichetta stampata a stencil — maiuscoletto spaziato, piccola, come le scritte
 * sul metallo di uno strumento. Insieme sono ciò che fa sembrare l'app lo stesso
 * oggetto della finestra, invece di un modulo web.
 */

@Composable
fun Tessera(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val forma = MaterialTheme.shapes.small
    val bordo = BorderStroke(1.dp, Banco.incisione)
    if (onClick != null) {
        Surface(
            onClick = onClick,
            color = Banco.chassis,
            contentColor = Banco.testo,
            shape = forma,
            border = bordo,
            modifier = modifier
        ) { Column(content = content) }
    } else {
        Surface(
            color = Banco.chassis,
            contentColor = Banco.testo,
            shape = forma,
            border = bordo,
            modifier = modifier
        ) { Column(content = content) }
    }
}

@Composable
fun Serigrafia(testo: String, colore: Color = Banco.accento, modifier: Modifier = Modifier) {
    Text(
        text = testo.uppercase(),
        color = colore,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp,
        modifier = modifier
    )
}
