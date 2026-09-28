/**
 * The account avatar that leads the phone's top bar: a `BackLayer`'s `leading` on a destination's
 * home, opening Settings. A round button holding the account's picture through `CoverArt`, or,
 * with no picture, a filled person glyph on `--surface-card`.
 *
 * It belongs to the heading row only, never to a filter row: a filter reconfigures the content,
 * and the account is not a filter. On desktop, Settings sits at the foot of the rail instead.
 */
export interface AccountButtonProps {
  /** The account's picture. Without it, a person glyph. */
  image?: string;
  /** Accessible name and tooltip. Default "Account". */
  label?: string;
  /** Diameter in px. Default 32, the mobile app bar's avatar. */
  size?: number;
  onClick?: () => void;
}
export declare function AccountButton(props: AccountButtonProps): JSX.Element;
