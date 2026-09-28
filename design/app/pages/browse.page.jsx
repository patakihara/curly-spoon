export default function Browse({ data }) {
  return (
    <BackdropShell
      back={
        <BackLayer
          controls={<ButtonGroup tone="play" items={shell.filters.browse} value="All" />}
        />
      }
      subheader={<FrontLayerHeader spy sections={data.sections} />}
    >
      <PageBody>
        <Section title="Jump back in">
          <LayoutGrid item="wide" maxWidth="var(--grid-max-width-tiles)">
            <Each of={data.jumpBackIn.albums} as="album">
              <QuickPick
                title={album.title}
                sub={album.sub}
                image={album.image}
                onClick={<Open page="album" ref={album.ref} />}
              />
            </Each>
            <Each of={data.jumpBackIn.books} as="book">
              <QuickPick
                title={book.title}
                sub={book.sub}
                image={book.image}
                onClick={<Open page="book" ref={book.ref} />}
              />
            </Each>
            <Each of={data.jumpBackIn.shows} as="show">
              <QuickPick
                title={show.title}
                sub={show.sub}
                image={show.image}
                onClick={<Open page="show" ref={show.ref} />}
              />
            </Each>
          </LayoutGrid>
        </Section>
        <Section title="Recently added" action="arrow_forward" actionLabel="See all">
          <Shelf>
            <Each of={data.recentlyAdded.albums} as="album">
              <MediaCard
                title={album.title}
                sub={album.sub}
                image={album.image}
                progress={album.progress}
                onClick={<Open page="album" ref={album.ref} />}
              />
            </Each>
            <Each of={data.recentlyAdded.books} as="book">
              <MediaCard
                title={book.title}
                sub={book.sub}
                image={book.image}
                progress={book.progress}
                onClick={<Open page="book" ref={book.ref} />}
              />
            </Each>
            <Each of={data.recentlyAdded.shows} as="show">
              <MediaCard
                title={show.title}
                sub={show.sub}
                image={show.image}
                progress={show.progress}
                onClick={<Open page="show" ref={show.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
        <Section title="Artists & authors" action="arrow_forward" actionLabel="See all">
          <Shelf>
            <Each of={data.people.artists} as="artist">
              <ArtistCard
                title={artist.title}
                sub={artist.sub}
                image={artist.image}
                onClick={<Open page="artist" ref={artist.ref} />}
              />
            </Each>
            <Each of={data.people.authors} as="author">
              <ArtistCard
                title={author.title}
                sub={author.sub}
                image={author.image}
                onClick={<Open page="author" ref={author.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
        <Section title="Picked for you" action="arrow_forward" actionLabel="See all">
          <Shelf>
            <Each of={data.pickedForYou.albums} as="album">
              <MediaCard
                size="sm"
                title={album.title}
                sub={album.sub}
                image={album.image}
                progress={album.progress}
                onClick={<Open page="album" ref={album.ref} />}
              />
            </Each>
            <Each of={data.pickedForYou.books} as="book">
              <MediaCard
                size="sm"
                title={book.title}
                sub={book.sub}
                image={book.image}
                progress={book.progress}
                onClick={<Open page="book" ref={book.ref} />}
              />
            </Each>
            <Each of={data.pickedForYou.shows} as="show">
              <MediaCard
                size="sm"
                title={show.title}
                sub={show.sub}
                image={show.image}
                progress={show.progress}
                onClick={<Open page="show" ref={show.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
        <Section title="Recently played" last>
          <Each of={data.recentlyPlayed} as="track">
            <ResultRow title={track.title} meta={track.meta} image={track.image} divider />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
