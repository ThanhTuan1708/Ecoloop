export interface QRCode { data: string; binaryData: number[]; location: unknown }
declare function jsQR(data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }): QRCode | null;
export default jsQR;
