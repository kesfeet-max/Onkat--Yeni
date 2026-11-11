/**
 * QR Engine — tüm tarayıcılarda (özellikle iPhone / iOS Safari) çalışan kamera ve QR okuma motoru.
 *
 * iOS uyumluluğu için:
 * - HTTPS (güvenli bağlam) ve getUserMedia desteği önceden kontrol edilir.
 * - Kamera kısıtları katmanlı denenir:
 *     facingMode { exact } → facingMode (ideal) → arka kamera deviceId → herhangi bir kamera.
 *   Biri "OverconstrainedError" vb. ile düşerse otomatik olarak sıradakine geçilir.
 * - Video öğesine `playsinline`, `webkit-playsinline`, `muted` ve `autoplay` zorunlu eklenir;
 *   aksi halde Safari videoyu tam ekrana almaya çalışır veya siyah ekran gösterir.
 * - iOS'ta sorun çıkaran `aspectRatio` kısıtı kullanılmaz; okuma kutusu ekran boyutuna göre hesaplanır.
 * - İzin reddi, kamera bulunamaması gibi durumlarda çökme yerine net Türkçe uyarı döner.
 */

import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const CAMERA_PREF_KEY = 'onkati_camera_facing';

export type CameraFacing = 'environment' | 'user';

export interface QREngineConfig {
  elementId: string;
  fps?: number;
  qrboxSize?: number;
  facingMode?: CameraFacing;
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  onCameraReady?: () => void;
  onCameraError?: (error: string) => void;
}

/** Kullanıcıya gösterilen kamera hata mesajları. */
export const CAMERA_ERRORS = {
  permission: 'Kamera erişimine izin verilmedi. Lütfen Safari ayarlarınızdan kamera iznini kontrol edin.',
  insecure: 'Kamera yalnızca güvenli (https://) bağlantıda çalışır. Lütfen siteye https:// ile girin.',
  unsupported:
    'Bu tarayıcı kamera erişimini desteklemiyor. iPhone’da lütfen Safari’yi (iOS 14.3 veya üstü) kullanın.',
  notFound: 'Cihazınızda kullanılabilir bir kamera bulunamadı.',
  busy: 'Kamera başka bir uygulama tarafından kullanılıyor. Diğer uygulamaları kapatıp tekrar deneyin.',
  generic: 'Kamera açılamadı. Lütfen sayfayı yenileyip tekrar deneyin.',
} as const;

/** Safari gizli modunda localStorage hata fırlatabilir; erişim güvenli sarmalanır. */
function readPref(): CameraFacing | null {
  try {
    const value = window.localStorage.getItem(CAMERA_PREF_KEY);
    return value === 'user' || value === 'environment' ? value : null;
  } catch {
    return null;
  }
}

function writePref(value: CameraFacing) {
  try {
    window.localStorage.setItem(CAMERA_PREF_KEY, value);
  } catch {
    // Tercih kaydedilemezse yalnızca bu oturumda geçerli olur
  }
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (window.navigator.maxTouchPoints || 0) > 1);
}

/** Hata nesnesinden (DOMException veya html5-qrcode metni) hata türünü çıkarır. */
function classifyError(error: unknown): keyof typeof CAMERA_ERRORS | 'retry' {
  const name = (error as { name?: string })?.name || '';
  const message = String((error as { message?: string })?.message || error || '');
  const text = `${name} ${message}`;

  if (/NotAllowed|PermissionDenied|Permission denied|denied permission|not allowed/i.test(text)) return 'permission';
  if (/Overconstrained|Constraint/i.test(text)) return 'retry';
  if (/NotFound|DevicesNotFound|Requested device not found|no camera/i.test(text)) return 'notFound';
  if (/NotReadable|TrackStart|Could not start video source|in use/i.test(text)) return 'busy';
  if (/secure|https/i.test(text)) return 'insecure';
  return 'retry';
}

/** Kamera hatasını kullanıcı dostu Türkçe mesaja çevirir. */
export function describeCameraError(error: unknown): string {
  const kind = classifyError(error);
  return kind === 'retry' ? CAMERA_ERRORS.generic : CAMERA_ERRORS[kind];
}

/** Safari'nin videoyu satır içinde ve sessiz oynatması için gereken öznitelikleri ekler. */
function prepareVideoElement(video: HTMLVideoElement) {
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('muted', 'true');
  video.setAttribute('autoplay', 'true');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  const playResult = video.play?.();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch(() => {
      // Oynatma kullanıcı etkileşimi bekliyorsa akış başladığında tekrar denenir
    });
  }
}

type CameraSource = string | MediaTrackConstraints;

export class QREngine {
  private scanner: Html5Qrcode | null = null;
  private isRunning = false;
  private config: QREngineConfig;
  private currentFacing: CameraFacing;
  private videoObserver: MutationObserver | null = null;

  constructor(config: QREngineConfig) {
    this.config = config;
    this.currentFacing = readPref() || config.facingMode || 'environment';
  }

