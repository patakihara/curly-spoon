package net.develivarr.auralis

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

/** The app's root: a placeholder until the generated nav graph and Sonora theme land. */
@Composable
fun AuralisApp() {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(text = "Auralis", style = MaterialTheme.typography.headlineMedium)
            }
        }
    }
}
