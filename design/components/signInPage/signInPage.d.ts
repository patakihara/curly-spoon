// Generated from signInPage.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';

/** Shown by the sign-in gate instead of the decks: the logo in the accent colour (logo, logoSize, at rest), title, text and the action. Signing in plays enterApp, the same as launch: the logo moves onto the app's logo.
 *  Extends surface. */
export interface SignInPageProps extends SurfaceProps {
}
export type SignInPageState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';
