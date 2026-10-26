// Braille-programmable car.
//
// Hardware: Forward Education hub, left + right continuous servos, and seven
// Forward Education dials (knob + push button) chained on Jacdac. The dial
// buttons are used as a braille keyboard:
//   key 0       = end of cell (commits the dots pressed so far)
//   keys 1..6   = braille dots 1..6, pressed in any order before key 0
//
// Writing a program: a letter cell, then a number in lower (Nemeth) digits if
// the command takes one, then the end-line cell (dots 4,6).
//   F n   forward n inches         (1..99)
//   B n   backward n inches        (1..99)
//   R n   turn right n degrees     (1..359)
//   L n   turn left n degrees      (1..359)
//   U n   repeat the commands up to the matching E, n times (1..10)
//   E     end of the open U loop
//   C     clear the program (acts as soon as the cell is committed with
//         key 0: no end line, not stored)
// Dot 6 alone runs the program. While it runs, key 0 pauses; key 0 again
// resumes where it stopped. Dot 6 while paused restarts from the beginning.
// A bad command is dropped with the error buzz and never stored.
// At most MAX_COMMANDS commands (U and E count).
//
// Calibration:
//   Distance and turn timing come from two measured constants,
//   CAL_INCHES_MOVED and WHEEL_GAP_INCHES, so the car is ready at startup.
//   A+B  re-learn the key order (press keys 0..6 in order)
//   A    test calibration: the car drives forward 2 s, you type the inches it
//        moved + end line; then you type the distance between the middles of
//        the two tires in eighths of an inch + end line (4 1/2 inches = 36).
//        Used until restart only; put the numbers in the constants to keep them.
//
// Sounds (the user is blind: every state change is audible):
//   searching     soft tick every 2 s until all dials are found
//   dots 1..6     short tick, higher pitch for higher dot
//   digit 0       one low beep; digits 1..9: that many high beeps
//   F             three notes going up       B   three notes going down
//   R             two high notes             L   two low notes
//   U             fast wobble                E   one long low note
//   C             slide sound (the program is now empty)
//   accepted      one high "ding"            error  low double buzz
//   run / resume  jump up                    pause  jump down
//   program done  power down                 ready  power up
//   calibration   three ticks, then the car moves; "ba-ding" = type the number
//                 (once for inches moved, again for the wheel gap)

// ======================================================================
// Dials (Jacdac)
// ======================================================================

// Each dial has a fixed hardware ID; DIAL_IDS lists them in key order 0..6.
// If a dial is replaced: press A+B, press the keys in order 0..6, and copy
// the "NEW DIAL_IDS" line from USB serial into this list.
const DIAL_IDS = [
    "d6b27299489fbcc0", // 0
    "717ad3c650ae311b", // 1
    "e0e38dea3ec35a4e", // 2
    "68831818f43233d2", // 3
    "607209891991114d", // 4
    "499bd60878c3a0b5", // 5
    "426a0fc6f26d9e33", // 6
]
const NUM_KNOBS = DIAL_IDS.length

// Generic clients; Jacdac binds each to some dial on the chain.
const encClients: fwdButtons.FwdDialClient[] = []
const btnClients: fwdButtons.FwdDialButtonClient[] = []
for (let i = 0; i < NUM_KNOBS; i++) {
    encClients.push(new fwdButtons.FwdDialClient("knobEnc" + i))
    btnClients.push(new fwdButtons.FwdDialButtonClient("knobBtn" + i))
    encClients[i].start()
    btnClients[i].start()
}

// The clients in DIAL_IDS order: buttons[n] is key n
let knobs: fwdButtons.FwdDialClient[] = []
let buttons: fwdButtons.FwdDialButtonClient[] = []

function deviceIdOf(c: jacdac.Client) {
    return c.device ? c.device.deviceId : ""
}

function dialFound(id: string) {
    return encClients.some(c => deviceIdOf(c) == id) && btnClients.some(c => deviceIdOf(c) == id)
}

// Fill knobs[] and buttons[] in the order of the given IDs
function buildArrays(ids: string[]) {
    knobs = []
    buttons = []
    for (const id of ids) {
        knobs.push(encClients.find(c => deviceIdOf(c) == id))
        buttons.push(btnClients.find(c => deviceIdOf(c) == id))
    }
}

