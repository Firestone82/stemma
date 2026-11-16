/**
 * The one card everybody is drawn on, for the chart and for prints alike: where each part sits and how big
 * it is. A shield with the person's initials in their family's colour, the given names, the surname and the
 * surname at birth, the dates, the sex as an accent down the card's edge, a ribbon across
 * the corner of someone who has died, and a badge on the corner of a card whose record has a mistake.
 * The chart draws it with Angular (person-card), prints as SVG text (poster.ts); both take their numbers here.
 */
import { Sex } from '../model/types';

export const FONT_SERIF = "'Alegreya Variable', Alegreya, Georgia, 'Times New Roman', serif";
export const FONT_SMALL_CAPS = "'Alegreya SC', 'Alegreya Variable', Georgia, serif";
export const FONT_SANS = "'Alegreya Sans', 'Segoe UI', system-ui, sans-serif";

/** Which parts the cards have. Every card has the same parts, so all are one size. */
export interface CardParts {
  /** The shield with the initials. */
  emblem: boolean;
  /** A line for the surname at birth ("née Barlow"): on when anyone on the chart has one, and it is shown. */
  birthName: boolean;
  /** A line for the dates. */
  dates: boolean;
  /** Where the shield stands: level with the given names, or in the middle of the card's height. */
  emblemTop?: boolean;
  /** A band down the left edge, blue for men and rose for women, and the card tinted to match. */
  sexAccent: boolean;
}

export interface CardFont {
  family: string;
  size: number;
  weight: number;
  style?: 'italic';
  /** In em. */
  letterSpacing?: number;
}

export interface CardLine extends CardFont {
  /** Baseline, from the card's top, on a card that has every line. */
  y: number;
}

export interface CardDesign {
  width: number;
  height: number;
  radius: number;
  /** Width of the accent band down the left edge; 0 without it. */
  accent: number;
  /** The shield: its top-left corner, size and outline (in its own coordinates). */
  shield?: { x: number; y: number; w: number; h: number; path: string; font: CardFont };
  /** Where the lines of text start, and how wide they may be. */
  textX: number;
  textW: number;
  given: CardLine;
  surname: CardLine;
  birth: CardLine;
  dates: CardLine;
  /** How far a card without a surname at birth moves its lines down, to keep the text in the middle. */
  spare: number;
  /** How far the dates move up on a card without a surname at birth. */
  birthStep: number;
  /** The badge for a mistake, half over the top right corner: its middle and radius. */
  badge: { x: number; y: number; r: number; mark: string };
  /**
   * The band across the top right corner of someone who has died (see ribbonPath): it runs between the lines
   * at `from` and at `to` from that corner, measured along the top edge and down the right edge alike.
   */
  ribbonBand: { from: number; to: number };
}

export const CARD_WIDTH = 188;
/** How much of a card's width the shield takes, with the room beside it. */
const EMBLEM_ROOM = 34;
/** The dash of the edge of a card for someone whose name nobody knows, and of a stand-in card. */
export const UNKNOWN_DASH = '4 2.6';
export const GHOST_DASH = '1.5 3';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A heater shield, flat on top and curving to a point. */
export function shieldPath(w: number, h: number): string {
  const side = h * 0.42;
  return `M0,0H${r2(w)}V${r2(side)}C${r2(w)},${r2(h * 0.74)} ${r2(w * 0.74)},${r2(h * 0.92)} ${r2(w / 2)},${r2(h)}C${r2(w * 0.26)},${r2(h * 0.92)} 0,${r2(h * 0.74)} 0,${r2(side)}Z`;
}

/** How much bigger the words are on cards with large text (PrintSettings.largeText). */
export const LARGE_TEXT = 1.2;

/**
 * @param letters The words so many times their usual size (LARGE_TEXT for prints with large text): the lines
 *   are that much further apart and the card that much taller; its width, shield and edges stay.
 */
