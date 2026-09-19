import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface Props {
  onCodigo: (codigo: string) => void;
}

/** Lector de códigos de barras con la cámara del teléfono. */
export function Escaner({ onCodigo }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const ultimoRef = useRef<{ codigo: string; t: number }>({ codigo: "", t: 0 });
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function iniciar() {
    setError(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
        BarcodeFormat.EAN_13,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
      ]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const texto = result.getText().replace(/\D/g, "");
          if (!texto) return;
          const ahora = Date.now();
          if (ultimoRef.current.codigo === texto && ahora - ultimoRef.current.t < 2500) return;
          ultimoRef.current = { codigo: texto, t: ahora };
          if (navigator.vibrate) navigator.vibrate(60);
          onCodigo(texto);
        },
      );
      controlsRef.current = controls;
      setActivo(true);
    } catch (e) {
      console.error(e);
      setError("No pudimos abrir la cámara. Revisa los permisos del navegador.");
    }
  }

  function detener() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActivo(false);
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-secondary aspect-4/3">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {!activo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <p className="text-sm">Cámara apagada</p>
          </div>
        )}
        {activo && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-accent" />
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {activo ? (
        <Button variant="secondary" className="w-full" onClick={detener}>
          <CameraOff className="mr-2 h-4 w-4" /> Apagar cámara
        </Button>
      ) : (
        <Button className="w-full" onClick={iniciar}>
          <Camera className="mr-2 h-4 w-4" /> Escanear guías
        </Button>
      )}
    </div>
  );
}
