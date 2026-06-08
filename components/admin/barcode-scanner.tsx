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
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = usePlayroom();

  // Keep a ref to prevent multiple scans of the same frame
  const isScanningRef = useRef(false);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    isScanningRef.current = false;
  };

  const startCamera = async () => {
    setError(null);
    try {
      let stream: MediaStream | null = null;
      try {
        // Prefer rear camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch (err) {
        // Fallback to default
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (!stream) {
        throw new Error('No camera stream');
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        startDecoding(videoRef.current);
      }
    } catch (err: unknown) {
      console.error('Camera error:', err);
      setError('კამერაზე წვდომა ვერ მოხერხდა — დართე ნებართვა ან შეამოწმე კავშირი.');
      pushToast('danger', 'კამერაზე წვდომა ვერ მოხერხდა — დართე ნებართვა');
    }
  };

  const startDecoding = async (videoEl: HTMLVideoElement) => {
    const reader = new BrowserMultiFormatReader();
    isScanningRef.current = true;

    const decodeLoop = async () => {
      if (!isScanningRef.current || !videoEl || videoEl.paused || videoEl.ended) {
        return;
      }

      try {
        const result = reader.decode(videoEl);
        if (result && result.getText()) {
          const code = result.getText();
          isScanningRef.current = false;
          onScan(code);
          stopCamera();
          onClose();
          return; // Stop loop
        }
      } catch (e) {
        // NotFoundException is thrown when no barcode is found in the current frame, it's normal.
      }

      if (isScanningRef.current) {
        requestAnimationFrame(decodeLoop);
      }
    };

    requestAnimationFrame(decodeLoop);
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
          <div className="flex flex-col items-center justify-center text-destructive h-64">
            <CameraOff className="size-10 mb-4 opacity-50" />
            <p className="text-center">{error}</p>
          </div>
        ) : (
          <div className="relative w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden bg-black nm-inset">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
            />
            {/* Outline guide */}
            <div className="absolute inset-0 border-2 border-primary/50 m-8 rounded-lg pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
            <div className="absolute bottom-4 inset-x-0 flex flex-col items-center text-white/80 pointer-events-none text-sm animate-pulse flex items-center justify-center gap-2">
              <ScanLine className="size-4" /> ბარკოდი მოაქციე ჩარჩოში
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
