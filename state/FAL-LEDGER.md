# fal.ai ledger

Cap **$10.00**, absolute. No new call starts at or past **$9.50**. Written by `tools/gen/fal-call.mjs`
only: the row is appended as `pending` before the request is sent, so a crash cannot hide a charge.

Every row counts toward the total at its listed price, with one exception: `rejected` means fal
answered the submit with a non-2xx status and never accepted the job, so it is listed at its price
but counted as $0.0000. `failed`, `pending` and `unknown` rows count in full.

| # | time (UTC) | endpoint | for | listed price | counted | request id | status | running total |
|---|---|---|---|---|---|---|---|---|
