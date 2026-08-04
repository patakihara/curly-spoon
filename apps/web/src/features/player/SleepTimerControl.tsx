/**
 * Sleep timer trigger + options menu. The countdown and the "pause on zero"
 * behaviour both live in this component's own `setInterval`, which only runs
 * while it is mounted — i.e. while Now Playing is open. That mirrors this
 * app's e2e fixture-audio constraint of doing everything from store state, but
 * it does mean a timer set here doesn't fire if the user backs out of Now
 * Playing before it elapses; a durable timer would need to move this interval
 * somewhere always-mounted (`Shell.tsx`, alongside `useAudioElement`), which is
 * out of scope for this phase.
 *
 * Accessibility (found in the phase-10 a11y audit): the trigger carries
 * `aria-haspopup="menu"`/`aria-expanded` so a screen reader user knows, before
 * activating it, that this is a disclosure control rather than a two-state
 * toggle — and Escape closes the menu and returns focus to the trigger, the
 * same contract `Sheet`/`Dialog` already honour for every other overlay in
 * this app. The individual options are plain `<button>`s (not a roving-tabindex
 * ARIA menu), so Tab still moves through them one at a time; that is a real,
 * working keyboard path, just not the arrow-key-navigation pattern the ARIA
 * Authoring Practices describe for `role="menu"` — a nice-to-have left for a
 * future pass, not a blocker, since nothing here is unreachable or untriggerable
 * from a keyboard.
 *
 * Escape has to be handled a specific way: `NowPlaying`'s enclosing `Sheet`
 * (Mantine `Drawer`) listens for Escape on `window` in the *capture* phase
 * (`ModalBase/use-modal.ts`), which always runs before any bubble-phase
 * `onKeyDown` on this menu — so calling `stopPropagation()` here is too late to
 * stop it, and an unguarded Escape here would close the whole sheet instead of
 * just this submenu. Mantine's own escape hatch for exactly this is
 * `data-mantine-stop-propagation="true"`: its window listener checks for that
 * attribute on `event.target` and skips `onClose` when present. Set only while
 * this menu is open, so Escape elsewhere in Now Playing still closes the sheet
 * as expected.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon, IconButton } from '@auralis/ui';
import { usePlayerStore } from '../../state/playerStore.js';
import { formatDuration, sleepTimerRemaining } from './playback.js';
import { endOfChapterMs } from './playerUi.js';

const SLEEP_TIMER_MINUTES = [5, 15, 30, 45, 60] as const;

export function SleepTimerControl() {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const pause = usePlayerStore((s) => s.pause);
  const chapters = usePlayerStore((s) => s.chapters);
  const currentTime = usePlayerStore((s) => s.currentTime);

  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    sleepTimerRemaining(sleepTimerEndsAt, Date.now()),
  );

  useEffect(() => {
    if (sleepTimerEndsAt === null) {
      setRemainingMs(null);
      return undefined;
    }

    const tick = () => {
      const remaining = sleepTimerRemaining(sleepTimerEndsAt, Date.now());
      setRemainingMs(remaining);
      if (remaining === 0) {
        pause();
        setSleepTimer(null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerEndsAt, pause, setSleepTimer]);

  const choose = (ms: number | null) => {
    setSleepTimer(ms);
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  const closeAndReturnFocus = () => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="auralis-sleep-timer">
      <IconButton
        ref={triggerRef}
        variant={sleepTimerEndsAt !== null ? 'tonal' : 'standard'}
        aria-label="Sleep timer"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="sleep-timer"
        // See this file's header comment: tells Sheet's window-capture Escape
        // listener to skip closing the whole sheet while this submenu owns Escape.
        data-mantine-stop-propagation={menuOpen ? 'true' : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          // Focus is still on the trigger immediately after opening (nothing here
          // moves it into the menu), so Escape has to be handled here too, not
          // only on the menu container below — that one only sees Escape once
          // focus has moved to one of the option buttons.
          if (event.key === 'Escape' && menuOpen) {
            event.stopPropagation();
            closeAndReturnFocus();
          }
        }}
      >
        <Icon name="sleep_timer" />
      </IconButton>
      {remainingMs !== null ? (
        <span data-testid="sleep-timer-remaining">{formatDuration(remainingMs / 1000)}</span>
      ) : null}
      {menuOpen ? (
        <div
          className="auralis-sleep-timer__menu"
          role="menu"
          aria-label="Sleep timer options"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeAndReturnFocus();
            }
          }}
        >
          {SLEEP_TIMER_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              role="menuitem"
              data-testid={`sleep-timer-option-${minutes}`}
              data-mantine-stop-propagation="true"
              onClick={() => choose(minutes * 60_000)}
            >
              {minutes} minutes
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            data-testid="sleep-timer-option-end-of-chapter"
            data-mantine-stop-propagation="true"
            onClick={() => choose(endOfChapterMs(chapters, currentTime))}
          >
            End of chapter
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="sleep-timer-option-off"
            data-mantine-stop-propagation="true"
            onClick={() => choose(null)}
          >
            Off
          </button>
        </div>
      ) : null}
    </div>
  );
}