// ======================================================================
// Overall state
// ======================================================================

enum Mode {
    Searching, // waiting for all dials at startup
    KeySetup, // A+B: learning the key order
    CalMoving, // calibration test move in progress (keys ignored)
    CalAsk, // calibration waiting for a typed number
    Ready, // typing a program
    Running, // program running
    Paused, // program paused by key 0
}
let mode = Mode.Searching

// ======================================================================
// Sounds
// ======================================================================

// Sounds are queued and played one after another by a background loop, so
// key handlers never wait for a sound and feedback always comes in order.
const soundQueue: (() => void)[] = []
let soundPlaying = false

function say(sound: () => void) {
    soundQueue.push(sound)
}

// Block until every queued sound has finished (used before the car moves)
function waitForSounds() {
    while (soundQueue.length > 0 || soundPlaying) basic.pause(20)
}

control.inBackground(() => {
    while (true) {
        const sound = soundQueue.shift()
        if (sound) {
            soundPlaying = true
            sound()
            soundPlaying = false
        } else {
            basic.pause(10)
        }
    }
})

// Play each frequency for ms, with a short gap between notes
function tones(freqs: number[], ms: number) {
    for (const f of freqs) {
        music.playTone(f, ms)
        basic.pause(30)
    }
}

function melody(m: Melodies) {
    music.play(music.builtInPlayableMelody(m), music.PlaybackMode.UntilDone)
}

const DOT_PITCH = [0, Note.C5, Note.D5, Note.E5, Note.F5, Note.G5, Note.A5]
function dotTick(dot: number) {
    music.playTone(DOT_PITCH[dot], 40)
}

function sayNumber(n: number) {
    if (n == 0) {
        music.playTone(Note.C3, music.beat(BeatFraction.Quarter))
        return
    }
    for (let i = 0; i < n; i++) {
        music.playTone(Note.C5, music.beat(BeatFraction.Sixteenth))
        basic.pause(120)
    }
}

function buzz() {
    music.playTone(Note.C3, music.beat(BeatFraction.Sixteenth))
    basic.pause(60)
    music.playTone(Note.C3, music.beat(BeatFraction.Sixteenth))
}

function acceptSound() {
    music.playTone(Note.E5 * 2, 150) // E6
}

function ready() {
    melody(Melodies.PowerUp)
}

// Show text on the LEDs without holding up the caller (extra, for sighted helpers)
function show(text: string) {
    control.inBackground(() => basic.showString(text))
}

// ======================================================================
// Motors
// ======================================================================

// Left wheel goes forward with +speed, right wheel with -speed (it is mounted
// facing the other way). These servos run slower turning in their negative
// direction, so negative speeds are boosted by REVERSE_TRIM to keep the car
// straight. Tune it if the car drifts: drifts toward the right while going
// forward means the right wheel is still slow, so raise it.
const DRIVE_SPEED = 50 // percent, 1..100; calibration uses the same speed
const REVERSE_TRIM = 1.25
const STEP_GAP_MS = 200 // settle time between program steps

function trimmed(speed: number) {
    return speed < 0 ? Math.max(-100, speed * REVERSE_TRIM) : speed
}

function setWheels(left: number, right: number) {
    // run() puts the hub in continuous-servo mode (fwdMotors.drive uses angle mode)
    fwdBase.leftServo.run(trimmed(left))
    fwdBase.rightServo.run(trimmed(right))
}

function stopWheels() {
    fwdBase.leftServo.run(0)
    fwdBase.rightServo.run(0)
}

// ======================================================================
// Calibration values (ms of driving per inch / per degree of turn)
// ======================================================================

// Measured on this car: a CAL_MS drive at DRIVE_SPEED went CAL_INCHES_MOVED,
// and the middles of the two tires are WHEEL_GAP_INCHES apart. Spinning in
// place, each wheel rolls around a circle whose diameter is the wheel gap, so
// 360 degrees = pi * gap inches of rolling. Re-measure if the car changes.
const CAL_MS = 2000 // length of the calibration test move
const CAL_INCHES_MOVED = 13.5
const WHEEL_GAP_INCHES = 5.5
let msPerInch = CAL_MS / CAL_INCHES_MOVED
let msPerDegree = (msPerInch * Math.PI * WHEEL_GAP_INCHES) / 360

