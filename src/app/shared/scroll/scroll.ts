import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import SimpleBarCore from 'simplebar-core';

/**
 * A scrolling area with a SimpleBar scrollbar: a slim bar laid over the content that shows while it is
 * scrolled or pointed at, so it never takes width from what scrolls. Put on the element that scrolls
 * (`<div class="…" stemmaScroll>`); what it holds stays Angular's, in SimpleBar's markup written here, so
 * content that comes and goes (@if, @for) is put in the right place. The element has to be as tall as it may
 * get (a height, a max-height, or with `scroll-fill`, the size of its cell in a grid or flex column), and its
 * content's layout (padding, gaps) goes on one block inside it.
 */
@Component({
  // On the element that scrolls, so its own classes, bindings and place in the layout stay as they are.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: '[stemmaScroll]',
  template: `<div class="simplebar-wrapper">
      <div class="simplebar-height-auto-observer-wrapper"><div class="simplebar-height-auto-observer"></div></div>
      <div class="simplebar-mask">
        <div class="simplebar-offset">
          <div class="simplebar-content-wrapper">
            <div class="simplebar-content"><ng-content /></div>
          </div>
        </div>
      </div>
      <div class="simplebar-placeholder"></div>
    </div>
    <div class="simplebar-track simplebar-horizontal" style="visibility: hidden"><div class="simplebar-scrollbar"></div></div>
    <div class="simplebar-track simplebar-vertical"><div class="simplebar-scrollbar"></div></div>`,
  // SimpleBar's own stylesheet (angular.json) styles this markup.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-simplebar': 'init' },
})
export class Scroll {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyed = inject(DestroyRef);
    afterNextRender(() => {
      // Without a ResizeObserver (a test) the area still scrolls, with the browser's bar hidden.
      if (typeof ResizeObserver === 'undefined') return;
      try {
        const bar = new SimpleBarCore(el, { autoHide: true });
        // SimpleBar measures again on every change anywhere inside (a text, a class): costly where the content
        // is busy. A change of size is all the bar needs, and the ResizeObserver it also keeps sees that.
        bar.mutationObserver?.disconnect();
        destroyed.onDestroy(() => bar.unMount());
      } catch {
        // The area still scrolls.
      }
    });
  }
}
