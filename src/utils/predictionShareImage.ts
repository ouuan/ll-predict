import QRCode from 'qrcode';
import { t } from '../i18n';
import type { Prediction } from '../types/domain';

interface ShareImageText {
  appName: string;
  setlistTitle: string;
  scanHint: string;
}

interface ShareImageResult {
  dataUrl: string;
  filename: string;
}

const IMAGE_WIDTH = 680;
const PADDING = 48;
const QR_SIZE = 64;
const BOTTOM_LINE_HEIGHT = 28;
const BOTTOM_LINE_GAP = 8;
const BACKGROUND = '#fffaf5';
const TEXT = '#1f2937';
const MUTED = '#6b7280';
const ACCENT = '#d24d57';
const FONT_FAMILY = '"Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif';

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight = 400,
) {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const char of paragraph) {
      const next = `${current}${char}`;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

function measureLines(lines: string[], lineHeight: number) {
  return lines.length * lineHeight;
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = '...';
  let truncated = text;
  while (truncated.length > 0) {
    truncated = truncated.slice(0, -1);
    const candidate = `${truncated}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      return candidate;
    }
  }

  return ellipsis;
}

function normalizeDisplayTitle(text: string): string {
  return text.replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error(t('errors.SHARE_IMAGE_QR_LOAD_FAILED')));
    };
    image.src = src;
  });
}

export async function generatePredictionShareImage(
  prediction: Prediction,
  text: ShareImageText,
  detailUrl: string,
): Promise<ShareImageResult> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(t('errors.SHARE_IMAGE_CANVAS_UNSUPPORTED'));
  }

  const contentWidth = IMAGE_WIDTH - PADDING * 2;
  const performanceText = normalizeDisplayTitle(
    prediction.performanceTitle || prediction.performanceName,
  );
  const songTexts = prediction.items
    .filter((item) => item.type === 'song')
    .map((item, index) => `${String(index + 1).padStart(2, '0')}. ${item.songName ?? ''}`);

  setFont(ctx, 18, 700);
  const appNameLines = wrapText(ctx, text.appName, contentWidth);
  setFont(ctx, 40, 800);
  const titleLines = wrapText(ctx, text.setlistTitle, contentWidth);
  setFont(ctx, 26, 600);
  const performanceLines = wrapText(ctx, performanceText, contentWidth);
  setFont(ctx, 22, 400);
  const itemLines = songTexts.flatMap((itemText) => wrapText(ctx, itemText, contentWidth));

  const leftHeightParts = [
    measureLines(appNameLines, 24),
    20,
    measureLines(titleLines, 50),
    18,
    measureLines(performanceLines, 34),
    34,
    Math.max(measureLines(itemLines, 34), 34),
  ];
  const leftHeight = leftHeightParts.reduce((sum, value) => sum + value, 0);

  const bottomTextHeight = BOTTOM_LINE_HEIGHT * 2 + BOTTOM_LINE_GAP;
  const qrAndTextHeight = Math.max(QR_SIZE, bottomTextHeight);
  const qrTextGap = 16;
  const bottomTextX = PADDING + QR_SIZE + qrTextGap;
  const bottomTextWidth = contentWidth - QR_SIZE - qrTextGap;

  setFont(ctx, 18, 700);
  const scanHintText = truncateToWidth(ctx, text.scanHint, bottomTextWidth);
  setFont(ctx, 14, 400);
  const detailUrlText = truncateToWidth(ctx, detailUrl, bottomTextWidth);

  const imageHeight = leftHeight + qrAndTextHeight + PADDING * 2 + 30;
  canvas.width = IMAGE_WIDTH;
  canvas.height = imageHeight;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, canvas.width, 14);

  let y = PADDING;
  ctx.fillStyle = ACCENT;
  setFont(ctx, 18, 700);
  drawLines(ctx, appNameLines, PADDING, y, 24);
  y += measureLines(appNameLines, 24) + 20;

  ctx.fillStyle = TEXT;
  setFont(ctx, 40, 800);
  drawLines(ctx, titleLines, PADDING, y, 50);
  y += measureLines(titleLines, 50) + 18;

  setFont(ctx, 26, 600);
  drawLines(ctx, performanceLines, PADDING, y, 34);
  y += measureLines(performanceLines, 34);

  y += 34;

  ctx.fillStyle = TEXT;
  setFont(ctx, 22, 400);
  if (itemLines.length > 0) {
    drawLines(ctx, itemLines, PADDING, y, 34);
  }

  const qrDataUrl = await QRCode.toDataURL(detailUrl, {
    width: QR_SIZE,
    margin: 1,
    color: {
      dark: TEXT,
      light: '#ffffff',
    },
  });
  const qrImage = await loadImage(qrDataUrl);

  const qrBlockY = imageHeight - PADDING - qrAndTextHeight;
  const qrY = qrBlockY + (qrAndTextHeight - QR_SIZE) / 2;
  const textY = qrBlockY + (qrAndTextHeight - bottomTextHeight) / 2;

  ctx.drawImage(qrImage, PADDING, qrY, QR_SIZE, QR_SIZE);

  ctx.fillStyle = ACCENT;
  setFont(ctx, 18, 700);
  ctx.fillText(scanHintText, bottomTextX, textY + BOTTOM_LINE_HEIGHT - 4);

  ctx.fillStyle = MUTED;
  setFont(ctx, 14, 400);
  ctx.fillText(
    detailUrlText,
    bottomTextX,
    textY + BOTTOM_LINE_HEIGHT * 2 + BOTTOM_LINE_GAP - 4,
  );

  return {
    dataUrl: canvas.toDataURL('image/png'),
    filename: `ll-predict-${prediction.id}.png`,
  };
}

export function downloadShareImage(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
