import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { leerEtiqueta } from "@/lib/etiqueta.functions";

export interface DatosEtiqueta {
  guia: string;
  nombre: string;
  direccion: string;
  telefono: string;
  cobro: boolean;
  valor: number;
}

/** Reduce la foto para que viaje rápido y la IA la lea bien. */
async function comprimir(bitmap: ImageBitmap): Promise<string> {
  const max = 1280;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const contexto = canvas.getContext("2d", { alpha: false });
  if (!contexto) {
    bitmap.close();
    throw new Error("El teléfono no pudo preparar la foto.");
  }
  contexto.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (resultado) => (resultado ? resolve(resultado) : reject(new Error("No se pudo reducir la foto."))),
      "image/jpeg",
      0.72,
    );
  });
  canvas.width = 1;
  canvas.height = 1;

  return new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No se pudo leer la foto."));
    lector.readAsDataURL(blob);
  });
}

async function deArchivo(file: File): Promise<string> {
  const original = await createImageBitmap(file, {
    resizeWidth: 1280,
    resizeHeight: 1280,
    resizeQuality: "high",
  });
  return comprimir(original);
}

export function FotoEtiqueta({ onDatos }: { onDatos: (d: DatosEtiqueta) => void }) {
  const [vista, setVista] = useState<string | null>(null);
  const [activa, setActiva] = useState(false);
  const [errorCamara, setErrorCamara] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const leer = useServerFn(leerEtiqueta);

  const mutacion = useMutation({
    mutationFn: async (imagen: string) => {
      setVista(imagen);
      return leer({ data: { imagen } });
    },
    onSuccess: (d) => {
      if (d.guia.length < 8) {
        toast.error("No se leyó la guía", { description: "Acerca más la cámara a la etiqueta." });
        return;
      }
      onDatos(d);
    },
    onError: (e: Error) => toast.error("No pudimos leer la etiqueta", { description: e.message }),
  });

  function detener() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActiva(false);
  }

  useEffect(() => detener, []);

  useEffect(() => {
    if (activa && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [activa]);

  async function abrirCamara() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setErrorCamara(false);
      setActiva(true);
    } catch {
      setErrorCamara(true);
      toast.error("No pudimos abrir la cámara", {
        description: "Usa la opción de tomar foto con la app del teléfono.",
      });
    }
  }

  async function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      const bitmap = await createImageBitmap(video);
      detener();
      const imagen = await comprimir(bitmap);
      mutacion.mutate(imagen);
    } catch (e: unknown) {
      detener();
      toast.error("No se pudo tomar la foto", {
        description: e instanceof Error ? e.message : "Intenta de nuevo.",
      });
    }
  }

  async function desdeArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      mutacion.mutate(await deArchivo(file));
    } catch (err: unknown) {
      toast.error("No se pudo procesar la foto", {
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-xl bg-secondary">
        {activa ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : vista ? (
          <img src={vista} alt="Etiqueta capturada" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <p className="px-6 text-center text-sm">
              Abre la cámara, enfoca la etiqueta completa y llenamos los datos por ti.
            </p>
          </div>
        )}
        {mutacion.isPending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Leyendo la etiqueta…
          </div>
        )}
        {activa && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2"
            aria-label="Cerrar cámara"
            onClick={detener}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {activa ? (
        <Button className="w-full" onClick={capturar} disabled={mutacion.isPending}>
          <Camera className="mr-2 h-4 w-4" /> Capturar etiqueta
        </Button>
      ) : (
        <Button className="w-full" onClick={abrirCamara} disabled={mutacion.isPending}>
          <Camera className="mr-2 h-4 w-4" /> Abrir cámara
        </Button>
      )}

      {errorCamara && (
        <div className="relative">
          <Button variant="outline" className="pointer-events-none w-full" tabIndex={-1}>
            Tomar foto con la app del teléfono
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Tomar foto con la app del teléfono"
            disabled={mutacion.isPending}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={desdeArchivo}
          />
        </div>
      )}
    </div>
  );
}
