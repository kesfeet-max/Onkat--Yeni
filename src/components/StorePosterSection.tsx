import { useMemo, useRef, useState } from 'react';
import { Printer, Loader2, Download, Ruler, Info } from 'lucide-react';

/** Esnafın kasasına asacağı hazır afiş görseli (public/assets altında). */
export const POSTER_IMAGE_SRC = '/assets/kasa-afisi-onkati-puan.png';

/** Baskı için desteklenen standart afiş boyutları. */
interface PosterSize {
  id: 'a4' | 'a3' | 'a5';
  /** Seçim menüsünde görünen etiket */
  label: string;
  /** Boyutun kullanım amacı */
  hint: string;
  /** CSS @page size değeri */
  pageSize: string;
  widthMm: number;
  heightMm: number;
}

const POSTER_SIZES: PosterSize[] = [
  {
    id: 'a4',
    label: 'A4 — 210 × 297 mm',
    hint: 'Kasa arkası ve duvar için en çok kullanılan standart boyut.',
    pageSize: 'A4 portrait',
    widthMm: 210,
    heightMm: 297,
  },
  {
    id: 'a3',
    label: 'A3 — 297 × 420 mm',
    hint: 'Vitrin ve uzaktan görünürlük için büyük boy afiş.',
    pageSize: 'A3 portrait',
    widthMm: 297,
    heightMm: 420,
  },
  {
    id: 'a5',
    label: 'Masaüstü Stand (A5) — 148 × 210 mm',
    hint: 'Kasa üstü pleksi stand için küçük boy afiş.',
    pageSize: 'A5 portrait',
    widthMm: 148,
    heightMm: 210,
  },
];

/**
 * Seçilen boyuta göre, kenar boşluğu olmadan tam sayfa afiş basan yazdırma HTML'i üretir.
 * `object-fit: contain` sayesinde afiş oranı korunur, taşma/kırpma olmaz.
 */
