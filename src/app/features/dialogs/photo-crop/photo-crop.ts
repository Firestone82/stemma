import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
import { ToastService } from '../../../core/services/toast';
import { I18n } from '../../../i18n/i18n';
import { PORTRAIT_ASPECT, PhotoCrop as Crop, PhotoError, PickedPhoto, clampCrop, defaultCrop, portraitFromCrop } from '../../../shared/photo';
import { PortraitShape } from '../../../core/model/types';
import { SegmentOption, Segmented } from '../../../shared/segmented/segmented';
import { PersonActions } from '../../../state/person-actions';

/** The width of the frame the picture is placed in, in CSS pixels (see photo-crop.scss); it is PORTRAIT_ASPECT times as high. */
const FRAME = 240;

/**
 * Placing a picked picture before it becomes someone's portrait: the upright
 * rectangle that is kept is dragged over the picture and zoomed, with the
 * round, square or whole window a print or the chart shows of it.
 */
@Component({
  selector: 'stemma-photo-crop',
  imports: [Segmented],
  templateUrl: './photo-crop.html',
  styleUrl: './photo-crop.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoCrop implements OnDestroy {
  private readonly people = inject(PersonActions);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18n).t;

  readonly personId = input.required<string>();
  readonly photo = input.required<PickedPhoto>();
  readonly done = output<void>();

  /** The part kept, in the picture's pixels. */
  protected readonly crop = signal<Crop>({ x: 0, y: 0, w: 1, h: PORTRAIT_ASPECT });
  /** The window shown over the frame: how the portrait will be cut on the chart (round) or a print. */
  protected readonly shape = signal<PortraitShape>('round');
  protected readonly shapes: SegmentOption<PortraitShape>[] = [
    { value: 'round', label: this.t('print.portrait.round') },
    { value: 'square', label: this.t('print.portrait.square') },
    { value: 'rectangle', label: this.t('print.portrait.rectangle') },
  ];
  protected readonly dragging = signal(false);
  private drag: { id: number; x: number; y: number; crop: Crop } | null = null;
  private accepted = false;

  /** How far in: 1 shows as much of the picture as fits, 4 a quarter of that. */
  protected readonly zoom = computed(() => defaultCrop(this.photo().width, this.photo().height).w / this.crop().w);

  /** Where the picture lies in the frame. */
  protected readonly shown = computed(() => {
    const { width, height } = this.photo();
    const c = this.crop();
    const s = FRAME / c.w;
    return { w: width * s, h: height * s, left: -c.x * s, top: -c.y * s };
  });

  constructor() {
    effect(() => {
      const { width, height } = this.photo();
      this.crop.set(defaultCrop(width, height));
    });
  }

  ngOnDestroy(): void {
    this.photo().release();
  }

  protected setZoom(event: Event): void {
    const zoom = Number((event.target as HTMLInputElement).value);
    this.zoomTo(defaultCrop(this.photo().width, this.photo().height).w / zoom);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomTo(this.crop().w * (event.deltaY > 0 ? 1.08 : 1 / 1.08));
  }

  /** Zooms about the middle of the frame. */
  private zoomTo(w: number): void {
    const { width, height } = this.photo();
    const c = this.crop();
    const h = w * PORTRAIT_ASPECT;
    this.crop.set(clampCrop({ x: c.x + (c.w - w) / 2, y: c.y + (c.h - h) / 2, w }, width, height));
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, crop: this.crop() };
    this.dragging.set(true);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    const { width, height } = this.photo();
    const s = this.drag.crop.w / FRAME;
    this.crop.set(
      clampCrop(
        { ...this.drag.crop, x: this.drag.crop.x - (event.clientX - this.drag.x) * s, y: this.drag.crop.y - (event.clientY - this.drag.y) * s },
        width,
        height,
      ),
    );
  }

  protected endDrag(event: PointerEvent): void {
    if (this.drag?.id !== event.pointerId) return;
    this.drag = null;
    this.dragging.set(false);
  }

  protected accept(): void {
    if (this.accepted) return;
    try {
      const photo = portraitFromCrop(this.photo().image, this.crop());
      this.accepted = true;
      this.people.update(this.personId(), { photo }, 'photo');
      this.done.emit();
    } catch (e) {
      this.toast.error(e instanceof PhotoError ? this.t(`photo.${e.code}`) : this.t('photo.failed'));
    }
  }

  protected cancel(): void {
    this.done.emit();
  }
}
