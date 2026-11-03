# Baseten fallback (D8): owner setup

When the primary engine (Meta Muse Spark) runs past its deadline, Yori asks **one** fast Baseten LLM
once and labels the answer `Baseten fallback · <model>`. Muse Spark stays the primary engine; a
Baseten answer is never shown as Muse Spark. Any other Muse Spark failure (an HTTP error, an invalid
answer, or the budget) never calls Baseten.

**Paid Baseten use is not authorized yet.** It needs the owner's separate decision. Until then, leave
it off.

## Values (typed into `.env.local` by the owner, never in chat)

```
BASETEN_API_KEY=<your Baseten API key>
BASETEN_FALLBACK_MODEL=<org/model slug from Baseten Model APIs, e.g. openai/gpt-oss-120b>
BASETEN_LIVE_ENABLED=0   # set to 1 only after you authorize paid fallback calls
```

- **Prefix:** never use a `VITE_` prefix.
- **Bad slug:** a missing or malformed slug (`org/model`) keeps the fallback off, and the
  labelled offline answer is used instead.

## Limits (code-enforced, in `.yori-runtime/baseten-ledger.json`)

- **Call cap:** 20 calls (`BASETEN_OPERATING_CAP` can only lower it).
- **Spend cap:** USD 10 (`BASETEN_USD_SUBCAP` can only lower it).
- **Pre-charge:** each call reserves a worst-case cost first, (3,000 + 600 tokens) × USD 3.00 per 1M,
  which is **UNVERIFIED**. The reservation is corrected to real usage when the response reports it.
  The cap check happens before any request.
- **Sent to Baseten:** the same validated prompt and admitted facts as Muse Spark (candidate names,
  distances, ratings, prices, open state; confirmed facts). No coordinates and no identifiers.
