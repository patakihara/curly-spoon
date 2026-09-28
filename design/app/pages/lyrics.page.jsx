export default function Lyrics({ data }) {
  return (
    <LyricsPage
      heading={null}
      title={shell.playing.title}
      artist={shell.playing.artist}
      lines={data.lines}
      activeIndex={data.activeIndex}
      syncMode={data.syncMode}
    />
  );
}
