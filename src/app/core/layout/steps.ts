/**
 * Work done a piece at a time. Fitting a big tree to a page takes seconds; done in one go it would hold the
 * window up for as long. So the long jobs are written as steps: every `next()` does one piece (a layout or
 * so) and the last hands back the result. Whoever runs them decides how: all at once (`finish`), or a few
 * at a time between which the window answers, and can be told to stop (see PrintModel).
 */
export type Steps<T> = Generator<void, T, void>;

/** The work all at once. */
export function finish<T>(steps: Steps<T>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
