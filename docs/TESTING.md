# Testing

AIterLab is designed so the computer can verify the experiment loop automatically.

## Commands

```bash
pnpm run test:syntax
pnpm test
pnpm run test:auto
pnpm run test:cli
pnpm run verify
```

## What Is Tested

`test:evaluator`

- ABCD grade thresholds
- Grade A scoring
- next-candidate recommendation

`test:auto`

- starts the server on a random port
- calls `/api/demo/start`
- waits for auto-iteration
- checks the final grade is A
- checks experiment status is completed

`test:cli`

- runs `aiterlab demo auto`
- checks JSON output
- checks the CLI reaches Grade A

`verify`

- checks JavaScript syntax
- runs all node tests

## Expected Auto-Iteration Result

```text
Grade: A
TargetReached: true
Status: completed
```

## Notes

The tests intentionally use only built-in Node.js APIs. This keeps the first production loop runnable before pnpm/npm dependency installation is available.
