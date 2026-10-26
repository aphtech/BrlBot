# BrlBot: a braille-programmable car

BrlBot is a small car that you program with braille. Seven dials on the car
work as a braille keyboard. You type a list of driving commands, then run
them, and the car carries them out in order. Every step makes a sound, so
you can use it entirely by ear.

## The keyboard

The seven dial buttons are keys 0 to 6.

- Keys 1 to 6 are braille dots 1 to 6.
- Key 0 ends a cell.

To type one braille cell, press the dots it needs, in any order, then press
key 0. Each dot plays a short tick, and higher dots play higher ticks. The
cell counts only when you press key 0.

For example, to type the letter F (dots 1-2-4), press key 1, key 2 and key 4,
then key 0.

## Writing a command

Each command is made of up to three parts, typed as cells:

1. The command letter.
2. A number, if the command takes one.
3. The end-line cell, dots 4-6.

When the end line is accepted you hear one high "ding", and the command is
added to the end of your program.

### The commands

- **F**, dots 1-2-4: forward. Takes a number of inches, 1 to 99.
  Sound: three notes going up.
- **B**, dots 1-2: backward. Takes a number of inches, 1 to 99.
  Sound: three notes going down.
- **R**, dots 1-2-3-5: turn right on the spot. Takes a number of degrees,
  1 to 359. Sound: two high notes.
- **L**, dots 1-2-3: turn left on the spot. Takes a number of degrees,
  1 to 359. Sound: two low notes.
- **U**, dots 1-3-6: start a loop. Takes the number of times to repeat,
  1 to 10. Sound: a fast wobble.
- **E**, dots 1-5: end the loop. No number. Sound: one long low note.
- **C**, dots 1-4: clear the whole program. No number. It acts as soon as
  you type the end line, and it is not stored in the program.
  Sound: a slide.

### Numbers

Numbers use the lower-cell (Nemeth) digits, one cell per digit, with no
number sign in front. A number can have up to 3 digits.

- 1: dot 2
- 2: dots 2-3
- 3: dots 2-5
- 4: dots 2-5-6
- 5: dots 2-6
- 6: dots 2-3-5
- 7: dots 2-3-5-6
- 8: dots 2-3-6
- 9: dots 3-5
- 0: dots 3-5-6

After each digit, the car beeps it back to you. Digits 1 to 9 play that
many high beeps, and 0 plays one low beep. So 12 sounds like one beep, then
two beeps.

## Running a program

- **Run:** type dot 6 on its own (key 6, then key 0). You hear a rising
  "jump up" sound, and the car starts.
- **Pause:** press key 0 while the car is moving. You hear a falling
  "jump down" sound, and the car stops.
- **Resume:** press key 0 again while paused. The car finishes the move it
  was in, then carries on.
- **Start over:** type dot 6 while paused. The program runs again from the
  beginning.
- **Done:** at the end of the program you hear a "power down" sound.

The program stays in memory after it runs, so dot 6 runs it again. You can
also add more commands to the end and run the longer program. The program
is lost when the car is switched off.

A program can hold up to 100 commands, and U and E each count as one.

## Loops

U starts a loop and E ends it. Everything between them repeats the number
of times you gave U.

- Every U needs a matching E before the program can run.
- You can put a loop inside another loop. Each E closes the most recent U
  that is still open.

## Mistakes

A mistake plays a low double buzz. The command you were typing is thrown
away and nothing is stored, so start that command again from its letter.
The commands already in your program are kept.

You get the buzz when:

- the cell is not one of the command letters
- a number is missing, or is outside the command's range
- you type a digit after a command that takes no number, such as E or C
- you type more than 3 digits
- you type E when no loop is open
- you run a program that is empty, or that has a U with no matching E
- the program already has 100 commands

To throw away the whole program and start fresh, type C, then end line.

## Examples

In these examples, "end line" means dots 4-6 followed by key 0, and each
cell is typed as its dots followed by key 0.

### Drive forward 12 inches

1. F (dots 1-2-4)
2. 1 (dot 2)
3. 2 (dots 2-3)
4. end line (dots 4-6)
5. run (dot 6)

### Go out and come back

1. F 24, end line
2. R 180, end line
3. F 24, end line
4. run

### Drive a square

1. U 4, end line
2. F 12, end line
3. R 90, end line
4. E, end line
5. run

The car drives 12 inches and turns right 4 times, which ends where it
started.

### Drive a triangle

1. U 3, end line
2. F 10, end line
3. L 120, end line
4. E, end line
5. run

### Wiggle forward (a loop inside a loop)

1. U 2, end line
2. F 6, end line
3. U 3, end line
4. L 20, end line
5. R 20, end line
6. E, end line
7. E, end line
8. run

The outer loop runs twice. Each time, the car drives 6 inches and then
wiggles left and right 3 times.

### Cancel a command before the end line

You meant F 12, but typed F, 1, 3. You notice before typing the end line.

1. Type a full cell, all six dots, then key 0. It isn't a digit or the end
   line, so you hear the buzz and the unfinished command is dropped.
2. Type F 12, end line, as you meant to.

### Fix a command that is already stored

There is no way to remove one command, so clear the program and start
again:

1. Type C, then end line. You hear the slide sound, and the program is
   empty.
2. Type the commands again from the start.

## Setup and calibration

- **Starting up:** after power on, the car ticks softly every 2 seconds
  while it looks for the seven dials. When it finds them all, it plays
  "power up" and is ready. If it keeps ticking, check that the hub's power
  switch is on and that the dial chain is plugged into the hub's chain port,
  not a motor port.
- **Distance and turns** are worked out from two measurements of this car,
  kept in `forward-project/main.ts`: `CAL_INCHES_MOVED` (how far it drives
  in 2 seconds) and `WHEEL_GAP_INCHES` (the distance between the middles of
  the two tires). If the car goes too far or not far enough, change these
  numbers and rebuild. Distances are worked out from driving time, so expect
  them to be close but not exact.
- **Button A on the micro:bit** runs a test calibration. The car plays three
  ticks and drives forward 2 seconds. At the "ba-ding", type the inches it
  moved, then end line. At the second "ba-ding", type the tire gap in
  eighths of an inch, then end line (4 1/2 inches is 36). This lasts only
  until restart.
- **Buttons A and B together** re-learn which dial is which key. Press keys
  0 to 6 in order, and you hear each key's number. When all seven are done,
  you hear "power up".

## Building

From the `forward-project` folder, run `mkc` to build. The program is
written to `forward-project/built/binary.hex`; copy that file onto the
MICROBIT drive. `mkc -d` builds and copies it in one step.
