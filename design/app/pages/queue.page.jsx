export default function Queue({ data }) {
  return (
    <QueuePage
      heading={null}
      context={data.context}
      queues={data.queues}
      queue={data.queue}
      played={data.played}
      items={data.items}
      autoplay={data.autoplay}
    />
  );
}
