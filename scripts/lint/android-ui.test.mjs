/**
 * The Android app draws no UI by hand: @Composable functions live only in generated packages and
 * in Sonora's component package. Run: node --test scripts/lint/android-ui.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_ROOT } from '../plan/testing.mjs';
import { composableFunctions, handDrawnComposables, isAllowedPath } from './android-ui.mjs';

const SOURCE = `package net.develivarr.auralis.feature

import androidx.compose.runtime.Composable

class Props(val icon: (@Composable () -> Unit)?)

@Composable
fun Screen() {}

@Composable private fun Row(
    title: String,
) {}

@Preview
@androidx.compose.runtime.Composable
internal inline fun Card() {}

// @Composable fun Commented() {}
fun plain() {}
`;

test('every @Composable function declaration is found, and a composable type is not', () => {
  assert.deepEqual(composableFunctions(SOURCE), [
    { line: 7, name: 'Screen' },
    { line: 10, name: 'Row' },
    { line: 15, name: 'Card' },
  ]);
});

test('composables may live only in generated packages and the Sonora component package', () => {
  const pkg = 'src/main/java/net/develivarr/auralis';
  const sonora = (rel) => isAllowedPath(`android/sonora/${pkg}/${rel}`);
  const app = (rel) => isAllowedPath(`android/app/${pkg}/${rel}`);
  assert.equal(sonora('generated/ui/ButtonProps.kt'), true);
  assert.equal(sonora('ui/sonora/Button.kt'), true);
  assert.equal(
    isAllowedPath('android/sonora/src/test/java/net/develivarr/auralis/ui/sonora/Gallery.kt'),
    true,
  );
  assert.equal(
    isAllowedPath(
      'android/sonora/src/test/java/net/develivarr/auralis/generated/gallery/SonoraGallery.kt',
    ),
    true,
  );
  assert.equal(app('generated/pages/BrowsePage.kt'), true);
  assert.equal(app('MainActivity.kt'), false);
  assert.equal(app('feature/Screen.kt'), false);
  assert.equal(sonora('ui/Theme.kt'), false);
  assert.equal(sonora('SonoraIcon.kt'), false);
});

test('the Android app as it stands draws nothing by hand', () => {
  assert.deepEqual(handDrawnComposables(REPO_ROOT), []);
});