function buildPrintHtml(size: PosterSize, imageUrl: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>Onkatı Kasa Afişi — ${size.label}</title>
<style>
  @page { size: ${size.pageSize}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  .sheet {
    width: ${size.widthMm}mm;
    height: ${size.heightMm}mm;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    page-break-after: avoid;
  }
  .sheet img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="sheet"><img src="${imageUrl}" alt="Onkatı Kasa Afişi" /></div>
</body>
</html>`;
}

/** Görselin yüklenmesini (veya hata vermesini) bekler; uzun sürerse zaman aşımına düşer. */
function waitForImage(doc: Document, timeoutMs = 8000): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = doc.images[0];
    if (!img || img.complete) {
      resolve();
      return;
    }
    const done = () => resolve();
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    window.setTimeout(done, timeoutMs);
  });
}

interface StorePosterSectionProps {
  /** Mağaza kodu (örn. ONK-0042) — afişin altında bilgi olarak gösterilir. */
  storeCode?: string;
  /** Dükkan adı — indirilen dosya adında kullanılır. */
  storeName?: string;
}

/**
 * "Kasa Afişim ve QR Kodum" bölümü.
 *
 * Esnaf hazır afişi ön izleyebilir, baskı boyutunu (A4 / A3 / Masaüstü Stand A5) seçebilir,
 * seçilen boyuta göre optimize edilmiş afişi yazdırabilir veya PDF olarak kaydedebilir,
 * ayrıca yüksek çözünürlüklü görseli doğrudan cihazına indirebilir.
 */
export function StorePosterSection({ storeCode, storeName }: StorePosterSectionProps) {
  const [selectedSizeId, setSelectedSizeId] = useState<PosterSize['id']>('a4');
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const selectedSize = useMemo(
    () => POSTER_SIZES.find((size) => size.id === selectedSizeId) ?? POSTER_SIZES[0],
    [selectedSizeId]
  );

  /** Afiş görselinin tam (absolute) adresi — yazdırma penceresinde gereklidir. */
  const absoluteImageUrl = useMemo(() => {
    if (typeof window === 'undefined') return POSTER_IMAGE_SRC;
    return `${window.location.origin}${POSTER_IMAGE_SRC}`;
  }, []);

  /** İndirilen dosya için okunabilir bir ad üretir. */
  const downloadFileName = useMemo(() => {
    const slug = (storeName || 'onkati')
      .toLocaleLowerCase('tr')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'onkati';
    return `${slug}-kasa-afisi-${selectedSize.id}.png`;
  }, [storeName, selectedSize.id]);

  /**
   * Seçilen boyutta yazdırma / PDF kaydetme akışını başlatır.
   * Gizli bir iframe kullanılır; başarısız olursa yeni sekme ile yeniden denenir.
   */
  const handlePrint = async () => {
    setError(null);
    setPreparing(true);

    const html = buildPrintHtml(selectedSize, absoluteImageUrl);

    try {
      // Önceki yazdırma iframe'i varsa temizle
      if (printFrameRef.current?.parentNode) {
        printFrameRef.current.parentNode.removeChild(printFrameRef.current);
        printFrameRef.current = null;
      }

      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
      printFrameRef.current = iframe;

      const frameDoc = iframe.contentDocument;
      const frameWindow = iframe.contentWindow;

      if (!frameDoc || !frameWindow) {
        throw new Error('frame-unavailable');
      }

      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      await waitForImage(frameDoc);

      frameWindow.focus();
      frameWindow.print();

      // Yazdırma diyaloğu kapandıktan sonra iframe'i kaldır
      window.setTimeout(() => {
        if (printFrameRef.current?.parentNode) {
          printFrameRef.current.parentNode.removeChild(printFrameRef.current);
          printFrameRef.current = null;
        }
      }, 2000);
    } catch {
      // Yedek yol: yeni sekmede aç ve oradan yazdır
      try {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          setError(
            'Yazdırma penceresi açılamadı. Tarayıcınızdaki açılır pencere engelini kaldırıp tekrar deneyin veya afişi indirip yazdırın.'
          );
        } else {
          printWindow.document.open();
          printWindow.document.write(html);
          printWindow.document.close();
          await waitForImage(printWindow.document);
          printWindow.focus();
          printWindow.print();
        }
      } catch {
        setError('Afiş yazdırılamadı. Lütfen afişi indirip cihazınızdan yazdırmayı deneyin.');
      }
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Kasa Afişim ve QR Kodum</h2>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Ön izleme alanı */}
        <div className="bg-gradient-to-b from-primary-700 to-primary-800 px-4 py-5">
          <div className="mx-auto max-w-[280px] rounded-xl overflow-hidden bg-white shadow-2xl ring-4 ring-secondary-400/40">
            <img
              src={POSTER_IMAGE_SRC}
              alt="Onkatı kasa afişi ön izlemesi — Onkatı Puanlarınızı Alın, kare kodu okutun"
              className="w-full h-auto block"
              loading="lazy"
            />
          </div>
          <p className="mt-3 text-center text-[11px] text-primary-100/90 font-medium">
            Kasanıza asacağınız hazır afişin ön izlemesi
            {storeCode ? ` — Mağaza Kodu: ${storeCode}` : ''}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Baskı boyutu seçimi */}
          <div>
            <label
              htmlFor="poster-size-select"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"
            >
              <Ruler className="w-4 h-4 text-emerald-600" />
              Baskı Boyutu
            </label>
            <select
              id="poster-size-select"
              value={selectedSizeId}
              onChange={(e) => {
                setSelectedSizeId(e.target.value as PosterSize['id']);
                setError(null);
              }}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
            >
              {POSTER_SIZES.map((size) => (
                <option key={size.id} value={size.id}>
                  {size.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">{selectedSize.hint}</p>
          </div>

          {/* Yazdır / PDF butonu */}
          <button
            onClick={handlePrint}
            disabled={preparing}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 transition"
          >
            {preparing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
            Afişi İndir / Yazdır (PDF)
          </button>

          {/* Görseli doğrudan indirme */}
          <a
            href={POSTER_IMAGE_SRC}
            download={downloadFileName}
            className="w-full py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 flex items-center justify-center gap-2 transition"
          >
            <Download className="w-5 h-5" />
            Afiş Görselini İndir (PNG)
          </a>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs text-red-700 font-medium">{error}</p>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Yazdırma ekranında <strong>Hedef</strong> olarak "PDF olarak kaydet" seçeneğini işaretlerseniz afiş
              PDF dosyası olarak cihazınıza iner. Kağıt boyutunu{' '}
              <strong>{selectedSize.label.split('—')[0].trim()}</strong> ve kenar boşluğunu{' '}
              <strong>Yok</strong> seçmeniz, afişin sayfayı tam doldurmasını sağlar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}