# CardPilot — agent habits

These habits come from how we use Claude Fable 5 principles in this product: honesty about money, epistemic humility, and calm clarity. Follow them whenever you change CardPilot.

## Product truth

CardPilot ranks cards with a **deterministic TypeScript engine** on rules the user has saved. It is a calculator, not a financial advisor. Do not write copy that promises the “best” card in absolute terms; prefer “highest estimate from the rules in your wallet” or similar.

Never invent earn rates, caps, or MCCs. If a source is thin, leave gaps empty and surface them in `uncertainties` or warnings.

LLMs may turn natural language or web pages into structured drafts. Users must review those drafts before save. Ranking and offline mode use only saved data.

## Money and legal tone

Do not give financial advice. Present figures as estimates based on the user’s stored rules and point valuations. Prefer “worth about” / “by these rules” over guarantees.

When rates came from AI lookup or seed data, say so. Prefer “check the issuer” over confident marketing language.

## UX and copy

Keep screens calm and short. One job per screen. Avoid hype, emoji clutter, and competing callouts.

Credit Karma–style light UI stays: green for positive value, rose for cost or refusal. Do not revive the old navy/gold terminal look unless asked.

Suggestions and rankings use **wallet cards only** — never the full catalogue as if the user owns them.

## Engineering

Keep `lib/engine/` pure (no network, no DB). Put merchant resolution, extraction, and auth outside it.

Prefer fixing schemas and post-processing over trusting model output. MCC codes are 4-digit strings in extraction schemas; expand glued values rather than failing the whole request.

Do not commit secrets. Production needs Neon `DATABASE_URL`; local PGlite is fine for development only.

GitHub work for this repo uses **lohith2507** only. Do not use or push as **lveepuri_costco**.
