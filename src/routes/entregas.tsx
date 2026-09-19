import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Undo2, Search } from "lucide-react";

import { Pantalla } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { actualizarPaquete, listarPaquetes, type Paquete } from "@/lib/sheets.functions";

export const Route = createFileRoute("/entregas")({
  head: () => ({
    meta: [
      { title: "Entregas del día | Reparto Coordinadora" },
      {
        name: "description",
        content: "Marca entregado o devuelto y completa direcciones; todo se guarda en tu planilla.",
      },
      { property: "og:title", content: "Entregas del día | Reparto Coordinadora" },
      {
        property: "og:description",
        content: "Marca entregado o devuelto y completa direcciones; todo se guarda en tu planilla.",
      },
    ],
  }),
  component: Entregas,
});

const TARIFA = 1500;

function Entregas() {
  const [busqueda, setBusqueda] = useState("");
  const [direcciones, setDirecciones] = useState<Record<number, string>>({});
  const actualizar = useServerFn(actualizarPaquete);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["paquetes"], queryFn: () => listarPaquetes() });

  const mutacion = useMutation({
    mutationFn: (vars: { row: number; estado: "ENTREGADO" | "DEVUELTO" | "PENDIENTE"; direccion?: string }) =>
      actualizar({ data: { ...vars, valorPagar: TARIFA } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paquetes"] });
      toast.success("Planilla actualizada");
    },
    onError: (e: Error) => toast.error("No se pudo actualizar", { description: e.message }),
  });

  const todos = data?.paquetes ?? [];
  const pendientes = todos.filter((p) => p.entregaEfectiva === "" && p.fechaDevolucion === "");
  const filtrados = (busqueda
    ? todos.filter(
        (p) =>
          p.guia.includes(busqueda.replace(/\D/g, "")) ||
          p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
      )
    : pendientes
  ).slice(0, 80);

  function guardarDireccion(p: Paquete) {
    const dir = direcciones[p.row];
    if (dir === undefined || dir === p.direccion) return;
    mutacion.mutate({ row: p.row, estado: "PENDIENTE", direccion: dir });
  }

  return (
    <Pantalla titulo="Entregas" descripcion={`${pendientes.length} pendientes por entregar`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por guía o nombre"
        />
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Cargando tu planilla…</p>}

      <div className="mt-4 space-y-3">
        {filtrados.map((p) => (
          <Card key={p.row} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.nombre || "Sin nombre"}</p>
                <p className="font-display text-sm tracking-wide text-muted-foreground">{p.guia}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {p.entregaEfectiva === "SI" && <Badge className="bg-success text-success-foreground">Entregado</Badge>}
                {p.fechaDevolucion !== "" && <Badge variant="destructive">Devuelto</Badge>}
                {p.cobro === "SI" && <Badge variant="secondary">Recaudo {p.valor}</Badge>}
              </div>
            </div>

            <Input
              value={direcciones[p.row] ?? p.direccion}
              onChange={(e) => setDirecciones((d) => ({ ...d, [p.row]: e.target.value }))}
              onBlur={() => guardarDireccion(p)}
              placeholder="Dirección de entrega"
            />

            {p.observaciones && <p className="text-sm text-muted-foreground">{p.observaciones}</p>}

            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={mutacion.isPending}
                onClick={() => mutacion.mutate({ row: p.row, estado: "ENTREGADO" })}
              >
                <Check className="mr-2 h-4 w-4" /> Entregado
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                disabled={mutacion.isPending}
                onClick={() => mutacion.mutate({ row: p.row, estado: "DEVUELTO" })}
              >
                <Undo2 className="mr-2 h-4 w-4" /> Devuelto
              </Button>
            </div>
          </Card>
        ))}
        {!isLoading && filtrados.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No hay paquetes pendientes.
          </p>
        )}
      </div>
    </Pantalla>
  );
}
