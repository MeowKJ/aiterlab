# Scan Takeover

AIterLab can take over scan experiments through an adapter layer.

The first production-safe step is a dry-run scan. It exercises the same realtime event path as a real scan without moving hardware.

## Current Capabilities

- Start a scan dry-run from the web UI.
- Start a scan dry-run from CLI.
- Stream scan progress into AIterLab.
- Stream each scan point as realtime data.
- Display current X/Y point, completed points, signal, max signal, and mean signal.
- Persist scan events into the experiment history.
- Finalize an AI note for the scan.

## Event Types

```text
scan.started
scan.progress
scan.point
scan.completed
scan.failed
```

## CLI

```bash
pnpm cli scan dry-run --port 4317 --width-mm 30 --height-mm 20 --step-mm 5
```

## Real 60G Scan Bridge

The adapter can build the real command for the existing mmwavelab scanner:

```text
python .\60g\sar_scan_60g.py scan --cli-port COM5 --motor-port COM7 --config .\60g\configs\sar_near_range.cfg --output-prefix captures\aiterlab_scan --width-mm 20 --height-mm 20 --step-mm 10 --z0-mm 200
```

Before AIterLab runs this command against hardware, the operator must confirm:

- radar CLI port
- motor controller port
- scan size
- step size
- z0
- whether homing is required

## Safety Boundary

The current UI button only runs dry-run scan takeover. It does not move motors.

Real hardware takeover must go through a preflight:

- query/ping motor controller
- confirm idle state
- confirm homed state or explicitly home
- use a small smoke scan first
- keep stop available

## Next Implementation Step

Add a `scan real` runner mode that:

- runs the existing Python scan script with `windowsHide`
- parses stdout lines
- watches output folders for files
- emits `scan.progress`, `metric`, `file.created`, and `figure.created`
- cancels and cleans up the process tree on request
