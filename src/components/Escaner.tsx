import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, ImageUp, Loader2 } from "lucide-react";

interface Props {
  onCodigo: (codigo: string) => void;
}

/** Saca la guía de 11 dígitos del código leído. */
export function guiaDe(texto: string): string {
  const grupo = texto.match(/(?<!\d)(\d{11})(?!\d)/);
  if (grupo) return grupo[1]!;
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length === 11) return digitos;
  if (digitos.length > 11) return digitos.slice(-11);
  return "";
}

/** Formatos que aparecen en las etiquetas de Coordinadora. */
async function crearLector() {
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
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
}

/** Lee la guía desde una foto guardada en el teléfono, sin deformedarla. */
async function guiaDesdeFoto(file: File): Promise<string> {
  const lector = await crearLector();
  const canvas = document.createElement("canvas");
  const contexto = canvas.getContext("2d", { alpha: false });
  if (!contexto) throw new Error("El teléfono no pudo preparar la foto.");

  // Solo resizeWidth: el navegador mantiene la proporción de la foto.
  for (const lado of [1400, 800]) {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file, { resizeWidth: lado, resizeQuality: "high" });
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const guia = guiaDe(lector.decodeFromCanvas(canvas).getText());
      if (guia) return guia;
    } catch {
      // ese tamaño no alcanzó, se intenta con el siguiente
    } finally {
      bitmap?.close();
    }
  }

  canvas.width = 1;
  canvas.height = 1;
  return "";
}

/** Lector de códigos de barras con la cámara del teléfono o con una foto. */
export function Escaner({ onCodigo }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const ultimoRef = useRef<{ codigo: string; t: number }>({ codigo: "", t: 0 });
  const fotoRef = useRef<HTMLInputElement>(null);
  const [activo, setActivo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function iniciar() {
    setError(null);
    try {
      const reader = await crearLector();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const texto = guiaDe(result.getText());
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

  async function desdeGaleria(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLeyendo(true);
    setError(null);
    try {
      const guia = await guiaDesdeFoto(file);
      if (!guia) {
        setError("No encontramos un código en esa foto. Prueba con otra más de cerca y sin sombra.");
        return;
      }
      if (navigator.vibrate) navigator.vibrate(60);
      onCodigo(guia);
    } catch (err) {
      console.error(err);
      setError("No pudimos abrir esa foto. Usa una imagen JPG o PNG.");
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-secondary aspect-4/3">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {!activo && !leyendo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <p className="text-center text-sm">
              Cámara apagada · o escanea una foto que ya tengas en la galería
            </p>
          </div>
        )}
        {activo && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-accent" />
        )}
        {leyendo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Leyendo la foto…
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {activo ? (
        <Button variant="secondary" className="w-full" onClick={detener}>
          <CameraOff className="mr-2 h-4 w-4" /> Apagar cámara
        </Button>
      ) : (
        <Button className="w-full" onClick={iniciar} disabled={leyendo}>
          <Camera className="mr-2 h-4 w-4" /> Escanear guías
        </Button>
      )}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => fotoRef.current?.click()}
        disabled={leyendo}
      >
        {leyendo ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ImageUp className="mr-2 h-4 w-4" />
        )}
        {leyendo ? "Leyendo la foto…" : "Escanear foto de la galería"}
      </Button>
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        aria-label="Elegir foto de la galería"
        disabled={leyendo}
        className="hidden"
        onChange={desdeGaleria}
      />
    </div>
  );
}
