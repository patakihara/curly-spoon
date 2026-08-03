/**
 * Sleep timer trigger + options menu. The countdown and the "pause on zero"
 * behaviour both live in this component's own `setInterval`, which only runs
 * while it is mounted — i.e. while Now Playing is open. That mirrors this
 * app's e2e fixture-audio constraint of doing everything from store state, but
 * it does mean a timer set here doesn't fire if the user backs out of Now
 * Playing before it elapses; a durable timer would need to move this interval
 * somewhere always-mounted (`Shell.tsx`, alongside `useAudioElement`), which is
 * out of scope for this phase.
 */
import { useEffect, useState } from 'react';
import { Icon, IconButton } from '@auralis/ui';
import { usePlayerStore } from '../../state/playerStore.js';
import { formatDuration, sleepTimerRemaining } from './playback.js';
import { endOfChapterMs } from './playerUi.js';

const SLEEP_TIMER_MINUTES = [5, 15, 30, 45, 60] as const;

export function SleepTimerControl() {
  const [menuOpen, setMenuOpen] = useState(false);
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
  };

  return (
    <div className="auralis-sleep-timer">
      <IconButton
        variant={sleepTimerEndsAt !== null ? 'tonal' : 'standard'}
        aria-label="Sleep timer"
        data-testid="sleep-timer"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Icon name="sleep_timer" />
      </IconButton>
      {remainingMs !== null ? (
        <span data-testid="sleep-timer-remaining">{formatDuration(remainingMs / 1000)}</span>
      ) : null}
      {menuOpen ? (
        <div className="auralis-sleep-timer__menu" role="menu" aria-label="Sleep timer options">
          {SLEEP_TIMER_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              role="menuitem"
              data-testid={`sleep-timer-option-${minutes}`}
              onClick={() => choose(minutes * 60_000)}
            >
              {minutes} minutes
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            data-testid="sleep-timer-option-end-of-chapter"
            onClick={() => choose(endOfChapterMs(chapters, currentTime))}
          >
            End of chapter
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="sleep-timer-option-off"
            onClick={() => choose(null)}
          >
            Off
          </button>
        </div>
      ) : null}
    </div>
  );
}
