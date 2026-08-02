/**
 * Enterprise QR Engine — Kamera ve QR okuma optimizasyonu
 * 
 * Html5QrcodeScanner yerine doğrudan Html5Qrcode kullanarak:
 * - Kamera milisaniyeler içinde açılır (ağır UI render yok)
 * - navigator.mediaDevices.getUserMedia direkt tetiklenir
 * - Arka plandaki asenkron yüklemeler engellenmez
 * - Bellek sızıntıları önlenir (cleanup garantili)
 * - Ön/arka kamera geçişi desteklenir (localStorage ile kalıcı tercih)
 */

import { Html5Qrcode, Html5QrcodeScanType, Html5QrcodeSupportedFormats } from 'html5-qrcode';

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

export class QREngine {
  private scanner: Html5Qrcode | null = null;
  private isRunning = false;
  private config: QREngineConfig;
  private currentFacing: CameraFacing;

  constructor(config: QREngineConfig) {
    this.config = config;
    // localStorage'dan kayıtlı tercihi oku, yoksa config'den veya 'environment' kullan
    const savedPref = localStorage.getItem(CAMERA_PREF_KEY) as CameraFacing | null;
    this.currentFacing = savedPref || config.facingMode || 'environment';
  }

  getFacing(): CameraFacing {
    return this.currentFacing;
  }

  async start(facing?: CameraFacing): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }

    if (facing) {
      this.currentFacing = facing;
      localStorage.setItem(CAMERA_PREF_KEY, facing);
    }

    try {
      // Scanner'ı oluştur — minimal config, hızlı başlangıç
      this.scanner = new Html5Qrcode(this.config.elementId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      // Kamerayı doğrudan aç — getUserMedia anında tetiklenir
      await this.scanner.start(
        { facingMode: this.currentFacing },
        {
          fps: this.config.fps || 15,
          qrbox: { width: this.config.qrboxSize || 250, height: this.config.qrboxSize || 250 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          this.config.onScanSuccess(decodedText);
        },
        (errorMessage) => {
          // Sessiz hata — her frame'de çağrılır, loglama
          this.config.onScanError?.(errorMessage);
        }
      );

      this.isRunning = true;
      this.config.onCameraReady?.();
    } catch (error: any) {
      const errorMsg = error?.message || 'Kamera açılamadı';
      this.config.onCameraError?.(errorMsg);
      this.isRunning = false;
    }
  }

  /**
   * Kamerayı değiştir (ön ↔ arka)
   * Mevcut kamerayı kapatıp yeni yönle tekrar açar.
   */
  async switchCamera(): Promise<CameraFacing> {
    const newFacing: CameraFacing = this.currentFacing === 'environment' ? 'user' : 'environment';
    await this.start(newFacing);
    return newFacing;
  }

  async stop(): Promise<void> {
    if (!this.scanner) return;

    if (this.isRunning) {
      try {
        await this.scanner.stop();
      } catch {
        // Zaten durmuş olabilir
      }
    }

    try {
      this.scanner.clear();
    } catch {
      // Element temizlenemezse sorun değil
    }

    this.scanner = null;
    this.isRunning = false;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Kayıtlı kamera tercihini oku
 */
export function getSavedCameraPreference(): CameraFacing {
  return (localStorage.getItem(CAMERA_PREF_KEY) as CameraFacing) || 'environment';
}

/**
 * Kamera izni kontrolü — kullanıcıya önceden bilgi vermek için
 */
export async function checkCameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return result.state;
  } catch {
    // Permissions API desteklenmiyorsa 'prompt' varsay
    return 'prompt';
  }
}

/**
 * Mevcut kameraları listele (arka kamera öncelikli)
 */
export async function getBackCamera(): Promise<string | null> {
  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices || devices.length === 0) return null;

    // Arka kamerayı bul
    const backCamera = devices.find(d =>
      d.label.toLowerCase().includes('back') ||
      d.label.toLowerCase().includes('arka') ||
      d.label.toLowerCase().includes('rear') ||
      d.label.toLowerCase().includes('environment')
    );

    return backCamera?.id || devices[0]?.id || null;
  } catch {
    return null;
  }
}