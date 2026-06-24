'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Modal } from '@/components/admin/modal';
import { usePlayroom } from '@/lib/store';
import { CameraOff, ScanLine } from 'lucide-react';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

// Dedicated, battle-tested QR/barcode scanner (html5-qrcode). It owns the camera + the
// decode loop and renders the live preview into REGION_ID. Far more reliable for QR off a
// phone/laptop camera than the previous hand-rolled zxing loop.
const REGION_ID = 'mtl-qr-reader';

export default function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = usePlayroom();

  useEffect(() => {
    if (!open) return;
    handledRef.current = false;
    setError(null);
    let cancelled = false;

    const stop = async () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      try { if (s.isScanning) await s.stop(); } catch { /* ignore */ }
      try { s.clear(); } catch { /* ignore */ }
    };

    const start = async () => {
      try {
        const scanner = new Html5Qrcode(REGION_ID, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          // Use Chrome's native BarcodeDetector when available — markedly faster/more reliable.
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        });
        scannerRef.current = scanner;
        if (cancelled) { await stop(); return; }
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            // Scan a large, responsive region (80% of the smaller video side) — far more forgiving
            // than a fixed 230px box when the QR is on a phone screen, small, or held at an angle.
            qrbox: (vw: number, vh: number) => {
              const m = Math.floor(Math.min(vw, vh) * 0.8)
              return { width: m, height: m }
            },
          },
          (decodedText) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onScan(decodedText);
            stop().finally(() => onClose());
          },
          () => { /* per-frame decode miss — ignore */ },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Scanner error:', err);
        if (!cancelled) {
          setError('კამერა ვერ გაიხსნა — ' + msg);
          pushToast('danger', 'კამერა ვერ გაიხსნა: ' + msg);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="კამერით სკანირება">
      <div className="flex flex-col items-center justify-center p-4">
        {/* The region is ALWAYS mounted so html5-qrcode can attach; errors overlay it. */}
        <div className="relative w-full max-w-sm min-h-[240px]">
          <div
            id={REGION_ID}
            className="w-full overflow-hidden rounded-2xl [&_video]:w-full [&_video]:rounded-2xl"
          />
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/80 p-4 text-center text-[var(--status-expired)]">
              <CameraOff className="mb-3 size-10 opacity-60" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {!error && (
          <p className="mt-4 flex animate-pulse items-center justify-center gap-2 text-sm text-muted-foreground">
            <ScanLine className="size-4" /> QR კოდი მოაქციე ჩარჩოში 🟢
          </p>
        )}

        <div className="mt-6 flex w-full justify-end">
          <button onClick={onClose} className="nm-btn rounded-xl px-6 py-2 text-muted-foreground">
            გაუქმება
          </button>
        </div>
      </div>
    </Modal>
  );
}
