import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { shieldPath } from '../../../core/card/card-design';
import { BalloonKind } from '../../../core/model/family-view';

/** A family left off the chart, where its first card would stand. */
export interface FamilySlot {
  /** The balloon's id (see core/model/family-view). */
  id: string;
  kind: BalloonKind;
  /** The place the layout gave it: a card's. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The families' names, short enough for the card: "Moreau, Duval" or "Moreau +2". */
  text: string;
  /** Width of the text in pixels. */
  width: number;
  /** Colours of the shields before the names, one per family (at most 3). */
  shields: string[];
}

const SHIELD_PITCH = 13;

/**
 * The families a family view leaves off the chart: each a dashed, card-sized button where the family's
 * first card would stand (the parents over a person, the children under a couple, a partner beside a
 * person), on the line that leads there. A press brings the family into the view, in the button's place.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- drawn inside an <svg>, so an attribute selector
  selector: 'g[stemmaFamilyBalloons]',
  templateUrl: './family-balloons.html',
  styleUrl: './family-balloons.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyBalloons {
  readonly slots = input.required<readonly FamilySlot[]>();
  /** Accessible name of each button, by its id. */
  readonly labels = input.required<ReadonlyMap<string, string>>();
  /** The words under the names: "Show the family". */
  readonly hint = input.required<(families: number) => string>();
  readonly pick = output<string>();

  protected readonly shield = shieldPath(10, 12);
  protected readonly pitch = SHIELD_PITCH;

  /** Where the shields and the names start, so that together they stand in the middle of the card. */
  protected startOf(s: FamilySlot): number {
    return Math.max(8, (s.w - (s.shields.length * SHIELD_PITCH + s.width)) / 2);
  }

  protected onPick(id: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.pick.emit(id);
  }
}
