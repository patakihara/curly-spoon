# Opening a digest switches to its own queue and saves the previous one

> I thought more about the digest.
>
> I think what I meant was that, when I press play on a digest, it gets added to the queue "as a single block" in a sense, _without deleting what else was there_. But the rest of the specification isn't really covering this, because I've talked about items being added one by one. I also talked about having two different queue styles, the spotify queue and the yt music queue, which just adds more complication. clearly i need to think about this more.
>
> [...]
>
> But since we're already supposed to have space for multiple queues (a music queue + a spoken queue, plus a queue per device/listening session), let's just say that opening a digest also switches over to a different queue (dig-queue), and that the queue i had previously (prev-queue) is somehow saved. how to get back to that prev-queue later is a different story, but for now we can go with me pressing play on the episode the prev-queue was on (or the next one up if the current episode had just finished). but getting back on the dig-queue requires pressing play on the digest (or on any episode in the digest from inside the digest page).

The part left out above is her list of open queue topics, which is in `docs/outbox/queue-design-questions.md`.

(Sofia, comment on the plan artifact, thread 785d7862, 2026-09-30)
