// Square test: drives a square so you can check that 90 degree turns are right.
//
// The micro:bit buttons can't be reached in the hub, so the dial keys are used:
//   key 1 = square turning right, key 2 = square turning left,
//   key 0 = stop the square early.
// Each side is SIDE_INCHES long. If the turns are right, the car ends where
// it started, facing the same way.
//
// Sounds:
//   searching     soft tick every 2 s until all dials are found
//   ready         power up (press key 1 or 2)
//   start         three ticks, then the car moves after 1 s
//   each side     one beep per side number (1..4) before the turn
//   done          power down
//   stopped       jump down (key 0)
//
// The dial IDs and motion numbers below are copied from forward-project/main.ts;
// keep them the same so this test drives the way the real program does.

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

// Generic clients; Jacdac binds each to some dial on the chain. Only the
// buttons are used, but the encoders are started too, as in the main program.
const encClients: fwdButtons.FwdDialClient[] = []
const btnClients: fwdButtons.FwdDialButtonClient[] = []
for (let i = 0; i < NUM_KNOBS; i++) {
    encClients.push(new fwdButtons.FwdDialClient("knobEnc" + i))
    btnClients.push(new fwdButtons.FwdDialButtonClient("knobBtn" + i))
    encClients[i].start()
    btnClients[i].start()
}

function deviceIdOf(c: jacdac.Client) {
    return c.device ? c.device.deviceId : ""
}

function dialFound(id: string) {
    return btnClients.some(c => deviceIdOf(c) == id)
}

// Key number (0..6) of a button client, -1 if not a known dial
function keyOf(btn: fwdButtons.FwdDialButtonClient) {
    return DIAL_IDS.indexOf(deviceIdOf(btn))
}

const DRIVE_SPEED = 50
const REVERSE_TRIM = 1.25
const STEP_GAP_MS = 200
const CAL_MS = 2000
const CAL_INCHES_MOVED = 13.5
const WHEEL_GAP_INCHES = 5.5
const msPerInch = CAL_MS / CAL_INCHES_MOVED
// The car turns less than the wheel gap predicts (the tires slip when spinning
// in place). TURN_TRIM stretches turn time: a 90 turn that came out as 45 means 2.
const TURN_TRIM = 1.0
const msPerDegree = (TURN_TRIM * msPerInch * Math.PI * WHEEL_GAP_INCHES) / 360

const SIDE_INCHES = 12
const TURN_DEGREES = 90

let busy = false
let stopRequested = false

function trimmed(speed: number) {
    return speed < 0 ? Math.max(-100, speed * REVERSE_TRIM) : speed
}

function setWheels(left: number, right: number) {
    fwdBase.leftServo.run(trimmed(left))
    fwdBase.rightServo.run(trimmed(right))
}

function stopWheels() {
    fwdBase.leftServo.run(0)
    fwdBase.rightServo.run(0)
}

// Run the wheels for ms in 20 ms slices; returns false if key 0 stopped it
function move(left: number, right: number, ms: number) {
    setWheels(left, right)
    const end = control.millis() + ms
    while (control.millis() < end) {
        if (stopRequested) {
            stopWheels()
            return false
        }
        basic.pause(20)
    }
    stopWheels()
    basic.pause(STEP_GAP_MS)
    return true
}

function beeps(n: number) {
    for (let i = 0; i < n; i++) {
        music.playTone(Note.C5, music.beat(BeatFraction.Sixteenth))
        basic.pause(120)
    }
}

function square(right: boolean) {
    if (busy) return
    busy = true
    stopRequested = false
    const S = DRIVE_SPEED
    serial.writeLine("square " + (right ? "right" : "left") + ": side " + SIDE_INCHES + " in = " + SIDE_INCHES * msPerInch + " ms, turn " + TURN_DEGREES + " = " + TURN_DEGREES * msPerDegree + " ms")
    for (let i = 0; i < 3; i++) {
        music.playTone(Note.G4, 100)
        basic.pause(30)
    }
    basic.pause(1000)
    let ok = true
    for (let side = 1; side <= 4 && ok; side++) {
        ok = move(S, -S, SIDE_INCHES * msPerInch)
        if (!ok) break
        beeps(side)
        if (right) ok = move(S, S, TURN_DEGREES * msPerDegree)
        else ok = move(-S, -S, TURN_DEGREES * msPerDegree)
    }
    if (ok) {
        serial.writeLine("square done")
        music.play(music.builtInPlayableMelody(Melodies.PowerDown), music.PlaybackMode.UntilDone)
    } else {
        serial.writeLine("square stopped")
        music.play(music.builtInPlayableMelody(Melodies.JumpDown), music.PlaybackMode.UntilDone)
    }
    busy = false
}

let started = false

for (const btn of btnClients) {
    btn.onEvent(jacdac.ButtonEvent.Down, () => {
        if (!started) return
        const key = keyOf(btn)
        if (key == 0) {
            if (busy) stopRequested = true
        } else if (key == 1) control.inBackground(() => square(true))
        else if (key == 2) control.inBackground(() => square(false))
    })
}

// wait (ticking) until every dial in DIAL_IDS is found
while (!DIAL_IDS.every(dialFound)) {
    serial.writeLine("searching: missing " + DIAL_IDS.filter(id => !dialFound(id)).join(","))
    music.playTone(Note.G3, music.beat(BeatFraction.Sixteenth))
    basic.pause(2000)
}
serial.writeLine("all " + NUM_KNOBS + " dials found")
started = true

fwdMotors.setupDriving(fwdBase.leftServo, fwdBase.rightServo)
serial.writeLine("square test ready: key 1 = right turns, key 2 = left turns, key 0 = stop")
music.play(music.builtInPlayableMelody(Melodies.PowerUp), music.PlaybackMode.UntilDone)
