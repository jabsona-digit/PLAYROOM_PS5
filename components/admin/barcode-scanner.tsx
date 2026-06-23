'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Modal } from '@/components/admin/modal';
import { usePlayroom } from '@/lib/store';
import { CameraOff, ScanLine } from 'lucide-react';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export default function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = usePlayroom();

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    handledRef.current = false;
    startCamera();

    return () => {
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopCamera = () => {
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
    controlsRef.current = null;
  };

  const startCamera = async () => {
    setError(null);
    if (!videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    // Continuous decode (QR + 1D); zxing owns the camera + binds it to the <video>.
    const onHit = (result?: { getText: () => string }) => {
      if (!result || handledRef.current) return;
      const code = result.getText();
      if (!code) return;
      handledRef.current = true;
      stopCamera();
      onScan(code);
      onClose();
    };
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        onHit,
      );
    } catch {
      try {
        controlsRef.current = await reader.decodeFromConstraints(
          { video: true },
          videoRef.current,
          onHit,
        );
      } catch (err) {
        console.error('Camera error:', err);
        setError('კამერაზე წვდომა ვერ მოხერხდა — დართე ნებართვა ან შეამოწმე კავშირი.');
        pushToast('danger', 'კამერაზე წვდომა ვერ მოხერხდა — დართე ნებართვა');
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="კამერით სკანირება"
    >
      <div className="flex flex-col items-center justify-center p-4">
        {error ? (
          <div className="flex flex-col items-center justify-center text-[var(--status-expired)] h-64">
            <CameraOff className="size-10 mb-4 opacity-50" />
            <p className="text-center">{error}</p>
          </div>
        ) : (
          <div className="relative w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden bg-black nm-inset">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              playsInline
            />
            {/* Outline guide */}
            <div className="absolute inset-0 border-2 border-primary/50 m-8 rounded-lg pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
            <div className="absolute bottom-4 inset-x-0 flex flex-col items-center text-white/80 pointer-events-none text-sm animate-pulse flex items-center justify-center gap-2">
              <ScanLine className="size-4" /> QR / ბარკოდი მოაქციე ჩარჩოში
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end w-full">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="nm-btn px-6 py-2 rounded-xl text-muted-foreground"
          >
            გაუქმება
          </button>
        </div>
      </div>
    </Modal>
  );
}
