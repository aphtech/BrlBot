# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A MakeCode (micro:bit V2) TypeScript program for a robot built from Forward Education parts: a Forward Education hub driving two wheel servos, plus seven Forward Education dials (rotary encoder + push button) chained over Jacdac. The only hand-written code is `forward-project/main.ts`. Everything under `forward-project/pxt_modules/` is downloaded dependency source (MakeCode core, Jacdac, Forward Education's `fwd-*` modules pulled in by `all-fwd-blocks`); read it for API reference but don't edit it.

## Commands

All commands run from `forward-project/` (where `pxt.json` lives). Running them from the repo root fails.

- Build: `mkc` (or `npx makecode`, which is what CI in `.github/workflows/makecode.yml` runs). Output: `built/binary.hex`.
- Build and deploy to a plugged-in micro:bit: `mkc -d`
- Fallback deploy: `mkc; Copy-Item built\binary.hex D:\` (drive letter may differ)
- There are no tests or linter. Formatting follows `.prettierrc` (4-space indent, no semicolons, `arrowParens: avoid`).

`mkc -d` finds the MICROBIT drive by calling `wmic`, which this Windows build lacks. A `wmic.cmd` shim in the user's npm global folder stands in for it. `install-wmic.ps1` and the `*wmic*.txt` files are notes from earlier attempts to install the real WMIC with DISM, and are not part of the build.

## How main.ts is structured

- **Dial identity**: Jacdac binds generic clients (`fwdButtons.FwdDialClient` / `FwdDialButtonClient`) to whichever dial it finds, in no fixed order. `DIAL_IDS` pins the logical order 0..6 to hardware device IDs. `buildArrays()` maps the generic clients into `knobs[]` / `buttons[]` in that order. Program logic should use `knobs[n]` / `buttons[n]`, not `encClients` / `btnClients`.
- **Braille keyboard**: the program is a braille-programmable car. Keys 1–6 are dots and key 0 ends a cell. A cell is a bitmask (`dots("1235")`). The header comment in `main.ts` is the user-facing spec: commands, cells and sounds.
- **Command table**: each command is one `CommandDef` entry in `COMMANDS` (letter, cell, number range, stored vs immediate, sound, `canEnter` check, `action`). To add a command, add an entry. The parser (`handleCell` / `finishCommand`) and runner (`runProgram`) are generic over the table.
- **Modes**: the global `mode` (`Mode` enum) gates all input. `pending` is the command being typed. `basePending` is what `pending` resets to: null while programming, or a calibration prompt (`CAL_INCHES` / `CAL_WHEEL_GAP`, which are `CommandDef`s that take only a number). Calibration answers therefore reuse the parser.
- **Runner**: runs in a background fiber. `pc`, `loopStack` (U/E) and `stepMsLeft` survive a pause, so key 0 resumes mid-move. `timedMove` runs in 20 ms slices and polls `mode`. Distances and angles become milliseconds through `msPerInch` / `msPerDegree`, which are worked out from the measured constants `CAL_INCHES_MOVED` and `WHEEL_GAP_INCHES`. Calibrating with button A changes them only until restart.
- **Sounds**: all sounds go through `say()`, a queue played by a background loop, so handlers never block. Use `waitForSounds()` before moving.
- **Startup**: blocks until every ID in `DIAL_IDS` is found (ticking every 2 s), then goes straight to Ready. A+B re-learns the key order, because the micro:bit's reset button can't be reached in the hub; A runs a motion calibration that lasts until restart.
- **Motors**: `setWheels(left, right)`. Forward is `(+s, -s)` because the right servo is mounted mirrored; negative speeds are boosted by `REVERSE_TRIM`. `run()` uses continuous-servo mode; `fwdMotors.drive` uses angle mode.

## Conventions

- **All status feedback must be audible** (tones, beep counts, melodies). The user is blind, so the LED display can never be the only signal. The header comment in `main.ts` documents what each sound means; keep it updated when you change any sound.
- **Debug over USB serial** with `serial.writeLine` and read the micro:bit COM port yourself (find it by USB VID `0D28`; the port number changes after replug). Don't ask the user to describe the display.

## Hardware gotchas

- The hub's power switch must be on, and the dial chain must be plugged into the hub's chain port, not a motor port. In a motor port only the hub's own services show up.
- Pushing the micro:bit into the hub can boot it into MAINTENANCE mode. Never copy a .hex to the MAINTENANCE drive; ask the user to replug instead.
- Driving needs continuous-rotation servos. A positional servo steps to an angle and holds it even when the hub sends the right signal.