// ======================================================================
// Braille cells
// ======================================================================

// A cell is a bitmask: dot d sets bit d (bits 1..6). dots("1235") = letter r.
function dots(list: string): number {
    let mask = 0
    for (let i = 0; i < list.length; i++) mask |= 1 << parseInt(list.charAt(i))
    return mask
}

const END_LINE = dots("46")
const RUN_CELL = dots("6")
// Letters and digits follow North American Computer Braille Code (NABCC),
// as in liblouis tables/text_nabcc.dis. Its digits are the lower-cell
// (Nemeth) digits.
// a..z; index = letter - "a"
const LETTER_CELLS = [
    "1", "12", "14", "145", "15", "124", "1245", "125", "24", "245", // a-j
    "13", "123", "134", "1345", "135", "1234", "12345", "1235", "234", "2345", // k-t
    "136", "1236", "2456", "1346", "13456", "1356", // u-z
].map(dots)
// 0..9; index = digit value
const DIGIT_CELLS = ["356", "2", "23", "25", "256", "26", "235", "2356", "236", "35"].map(dots)
const MAX_DIGITS = 3

// Cell of a letter, either case: letterCell("F") = dots 1,2,4
function letterCell(letter: string) {
    return LETTER_CELLS[letter.toLowerCase().charCodeAt(0) - 97]
}

function digitOf(cell: number) {
    return DIGIT_CELLS.indexOf(cell) // -1 if not a digit
}

// ======================================================================
// Commands
// ======================================================================

// To add a command, add one entry to COMMANDS with letterCell(its letter) and a
// sound unlike the others. Cells are looked up in tables (COMMANDS and
// DIGIT_CELLS), so any braille letter works; checkCells() at startup reports
// a cell that clashes with another command, a digit, end line or run.
interface CommandDef {
    letter: string // shown on the display and in serial logs
    cell: number // braille dots of the letter
    min: number // allowed number range; max = 0 means no number
    max: number
    stored: boolean // true: saved into the program; false: acts at once when entered
    sound: () => void // played when the letter is typed; must be distinguishable
    canEnter: () => boolean // extra check when the letter is typed (false = error)
    // stored: runs during the program; returns false if paused mid-step.
    // not stored: runs right after the command is entered.
    action: (n: number) => boolean
}

interface Step {
    def: CommandDef
    arg: number
}

// An open U loop while running: where its body starts and passes left
interface LoopFrame {
    start: number
    left: number
}

const MAX_COMMANDS = 100
let program: Step[] = []

// Runner position; kept across pause/resume
let pc = 0
let loopStack: LoopFrame[] = []
let stepMsLeft = 0 // time left in the current move (0 = no move in progress)

function always() {
    return true
}

// Loops typed but not yet closed with E
function openLoops() {
    let open = 0
    for (const step of program) {
        if (step.def.letter == "U") open++
        else if (step.def.letter == "E") open--
    }
    return open
}

// Run the wheels for ms, in slices so a pause can stop it part way.
// Returns false if paused; the remaining time stays in stepMsLeft.
function timedMove(left: number, right: number, ms: number) {
    if (stepMsLeft <= 0) stepMsLeft = ms
    setWheels(left, right)
    let last = control.millis()
    while (stepMsLeft > 0) {
        if (mode != Mode.Running) {
            stopWheels()
            return false
        }
        basic.pause(20)
        const now = control.millis()
        stepMsLeft -= now - last
        last = now
    }
    stepMsLeft = 0
    stopWheels()
    basic.pause(STEP_GAP_MS)
    return true
}

function clearProgram() {
    program = []
    pc = 0
    loopStack = []
    stepMsLeft = 0
    if (mode == Mode.Paused) mode = Mode.Ready
    serial.writeLine("program cleared")
    return true
}

