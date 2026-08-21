<TransportBar
  variant="spoken"
  playing
  skipSeconds={15}
  onTogglePlay={() => {}}
  onSkipBack={() => {}}
  onSkipForward={() => {}}
  leading={<SpeedControl value={1.5} onClick={() => {}} />}
  trailing={
    <IconButton label="Sleep timer" onClick={() => {}}>
      <span style={{fontFamily:'Material Symbols Rounded',fontSize:'var(--icon-sm)',lineHeight:1}}>bedtime</span>
    </IconButton>
  }
/>
