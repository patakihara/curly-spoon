<div style={{ width: 520, maxWidth: '100%' }}>
  <SortFilterBar
    label="All episodes • Newest"
    items={[
      { key: 'newest', label: 'Newest' },
      { key: 'oldest', label: 'Oldest' },
    ]}
    onSelect={() => {}}
    trailing={<ViewToggle value="grid" onChange={() => {}} />}
  />
</div>
