import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { shieldPath } from '../../../state/card-metrics';
import { PlacedBalloon } from './place-balloons';

/**
 * The balloons of the family view: for the families left off the chart, tied
 * by a dashed string to the person or couple they belong to. A click adds
 * their families to the view.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- drawn inside an <svg>, so an attribute selector
  selector: 'g[stemmaFamilyBalloons]',
  templateUrl: './family-balloons.html',
  styleUrl: './family-balloons.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyBalloons {
  readonly balloons = input.required<readonly PlacedBalloon[]>();
  /** Accessible name of each balloon, by its id. */
  readonly labels = input.required<ReadonlyMap<string, string>>();
  readonly pick = output<string>();

  protected readonly shield = shieldPath(10, 12);

  protected onPick(id: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.pick.emit(id);
  }
}
