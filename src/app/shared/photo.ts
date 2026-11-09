import { PORTRAIT_ASPECT } from '../core/model/types';

export type PhotoProblem = 'not-image' | 'empty' | 'no-canvas';

/** A picture that could not be used; `code` says why, for translation. */
export class PhotoError extends Error {
  constructor(readonly code: PhotoProblem) {
    super(code);
    this.name = 'PhotoError';
  }
}

/** A picked picture, decoded and ready to be cropped. Call `release` when done with it. */
export interface PickedPhoto {
  image: HTMLImageElement;
  width: number;
  height: number;
  release(): void;
}

export { PORTRAIT_ASPECT };

/** The width a stored portrait is scaled to, in pixels. */
export const PORTRAIT_WIDTH = 240;

/** The part cut out of a picture: its top left corner and size, in the picture's pixels; `h` is `w` × PORTRAIT_ASPECT. */
export interface PhotoCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Decodes a picked image file. */
export async function loadPhoto(file: File): Promise<PickedPhoto> {
  if (!file.type.startsWith('image/')) throw new PhotoError('not-image');
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError('not-image');
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new PhotoError('empty');
  }
  return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/** The largest portrait in the middle of a picture, a little up, because faces sit high in most pictures. */
export function defaultCrop(width: number, height: number): PhotoCrop {
  const w = Math.min(width, height / PORTRAIT_ASPECT);
  const h = w * PORTRAIT_ASPECT;
  return { x: (width - w) / 2, y: Math.max(0, (height - h) / 2 - (height - h) * 0.15), w, h };
}

/** Keeps a crop inside the picture and in proportion, no smaller than a few pixels. */
export function clampCrop(crop: Pick<PhotoCrop, 'x' | 'y' | 'w'>, width: number, height: number): PhotoCrop {
  const w = Math.max(8, Math.min(crop.w, width, height / PORTRAIT_ASPECT));
  const h = w * PORTRAIT_ASPECT;
  return { w, h, x: Math.max(0, Math.min(crop.x, width - w)), y: Math.max(0, Math.min(crop.y, height - h)) };
}

/** Cuts the part out of the picture as a small portrait (data: URL) suitable for storing inside the XML file. */
export function portraitFromCrop(image: CanvasImageSource, crop: PhotoCrop, width = PORTRAIT_WIDTH): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * PORTRAIT_ASPECT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('no-canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.84);
}
