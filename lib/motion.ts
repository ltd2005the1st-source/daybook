/**
 * One dial for how fast everything moves. 1 is the original pace; 1.5 is 50% faster, so every
 * animation takes two thirds of the time it was written with.
 *
 * Durations written in the code are the "1x" values; they go through sec() (seconds, for Motion)
 * or ms() (milliseconds, for timers). In CSS the same dial is `--speed` on :root in globals.css,
 * and every duration there is `calc(Xs / var(--speed))`. Keep the two numbers equal.
 */
export const SPEED = 1.5;

/** Seconds, scaled by SPEED. */
export const sec = (seconds: number): number => seconds / SPEED;

/** Milliseconds, scaled by SPEED. */
export const ms = (millis: number): number => Math.round(millis / SPEED);
