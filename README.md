# tiny-active-focus

A one-file TypeScript **Active Focus loop** for agents.

One goal. A few approaches. An attempt log. A policy that picks the next move:

- `continue`: keep going on the current approach
- `try_alternative`: this approach failed (or stayed blocked) too many times, switch
- `ask_clarify`: the agent cannot choose without you
- `check_in`: the next step is important and nobody approved it yet
- `report_blocked`: blocked with no alternative left, surface it to a human
- `give_up`: out of approaches or budget, stop with a reason

Approaches that use a capability the goal forbids (for example `edit_tests` or `skip_tests`) are dropped before anything runs.

Agent steps are **mocked** with scripted outcomes. No API key. No model call. No network. All goals, files, and branches in the demo are example inputs.

Inspired by the Active Focus behavior Meta describes for Muse Wonder (Oct 12, 2026). This is a small model of the idea, not Meta's implementation.

## Run

```bash
npm install
npx tsx focus.ts
npx tsc --noEmit
```

Expected output is in [`output.txt`](output.txt).

## License

MIT

## Write-up

- Dev.to: https://dev.to/bobbyhalljr/meta-launched-muse-wonder-lets-build-a-tiny-active-focus-loop-in-typescript-4oi9
- Substack: https://bobbyhalljr.substack.com/p/meta-launched-muse-wonder-lets-build
