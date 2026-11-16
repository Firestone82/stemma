/** Types for printed and exported pages ("posters"): the page around the tree, as heritage.ts draws it. */
import { LegendEntry } from '../colors/tinctures';
import { ChartLanguage } from '../lang/language';
import { PrintSettings } from '../model/types';

export interface FontSpec {
  /** CSS font-family list; only the bundled faces (Alegreya, Alegreya SC, Alegreya Sans) are embedded in exports. */
  family: string;
  size: number;
  weight?: number;
  style?: 'normal' | 'italic';
  /** In em. */
  letterSpacing?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A block of the page above or below the tree (title, legend). */
export interface PageBlock {
  height: number;
  draw(rect: Rect): string;
  /** The part of `rect` the block draws in, when that is less than all of it. */
  extent?(rect: Rect): Rect;
  /** Where in `rect` the block draws the families' names, if it does. */
  legend?(rect: Rect): Rect | undefined;
}

export interface PosterContext {
  settings: PrintSettings;
  language: ChartLanguage;
  page: {
    w: number;
    h: number;
    /**
     * The unit of the page's lettering and decorations: such that the title is as big as asked for
     * (PrintSettings.titleSize) or, when no size is asked for, as big as suits the sheet and the cards on it
     * (1% of the page's shorter side at most).
     */
    u: number;
    /** The same for the families' names in the legend (PrintSettings.legendSize): sized on their own; `u` when not set. */
    lu?: number;
    /** Space between the paper's edge and the content. */
    margin: number;
  };
  legend: readonly LegendEntry[];
  /** Where the families' names go: under the tree, in a box placed by hand (PrintSettings.legendBox), or nowhere. */
  legendAt: 'below' | 'free' | 'none';
  title: string;
  subtitle: string;
  /** First and last year in the print, when known. */
  years?: { from: number; to: number };
  now: Date;
  measure(text: string, font: FontSpec): number;
  /** Adds to <defs> once per id. */
  def(id: string, markup: string): void;
}
