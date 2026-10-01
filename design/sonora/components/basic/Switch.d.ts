export interface SwitchProps {
  checked: boolean;
  /** Receives the next checked state. Without it the switch is drawn disabled. */
  onChange?: (next: boolean) => void;
  label?: string;
}
