import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Navigation, MapPin, Route as RouteIcon } from "lucide-react";

import { Pantalla } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { listarPaquetes } from "@/lib/sheets.functions";
import { optimizarRuta } from "@/lib/ruta.functions";

export const Route = createFileRoute("/ruta")({
  head: () => ({
    meta: [
      { title: "Ruta de entrega | Reparto Coordinadora" },
      {
        name: "description",
        content: "Ordena las direcciones pendientes en el recorrido más corto y ábrelo en Google Maps.",
      },
      { property: "og:title", content: "Ruta de entrega | Reparto Coordinadora" },
      {
        property: "og:description",
        content: "Ordena las direcciones pendientes en el recorrido más corto y ábrelo en Google Maps.",
      },
    ],
  }),
  component: RutaPage,
});

const INICIO_FIJO = "CL 53A # 47A - 38 Los Naranjos Itagüí";

function RutaPage() {
  const [ciudad, setCiudad] = useState("");
  const [inicio] = useState(INICIO_FIJO);
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const optimizar = useServerFn(optimizarRuta);

  useEffect(() => {
    setCiudad(localStorage.getItem("ciudad") ?? "Itagüí");
  }, []);

  const { data } = useQuery({ queryKey: ["paquetes"], queryFn: () => listarPaquetes() });

  const pendientes = (data?.paquetes ?? []).filter(
    (p) => p.entregaEfectiva === "" && p.fechaDevolucion === "",
  );
  const conDireccion = pendientes.filter((p) => p.direccion.trim().length > 2);
  const sinDireccion = pendientes.filter((p) => p.direccion.trim().length <= 2);

  const elegidas = conDireccion.filter((p) => seleccion[p.guia] ?? true);

  const mutacion = useMutation({
    mutationFn: () => {
      localStorage.setItem("ciudad", ciudad);
      return optimizar({
        data: {
          ciudad,
          inicio,
          paradas: elegidas.map((p) => ({ guia: p.guia, nombre: p.nombre, direccion: p.direccion })),
        },
      });
    },
    onError: (e: Error) => toast.error("No se pudo calcular la ruta", { description: e.message }),
  });

  const resultado = mutacion.data;

  return (
    <Pantalla titulo="Ruta de entrega" descripcion={`${pendientes.length} paquetes pendientes`}>
      <Card className="space-y-3 p-4">
        <div>
          <Label htmlFor="ciudad">Ciudad</Label>
          <Input id="ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Pereira" />
        </div>
        <div>
          <Label htmlFor="inicio">Punto de partida</Label>
          <Input id="inicio" value={inicio} readOnly className="bg-muted" />
        </div>
        <Button
          className="w-full"
          disabled={mutacion.isPending || !inicio || !ciudad || elegidas.length === 0}
          onClick={() => mutacion.mutate()}
        >
          <RouteIcon className="mr-2 h-4 w-4" />
          {mutacion.isPending ? "Calculando ruta…" : `Optimizar ${elegidas.length} paradas`}
        </Button>
        {mutacion.isPending && (
          <p className="text-xs text-muted-foreground">
            Estamos ubicando cada dirección en el mapa; toma unos segundos por parada.
          </p>
        )}
      </Card>

      {resultado && "error" in resultado && resultado.error && (
        <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{resultado.error}</p>
      )}

      {resultado && "orden" in resultado && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">
              Recorrido · {resultado.distanciaKm} km aprox.
            </h2>
            <Button size="sm" asChild>
              <a href={resultado.mapsUrl} target="_blank" rel="noreferrer">
                <Navigation className="mr-2 h-4 w-4" /> Abrir en Maps
              </a>
            </Button>
          </div>
          {resultado.orden.map((p) => (
            <Card key={p.guia} className="flex items-start gap-3 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {p.posicion}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{p.nombre || p.guia}</p>
                <p className="text-sm text-muted-foreground">{p.direccion}</p>
                <a
                  className="text-xs text-primary underline"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.direccion}, ${ciudad}, Colombia`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Navegar a esta dirección
                </a>
              </div>
            </Card>
          ))}
          {(resultado.sinUbicar?.length ?? 0) > 0 && (
            <Card className="p-4">
              <p className="text-sm font-semibold">No pudimos ubicar en el mapa</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {(resultado.sinUbicar ?? []).map((p) => (
                  <li key={p.guia}>
                    {p.guia} — {p.direccion}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        <h2 className="font-display text-base font-semibold">Paradas disponibles</h2>
        {conDireccion.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Agrega la dirección de los paquetes para armar la ruta.
          </p>
        )}
        {conDireccion.map((p) => (
          <label key={p.guia} className="flex items-start gap-3 rounded-lg bg-card p-3 shadow-sm">
            <Checkbox
              checked={seleccion[p.guia] ?? true}
              onCheckedChange={(v) => setSeleccion((s) => ({ ...s, [p.guia]: Boolean(v) }))}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{p.nombre || p.guia}</p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" /> {p.direccion}
              </p>
            </div>
          </label>
        ))}
        {sinDireccion.length > 0 && (
          <p className="pt-2 text-xs text-muted-foreground">
            {sinDireccion.length} paquetes pendientes aún no tienen dirección; agrégala en Entregas.
          </p>
        )}
      </div>
    </Pantalla>
  );
}
