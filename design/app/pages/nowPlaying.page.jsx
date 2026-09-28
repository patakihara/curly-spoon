export default function NowPlaying({ data }) {
  return (
    <NowPlayingPage
      variant={shell.playing.variant}
      image={shell.playing.image}
      title={shell.playing.title}
      artist={shell.playing.artist}
      context={shell.playing.context}
      playing
      progress={shell.playing.progress}
      duration={shell.playing.duration}
      favourite={shell.playing.favourite}
      sleep={data.sleep}
    >
      <AboutCard
        title={data.about.title}
        heading={data.about.heading}
        meta={data.about.meta}
        image={data.about.image}
        round
        body={data.about.body}
      />
    </NowPlayingPage>
  );
}
