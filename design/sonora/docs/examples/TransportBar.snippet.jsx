<TransportBar
  variant="spoken"
  playing
  skipSeconds={15}
  onTogglePlay={() => {}}
  onSkipBack={() => {}}
  onSkipForward={() => {}}
  leading={<SpeedControl value={1.5} onClick={() => {}} />}
  trailing={
    <IconButton label="Sleep timer" icon="bedtime" onClick={() => {}} />
  }
/>
