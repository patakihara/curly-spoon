export default function NowPlaying() {
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
      sleep={shell.playing.sleep}
    >
      <AboutCard
        title={shell.playing.about.title}
        heading={shell.playing.about.heading}
        meta={shell.playing.about.meta}
        image={shell.playing.about.image}
        round
        body={shell.playing.about.body}
      />
    </NowPlayingPage>
  );
}
