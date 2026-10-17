import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, ImageUp, Loader2 } from "lucide-react";
import { type DatosEtiqueta } from "@/components/FotoEtiqueta";
import { leerEtiqueta } from "@/lib/etiqueta.functions";

interface Props {
  onDatos: (d: DatosEtiqueta) => void;
}

/**
 * Saca la guía de 11 dígitos del código leído.
 * Los códigos de Coordinadora traen la guía seguida de 3 dígitos de unidad ("001"):
 *   QR:       70020010200080014536396991942001 → 36396991942
 *   Barras:   768323000359001                  → 68323000359
 */
export function guiaDe(texto: string): string {
  const grupo = texto.match(/(?<!\d)(\d{11})(?!\d)/);
  if (grupo) return grupo[1]!;
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length === 11) return digitos;
  if (digitos.length >= 14) return digitos.slice(-14, -3);
  if (digitos.length > 11) return digitos.slice(0, 11);
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

/** Lee la guía desde una foto guardada en el teléfono, sin deformarla. */
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
export function Escaner({ onDatos }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const ultimoRef = useRef<{ codigo: string; t: number }>({ codigo: "", t: 0 });
  const fotoRef = useRef<HTMLInputElement>(null);
  const [activo, setActivo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [leyendoDatos, setLeyendoDatos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leer = useServerFn(leerEtiqueta);

  useEffect(() => () => controlsRef.current?.stop(), []);

  /** Con la guía ya leída, saca el resto de datos de la etiqueta con IA. */
  async function completarDatos(guia: string, imagen: string | null) {
    if (!imagen) {
      toast.warning("No pudimos preparar la foto para leer los demás datos", {
        description: "Complétalos en la lista de abajo.",
      });
      if (guia) onDatos({ guia, nombre: "", direccion: "", telefono: "", cobro: false, valor: 0 });
      return;
    }
    setLeyendoDatos(true);
    try {
      const d = await leer({ data: { imagen } });
      // La guía impresa en la etiqueta manda; el código de barras puede ser otro número.
      const guiaIA = guiaDe(d.guia);
      if (!guiaIA && !guia) {
        setError("No encontramos la guía en esa foto. Prueba con otra más de cerca y sin sombra.");
        return;
      }
      onDatos({
        guia: guiaIA || guia,
        nombre: d.nombre,
        direccion: d.direccion,
        telefono: d.telefono,
        cobro: d.cobro,
        valor: d.cobro ? d.valor : 0,
      });
    } catch (e) {
      console.error(e);
      const motivo = e instanceof Error ? e.message : "";
      toast.warning(
        guia ? "Agregamos la guía, pero no pudimos leer los demás datos" : "No pudimos leer la etiqueta",
        { description: `${motivo ? motivo + " " : ""}Complétalos en la lista de abajo.`, duration: 8000 },
      );
      if (guia) onDatos({ guia, nombre: "", direccion: "", telefono: "", cobro: false, valor: 0 });
    } finally {
      setLeyendoDatos(false);
    }
  }

  /** Captura el cuadro actual de la cámara y lo reduce para la IA. */
  async function cuadroDeCamara(): Promise<string | null> {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    try {
      let bitmap = await createImageBitmap(video);
      const max = 1280;
      const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      const contexto = canvas.getContext("2d", { alpha: false });
      if (!contexto) {
        bitmap.close();
        return null;
      }
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((r) => resolve(r ?? new Blob()), "image/jpeg", 0.72),
      );
      canvas.width = 1;
      canvas.height = 1;
      if (!blob.size) return null;
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("No se pudo leer la foto."));
        fr.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

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
          if (
            (ultimoRef.current.codigo === texto && ahora - ultimoRef.current.t < 2500) ||
            leyendoDatos
          )
            return;
          ultimoRef.current = { codigo: texto, t: ahora };
          if (navigator.vibrate) navigator.vibrate(60);
          void (async () => {
            const imagen = await cuadroDeCamara();
            await completarDatos(texto, imagen);
          })();
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
      // La misma foto sirve para leer el resto de la etiqueta.
      let imagen: string | null = null;
      try {
        let bitmap = await createImageBitmap(file, { resizeWidth: 1280, resizeQuality: "high" });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, bitmap.width);
        canvas.height = Math.max(1, bitmap.height);
        const contexto = canvas.getContext("2d", { alpha: false });
        if (contexto) {
          contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((r) => resolve(r ?? new Blob()), "image/jpeg", 0.72),
          );
          if (blob.size) {
            imagen = await new Promise<string>((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result));
              fr.onerror = () => reject(new Error("No se pudo leer la foto."));
              fr.readAsDataURL(blob);
            });
          }
        }
        bitmap.close();
        canvas.width = 1;
        canvas.height = 1;
      } catch {
        imagen = null;
      }
      await completarDatos(guia, imagen);
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
        {!activo && !leyendo && !leyendoDatos && (
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
        {(leyendo || leyendoDatos) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            {leyendo ? "Leyendo la foto…" : "Leyendo los datos de la etiqueta…"}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {activo ? (
        <Button variant="secondary" className="w-full" onClick={detener}>
          <CameraOff className="mr-2 h-4 w-4" /> Apagar cámara
        </Button>
      ) : (
        <Button className="w-full" onClick={iniciar} disabled={leyendo || leyendoDatos}>
          <Camera className="mr-2 h-4 w-4" /> Escanear guías
        </Button>
      )}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => fotoRef.current?.click()}
        disabled={leyendo || leyendoDatos}
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
        disabled={leyendo || leyendoDatos}
        className="hidden"
        onChange={desdeGaleria}
      />
    </div>
  );
}