  getFacing(): CameraFacing {
    return this.currentFacing;
  }

  /** Okuyucu kutusuna eklenen video öğesini yakalayıp iOS özniteliklerini uygular. */
  private watchVideoElement() {
    this.videoObserver?.disconnect();
    const container = document.getElementById(this.config.elementId);
    if (!container) return;

    container.querySelectorAll('video').forEach((v) => prepareVideoElement(v as HTMLVideoElement));

    this.videoObserver = new MutationObserver(() => {
      container.querySelectorAll('video').forEach((v) => {
        const video = v as HTMLVideoElement;
        if (!video.hasAttribute('playsinline') || !video.muted) prepareVideoElement(video);
      });
    });
    this.videoObserver.observe(container, { childList: true, subtree: true });
  }

  /** Denenecek kamera kaynaklarını en kesin olandan en esnek olana sıralar. */
  private async buildCameraSources(facing: CameraFacing): Promise<CameraSource[]> {
    const sources: CameraSource[] = [
      { facingMode: { exact: facing } },
      { facingMode: facing },
    ];

    // Cihaz listesi ancak izin verildikten sonra etiket içerir; hata verirse atlanır
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        const pattern = facing === 'environment' ? /back|rear|arka|environment|trás|arrière/i : /front|ön|user|face/i;
        const preferred = devices.find((d) => pattern.test(d.label)) ||
          (facing === 'environment' ? devices[devices.length - 1] : devices[0]);
        if (preferred?.id) sources.push(preferred.id);
        devices.forEach((d) => {
          if (d.id && !sources.includes(d.id)) sources.push(d.id);
        });
      }
    } catch (error) {
      if (classifyError(error) === 'permission') throw error;
    }

    return sources;
  }

  private async resetScanner() {
    if (this.scanner) {
      try {
        if (this.isRunning) await this.scanner.stop();
      } catch {
        // Zaten durmuş olabilir
      }
      try {
        this.scanner.clear();
      } catch {
        // Öğe temizlenemezse sorun değil
      }
    }
    this.scanner = null;
    this.isRunning = false;
  }

  async start(facing?: CameraFacing): Promise<void> {
    if (this.isRunning || this.scanner) await this.stop();

    if (facing) {
      this.currentFacing = facing;
      writePref(facing);
    }

    // 1) Güvenli bağlam ve API desteği
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      this.config.onCameraError?.(CAMERA_ERRORS.insecure);
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this.config.onCameraError?.(window.isSecureContext === false ? CAMERA_ERRORS.insecure : CAMERA_ERRORS.unsupported);
      return;
    }

    const size = this.config.qrboxSize || 250;
    const scanConfig = {
      fps: this.config.fps || 12,
      // Okuma kutusu video boyutunu aşarsa iOS'ta başlatma hatası olur; ekrana göre küçültülür
      qrbox: (viewWidth: number, viewHeight: number) => {
        const edge = Math.max(150, Math.floor(Math.min(viewWidth, viewHeight, size / 0.75) * 0.75));
        return { width: edge, height: edge };
      },
      disableFlip: false,
      ...(isIos() ? {} : { aspectRatio: 1.0 }),
    };

    let lastError: unknown = null;

    try {
      this.watchVideoElement();
      const sources = await this.buildCameraSources(this.currentFacing);

      for (const source of sources) {
        await this.resetScanner();
        this.scanner = new Html5Qrcode(this.config.elementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });

        try {
          await this.scanner.start(
            source,
            scanConfig,
            (decodedText) => this.config.onScanSuccess(decodedText),
            (errorMessage) => this.config.onScanError?.(errorMessage),
          );

          this.isRunning = true;
          document
            .getElementById(this.config.elementId)
            ?.querySelectorAll('video')
            .forEach((v) => prepareVideoElement(v as HTMLVideoElement));
          this.config.onCameraReady?.();
          return;
        } catch (error) {
          lastError = error;
          const kind = classifyError(error);
          // İzin reddi, kamera yok veya meşgul ise diğer kısıtları denemek anlamsız
          if (kind === 'permission' || kind === 'busy' || kind === 'insecure') break;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await this.resetScanner();
    this.videoObserver?.disconnect();
    this.videoObserver = null;
    this.config.onCameraError?.(describeCameraError(lastError));
  }

  /** Kamerayı değiştir (ön ↔ arka). */
  async switchCamera(): Promise<CameraFacing> {
    const newFacing: CameraFacing = this.currentFacing === 'environment' ? 'user' : 'environment';
    await this.start(newFacing);
    return newFacing;
  }

  async stop(): Promise<void> {
    this.videoObserver?.disconnect();
    this.videoObserver = null;
    await this.resetScanner();
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }
}

/** Kayıtlı kamera tercihini oku. */
export function getSavedCameraPreference(): CameraFacing {
  return readPref() || 'environment';
}

/** Kamera izni durumu (Safari Permissions API'yi kısmen desteklediği için güvenli). */
export async function checkCameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return result.state;
  } catch {
    return 'prompt';
  }
}
