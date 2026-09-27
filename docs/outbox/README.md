# docs/outbox

One file per item that genuinely needs Sofia. Each file starts with two lines:

    kind: product call | name | published | irreversible | physical
    default: what happens if she does not answer

Only those five kinds belong here. Work goes ahead on the default; only irreversible or
outward-facing actions wait. Answered items are deleted.