const S = DRIVE_SPEED
const COMMANDS: CommandDef[] = [
    {
        letter: "F", cell: letterCell("F"), min: 1, max: 99, stored: true,
        sound: () => tones([Note.C5, Note.E5, Note.G5], 100),
        canEnter: always,
        action: n => timedMove(S, -S, n * msPerInch),
    },
    {
        letter: "B", cell: letterCell("B"), min: 1, max: 99, stored: true,
        sound: () => tones([Note.G5, Note.E5, Note.C5], 100),
        canEnter: always,
        action: n => timedMove(-S, S, n * msPerInch),
    },
    {
        letter: "R", cell: letterCell("R"), min: 1, max: 359, stored: true,
        sound: () => tones([Note.C5 * 2, Note.C5 * 2], 80), // C6
        canEnter: always,
        action: n => timedMove(S, S, n * msPerDegree),
    },
    {
        letter: "L", cell: letterCell("L"), min: 1, max: 359, stored: true,
        sound: () => tones([Note.C4, Note.C4], 80),
        canEnter: always,
        action: n => timedMove(-S, -S, n * msPerDegree),
    },
    {
        letter: "U", cell: letterCell("U"), min: 1, max: 10, stored: true,
        sound: () => tones([Note.C5, Note.D5, Note.C5, Note.D5, Note.C5], 60),
        canEnter: always,
        action: n => {
            loopStack.push({ start: pc + 1, left: n })
            return true
        },
    },
    {
        letter: "E", cell: letterCell("E"), min: 0, max: 0, stored: true,
        sound: () => tones([Note.G4], 400),
        canEnter: () => openLoops() > 0,
        action: () => {
            const top = loopStack[loopStack.length - 1]
            if (!top) return true
            top.left--
            // the runner adds 1 after each step, so land just before the body
            if (top.left > 0) pc = top.start - 1
            else loopStack.pop()
            return true
        },
    },
    {
        letter: "C", cell: letterCell("C"), min: 0, max: 0, stored: false,
        sound: () => music.play(music.builtinPlayableSoundEffect(soundExpression.slide), music.PlaybackMode.UntilDone),
        canEnter: always,
        action: () => clearProgram(),
    },
]

function letterOf(cell: number) {
    return COMMANDS.find(c => c.cell == cell)
}

// Every command cell must differ from the other commands and from the
// digit, end-line and run cells. Returns false (and logs why) on a clash.
function checkCells() {
    const used: number[] = DIGIT_CELLS.concat([END_LINE, RUN_CELL])
    let ok = true
    for (const def of COMMANDS) {
        if (used.indexOf(def.cell) >= 0) {
            serial.writeLine("CELL CLASH: " + def.letter + " uses dots mask " + def.cell)
            ok = false
        }
        used.push(def.cell)
    }
    return ok
}

// ======================================================================
// Parser: turns committed cells into commands
// ======================================================================

let chord = 0 // dots pressed since the last key 0
let pending: CommandDef = null // command being typed (letter seen, waiting for number / end line)
let digits = "" // digits typed for pending
// What pending falls back to after a command or error: null while
// programming, a calibration prompt while calibrating.
let basePending: CommandDef = null

function setPrompt(def: CommandDef) {
    basePending = def
    pending = def
    digits = ""
    chord = 0
}

// Drop the command being typed
function reject(reason: string) {
    serial.writeLine("ERROR: " + reason)
    pending = basePending
    digits = ""
    show("X")
    say(buzz)
}

// A key was pressed (key = 0..6)
function onKey(key: number) {
    if (mode == Mode.Searching || mode == Mode.KeySetup || mode == Mode.CalMoving) return
    if (mode == Mode.Running) {
        if (key == 0) pauseProgram()
        return
    }
    if (key != 0) {
        chord |= 1 << key
        say(() => dotTick(key))
        return
    }
    const cell = chord
    chord = 0
    handleCell(cell)
}

