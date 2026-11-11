import QRCode from "qrcode";

/**
 * A printable QR code for a referral link (owner's request, 2026-11-11): the code itself,
 * with Biqbaq's name and the referral code under it, so a printed copy still says what it is.
 * Made in the browser; nothing is sent anywhere.
 */
export const QR_SIZE = 1024;
const NAVY = "#14234b";

export const qrFileName = (code: string) => `biqbaq-referral-${code.toLowerCase().replace(/[^a-z0-9]/g, "")}.png`;

/** The QR code alone, as an image address for showing on the page. */
export const qrPreview = (url: string) =>
  QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 320, color: { dark: NAVY, light: "#ffffff" } });

/** The download: the QR code on a white card, with "Biqbaq" and the code below it. */
export async function qrCard(url: string, code: string, caption: string): Promise<Blob> {
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { errorCorrectionLevel: "M", margin: 2, width: QR_SIZE, color: { dark: NAVY, light: "#ffffff" } });
  const card = document.createElement("canvas");
  card.width = QR_SIZE;
  card.height = QR_SIZE + 260;
  const context = card.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, card.width, card.height);
  context.drawImage(qr, 0, 0);
  context.fillStyle = NAVY;
  context.textAlign = "center";
  context.font = "bold 72px system-ui, sans-serif";
  context.fillText(caption, QR_SIZE / 2, QR_SIZE + 90);
  context.font = "bold 64px ui-monospace, monospace";
  context.fillText(code, QR_SIZE / 2, QR_SIZE + 190);
  return new Promise((resolve, reject) => card.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"));
}
