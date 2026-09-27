---
title: The plan's budget bullet states the limits twice
area: process
kind: bug
filed: 2026-09-28, mediaserver
---

In docs/plan/14-process.md, the "Budget, the queue plugin's method" bullet lists the limits, then
repeats them under "One set of limits for starting and stopping". Merge them into one clear bullet:
one set of limits (5-hour window under 80%, week under 95%, weekly share above zero) decides both
starting and stopping; warnings come 5 points before either window's limit or when the share is
nearly used up; the share is a cap on total weekly use that rises as waking hours pass; restarts
wake at the tripped limit's reset and resume the same session.

(Found by the mediaserver session while fixing the gate's usage report.)