// A full cell was committed with key 0
function handleCell(cell: number) {
    if (cell == 0) {
        // key 0 alone: resume a paused program
        if (mode == Mode.Paused && pending == null) resumeProgram()
        return
    }

    if (pending == null) {
        // expecting a letter (or the run cell)
        if (cell == RUN_CELL) {
            startProgram()
            return
        }
        const def = letterOf(cell)
        if (!def) return reject("unknown letter, dots mask " + cell)
        if (def.stored && program.length >= MAX_COMMANDS) return reject("program full")
        if (!def.canEnter()) return reject(def.letter + " not allowed here")
        if (!def.stored && def.max == 0) {
            // nothing more to type (C): act now, no end line needed
            show(def.letter)
            say(def.sound)
            def.action(0)
            return
        }
        pending = def
        digits = ""
        show(def.letter)
        say(def.sound)
        return
    }

    if (cell == END_LINE) {
        finishCommand()
        return
    }

    const d = digitOf(cell)
    if (pending.max > 0 && d >= 0) {
        if (digits.length >= MAX_DIGITS) return reject("too many digits")
        digits += d
        show("" + d)
        say(() => sayNumber(d))
        return
    }
    reject("expected " + (pending.max > 0 ? "a digit or " : "") + "end line")
}

// End line typed: check the number and store or act on the command
function finishCommand() {
    const def = pending
    let n = 0
    if (def.max > 0) {
        if (digits == "") return reject("missing number")
        n = parseInt(digits)
        if (n < def.min || n > def.max) return reject(def.letter + " needs " + def.min + ".." + def.max + ", got " + n)
    }
    pending = basePending
    digits = ""
    say(acceptSound)
    if (def.stored) {
        program.push({ def: def, arg: n })
        serial.writeLine("ADD " + def.letter + (def.max > 0 ? " " + n : "") + " (" + program.length + "/" + MAX_COMMANDS + ")")
    } else {
        def.action(n)
    }
}

// ======================================================================
// Runner
// ======================================================================

let runnerActive = false // a runProgram fiber exists

function runProgram() {
    while (mode == Mode.Running && pc < program.length) {
        const step = program[pc]
        serial.writeLine("RUN " + pc + ": " + step.def.letter + " " + step.arg)
        if (!step.def.action(step.arg)) break // paused mid-step
        pc++
    }
    runnerActive = false
    if (mode == Mode.Running) {
        // reached the end
        mode = Mode.Ready
        pc = 0
        loopStack = []
        serial.writeLine("program done")
        say(() => melody(Melodies.PowerDown))
    }
}

function launchRunner() {
    mode = Mode.Running
    if (runnerActive) return // the old fiber has not noticed the pause yet; it carries on
    runnerActive = true
    control.inBackground(() => {
        waitForSounds()
        runProgram()
    })
}

function startProgram() {
    if (program.length == 0) return reject("program is empty")
    if (openLoops() > 0) return reject("U loop not closed with E")
    pc = 0
    loopStack = []
    stepMsLeft = 0
    serial.writeLine("program start, " + program.length + " commands")
    say(() => melody(Melodies.JumpUp))
    launchRunner()
}

function pauseProgram() {
    mode = Mode.Paused
    serial.writeLine("paused at " + pc)
    say(() => melody(Melodies.JumpDown))
}

function resumeProgram() {
    serial.writeLine("resume at " + pc)
    say(() => melody(Melodies.JumpUp))
    launchRunner()
}

// ======================================================================
// Motion calibration
// ======================================================================

// The typed answers reuse the parser: these prompts act like commands that
// take only a number and run as soon as end line is typed.
const CAL_INCHES: CommandDef = {
    letter: "in", cell: 0, min: 1, max: 99, stored: false,
    sound: acceptSound, canEnter: always,
    action: n => {
        msPerInch = CAL_MS / n
        serial.writeLine("CAL: " + n + " inches, ms/inch=" + msPerInch)
        // next: the wheel gap (no move needed)
        setPrompt(CAL_WHEEL_GAP)
        serial.writeLine("CAL: type wheel gap in eighths of an inch then end line")
        say(() => melody(Melodies.BaDing))
        return true
    },
}

