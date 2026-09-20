import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

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
async function comprimir(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function FotoEtiqueta({ onDatos }: { onDatos: (d: DatosEtiqueta) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const leer = useServerFn(leerEtiqueta);

  const mutacion = useMutation({
    mutationFn: async (file: File) => {
      const imagen = await comprimir(file);
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

  return (
    <div className="space-y-3">
      <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-xl bg-secondary">
        {vista ? (
          <img src={vista} alt="Etiqueta capturada" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <p className="px-6 text-center text-sm">
              Toma una foto de la etiqueta completa y llenamos los datos por ti.
            </p>
          </div>
        )}
        {mutacion.isPending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Leyendo la etiqueta…
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) mutacion.mutate(file);
        }}
      />
      <Button className="w-full" disabled={mutacion.isPending} onClick={() => inputRef.current?.click()}>
        <Camera className="mr-2 h-4 w-4" /> Tomar foto de la etiqueta
      </Button>
    </div>
  );
}
