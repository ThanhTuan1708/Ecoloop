import qrcode from './vendor/qrcode.mjs';

/** SVG markup of a QR code (black modules on white, 4-module quiet zone). */
export function qrSvg(text: string, size = 220): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const box = n + 8;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="#fff"/><path d="${d}" fill="#0b1f18"/></svg>`;
}

/** Decodes a QR code from image pixels (camera frame or uploaded picture). jsQR is loaded on demand. */
export async function decodeQr(image: ImageData): Promise<string | undefined> {
  const { default: jsQR } = await import('./vendor/jsqr.js');
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data;
}

export async function decodeQrFile(file: File): Promise<string | undefined> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return decodeQr(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