// Distance between the middles of the two tires, in eighths of an inch
// (braille has no usable decimal point here: Nemeth's is dots 4,6 = end line).
// Spinning in place, each wheel rolls around a circle whose diameter is the
// wheel gap, so 360 degrees = pi * gap inches of rolling.
const CAL_WHEEL_GAP: CommandDef = {
    letter: "gap", cell: 0, min: 8, max: 160, stored: false,
    sound: acceptSound, canEnter: always,
    action: n => {
        const gapInches = n / 8
        msPerDegree = (msPerInch * Math.PI * gapInches) / 360
        serial.writeLine("CAL: gap " + gapInches + " inches, ms/degree=" + msPerDegree)
        serial.writeLine("CAL: used until restart; put the numbers in CAL_INCHES_MOVED / WHEEL_GAP_INCHES to keep them")
        setPrompt(null)
        mode = Mode.Ready
        say(ready)
        return true
    },
}

// Three ticks, drive for CAL_MS, then ask for the number with "ba-ding"
function calibrationMove(left: number, right: number, prompt: CommandDef) {
    mode = Mode.CalMoving
    setPrompt(null)
    control.inBackground(() => {
        say(() => tones([Note.G4, Note.G4, Note.G4], 100))
        waitForSounds()
        basic.pause(1000)
        setWheels(left, right)
        basic.pause(CAL_MS)
        stopWheels()
        setPrompt(prompt)
        mode = Mode.CalAsk
        serial.writeLine("CAL: type " + prompt.letter + " then end line")
        say(() => melody(Melodies.BaDing))
    })
}

function startMotionCalibration() {
    serial.writeLine("CAL: driving forward " + CAL_MS + " ms")
    calibrationMove(S, -S, CAL_INCHES)
}

// ======================================================================
// Key order setup (A+B)
// ======================================================================

let learned: string[] = []

function startKeySetup() {
    mode = Mode.KeySetup
    setPrompt(null)
    learned = []
    serial.writeLine("SETUP: press key 0")
    say(() => tones([Note.C, Note.E, Note.G], music.beat(BeatFraction.Eighth)))
}

function keySetupPress(btn: fwdButtons.FwdDialButtonClient) {
    const id = deviceIdOf(btn)
    if (!id || learned.indexOf(id) >= 0) {
        say(buzz)
        return
    }
    learned.push(id)
    const n = learned.length - 1
    serial.writeLine("SETUP: key " + n + " = " + id)
    say(() => sayNumber(n))
    if (learned.length == NUM_KNOBS) {
        buildArrays(learned)
        serial.writeLine("NEW DIAL_IDS: " + learned.join(","))
        mode = Mode.Ready
        say(ready)
    }
}

// ======================================================================
// Inputs
// ======================================================================

for (let i = 0; i < NUM_KNOBS; i++) {
    const btn = btnClients[i]
    btn.onEvent(jacdac.ButtonEvent.Down, () => {
        if (mode == Mode.KeySetup) keySetupPress(btn)
        else {
            const key = buttons.indexOf(btn)
            if (key >= 0) onKey(key)
        }
    })
}

input.onButtonPressed(Button.AB, () => {
    if (mode == Mode.Searching || mode == Mode.CalMoving) return
    serial.writeLine("A+B: key setup")
    startKeySetup()
})

input.onButtonPressed(Button.A, () => {
    if (mode == Mode.Searching || mode == Mode.CalMoving || mode == Mode.KeySetup) return
    if (mode == Mode.Running) pauseProgram()
    serial.writeLine("A: motion calibration")
    startMotionCalibration()
})

// ======================================================================
// Startup
// ======================================================================

// wait (ticking) until every dial in DIAL_IDS is found
while (!DIAL_IDS.every(dialFound)) {
    serial.writeLine("searching: missing " + DIAL_IDS.filter(id => !dialFound(id)).join(","))
    music.playTone(Note.G3, music.beat(BeatFraction.Sixteenth))
    basic.pause(2000)
}
buildArrays(DIAL_IDS)
serial.writeLine("all " + NUM_KNOBS + " dials found")
fwdMotors.setupDriving(fwdBase.leftServo, fwdBase.rightServo)
serial.writeLine("motors ready")
serial.writeLine("ms/inch=" + msPerInch + " ms/deg=" + msPerDegree)
if (!checkCells()) say(buzz)
mode = Mode.Ready
say(ready)
