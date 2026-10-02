# Web: reload a stale tab when the server's commit changes

> should the web validate responses with zod too

> yeah file it

(Sofia, chat in a laptop session, 2026-10-02)

Context from that chat: the server already parses every answer through its response schema
(`server/src/route.ts`), so zod on the web would repeat that check. The one gap left is an old tab
left open across a deploy. `/api/health` already returns the server's commit; the web can compare
it with the commit it was built from and reload on a mismatch. Sofia said to file this instead.