export function cardDesign(parts: CardParts, letters = 1): CardDesign {
  // Without the shield the card is narrower by the room the shield takes, and the lines keep their length.
  const width = parts.emblem ? CARD_WIDTH : CARD_WIDTH - EMBLEM_ROOM;
  const accent = parts.sexAccent ? 5 : 0;
  const k = letters;
  const given: CardLine = { family: FONT_SERIF, size: r2(17.5 * k), weight: 600, y: 0 };
  const surname: CardLine = { family: FONT_SMALL_CAPS, size: r2(14 * k), weight: 500, letterSpacing: 0.03, y: 0 };
  const birth: CardLine = { family: FONT_SERIF, size: r2(12 * k), weight: 400, style: 'italic', y: 0 };
  const dates: CardLine = { family: FONT_SANS, size: r2(12 * k), weight: 400, y: 0 };
  // Baselines from the top: the given names, then each line a step under the one before.
  const top = 9;
  given.y = top + 13 * k;
  surname.y = given.y + 16 * k;
  let last = surname.y;
  const birthStep = r2(13.5 * k);
  if (parts.birthName) {
    birth.y = last + birthStep;
    last = birth.y;
  } else birth.y = surname.y + birthStep;
  if (parts.dates) {
    dates.y = last + 14.5 * k;
    last = dates.y;
  } else dates.y = last + 14.5 * k;
  const shieldH = 30;
  const height = parts.emblem ? Math.max(Math.round(last + 9), shieldH + 18) : Math.round(last + 9);
  // The lines as a block in the middle of the card.
  const lift = (height - (last + 9)) / 2;
  for (const l of [given, surname, birth, dates]) l.y = r2(l.y + lift);
  const shieldX = accent + 11;
  const shieldW = 26;
  const textX = parts.emblem ? shieldX + shieldW + 10 : accent + 13;
  const a = Math.max(9, height * 0.2);
  const b = Math.max(7, height * 0.155);
  return {
    width,
    height,
    radius: 4,
    accent,
    shield: parts.emblem
      ? {
          x: shieldX,
          // At the top, its top a little over the given names' letters; or in the middle.
          y: parts.emblemTop ? r2(Math.min((height - shieldH) / 2, given.y - given.size * 0.78)) : r2((height - shieldH) / 2),
          w: shieldW,
          h: shieldH,
          path: shieldPath(shieldW, shieldH),
          font: { family: FONT_SANS, size: 10.5, weight: 700, letterSpacing: 0.02 },
        }
      : undefined,
    textX,
    textW: width - textX - 10,
    given,
    surname,
    birth,
    dates,
    spare: parts.birthName ? r2(birthStep / 2) : 0,
    birthStep,
    badge: { x: width - 3, y: 3, r: 7.5, mark: 'M0,-3.9V0.9M0,3.3V3.5' },
    ribbonBand: { from: r2(a), to: r2(a + b) },
  };
}

/** The band across the top right corner of a card `w` wide, for someone who has died (see CardDesign.ribbonBand). */
export function ribbonPath(d: Pick<CardDesign, 'ribbonBand'>, w: number): string {
  const { from, to } = d.ribbonBand;
  return `M${r2(w - from)},0L${r2(w)},${r2(from)}V${r2(to)}L${r2(w - to)},0Z`;
}

/** The lines a card has, with what it says on them, placed: every baseline as it is on this card. */
export function cardLines(d: CardDesign, parts: CardParts, has: { birth: boolean }): { given: number; surname: number; birth: number; dates: number } {
  // A card without a surname at birth, among cards that have one, keeps its text in the middle and its dates close under the surname.
  const shift = parts.birthName && !has.birth ? d.spare : 0;
  return {
    given: d.given.y + shift,
    surname: d.surname.y + shift,
    birth: d.birth.y,
    dates: parts.birthName && !has.birth ? d.dates.y - d.birthStep + shift : d.dates.y,
  };
}

/** The accent for someone's sex; nothing when it is not recorded. */
export function accentOf(sex: Sex): 'male' | 'female' | 'other' | undefined {
  return sex === 'male' || sex === 'female' || sex === 'other' ? sex : undefined;
}
