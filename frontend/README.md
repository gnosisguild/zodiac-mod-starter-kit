# Tripwire Dashboard

Read-only dashboard skeleton (#16): wallet connect, the demo Safe's address/balance, and the Guard's live configuration (owner, risk registry, frozen state, spending limits).

## Setup

```
cp .env.example .env
npm install
npm run dev
```

`VITE_SAFE_ADDRESS` / `VITE_GUARD_ADDRESS` / `VITE_RISK_REGISTRY_ADDRESS` are unset until #21 deploys real contracts — until then, each card shows a clear "not deployed yet" state instead of fake data.

`VITE_CHAIN` selects the network: `apothem` (default) or `sepolia`.

## What's here vs. what's next

This issue is read-only by design. Writing to the Guard (limits, freeze/unfreeze) is #18's job; the live risk feed is #17's.
