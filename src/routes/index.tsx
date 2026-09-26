import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Save, ScanLine, ClipboardPaste, Camera } from "lucide-react";

import { Escaner, guiaDe } from "@/components/Escaner";
import { FotoEtiqueta, type DatosEtiqueta } from "@/components/FotoEtiqueta";
import { Pantalla } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { guardarPaquetes, listarPaquetes } from "@/lib/sheets.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Registrar guías | Reparto Coordinadora" },
      {
        name: "description",
        content: "Escanea las guías de cada despacho y quedan registradas en tu planilla al instante.",
      },
      { property: "og:title", content: "Registrar guías | Reparto Coordinadora" },
      {
        property: "og:description",
        content: "Escanea las guías de cada despacho y quedan registradas en tu planilla al instante.",
      },
    ],
  }),
  component: Registro,
});

interface Borrador {
  id: string;
  guia: string;
  nombre: string;
  cobro: boolean;
  valor: string;
  direccion: string;
  observaciones: string;
}

function nuevo(guia: string): Borrador {
  return {
    id: `${guia}-${Date.now()}`,
    guia,
    nombre: "",
    cobro: false,
    valor: "",
    direccion: "",
    observaciones: "",
  };
}

function Registro() {
  const [lista, setLista] = useState<Borrador[]>([]);
  const [pegado, setPegado] = useState("");
  const guardar = useServerFn(guardarPaquetes);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["paquetes"],
    queryFn: () => listarPaquetes(),
  });

  const hoy = data?.hoy ?? "";
  const deHoy = (data?.paquetes ?? []).filter((p) => p.fecha === hoy);

  function agregar(guia: string, extra?: Partial<Borrador>) {
    const limpia = guiaDe(guia);
    if (limpia.length !== 11) {
      toast.error("La guía debe tener 11 dígitos", {
        description: guia.replace(/\D/g, "") || "No se leyó ningún número",
      });
      return;
    }
    setLista((prev) => {
      if (prev.some((p) => p.guia === limpia)) {
        toast.warning("Esa guía ya está en la lista");
        return prev;
      }
      if (data?.paquetes.some((p) => p.guia === limpia && p.fecha === hoy)) {
        toast.warning("Esa guía ya está registrada hoy");
        return prev;
      }
      toast.success(`Guía ${limpia} agregada`);
      return [{ ...nuevo(limpia), ...extra }, ...prev];
    });
  }

  function agregarEtiqueta(d: DatosEtiqueta) {
    agregar(d.guia, {
      nombre: d.nombre,
      direccion: d.direccion,
      cobro: d.cobro,
      valor: d.cobro && d.valor ? String(d.valor) : "",
      observaciones: d.telefono ? `Tel: ${d.telefono}` : "",
    });
  }

  function agregarPegadas() {
    const guias = pegado
      .split(/[\s,;]+/)
      .map((g) => guiaDe(g))
      .filter((g) => g.length === 11);
    if (!guias.length) {
      toast.error("No encontramos guías de 11 dígitos en el texto");
      return;
    }
    const existentes = new Set([
      ...lista.map((l) => l.guia),
      ...(data?.paquetes ?? []).filter((p) => p.fecha === hoy).map((p) => p.guia),
    ]);
    const nuevas = guias.filter((g) => !existentes.has(g));
    setLista((prev) => [...nuevas.map(nuevo), ...prev]);
    setPegado("");
    toast.success(`${nuevas.length} guías agregadas`, {
      description: guias.length - nuevas.length ? `${guias.length - nuevas.length} repetidas se omitieron` : undefined,
    });
  }

  const mutacion = useMutation({
    mutationFn: () =>
      guardar({
        data: {
          items: lista.map((l) => ({
            guia: l.guia,
            nombre: l.nombre,
            cobro: l.cobro ? ("SI" as const) : ("NO" as const),
            valor: Number(l.valor.replace(/\D/g, "")) || 0,
            direccion: l.direccion,
            observaciones: l.observaciones,
          })),
        },
      }),
    onSuccess: (r) => {
      setLista([]);
      qc.invalidateQueries({ queryKey: ["paquetes"] });
      toast.success(`${r.guardados} paquetes guardados en tu planilla`, {
        description: r.duplicados ? `${r.duplicados} ya existían` : undefined,
      });
    },
    onError: (e: Error) => toast.error("No se pudo guardar", { description: e.message }),
  });

  function editar(id: string, campos: Partial<Borrador>) {
    setLista((prev) => prev.map((l) => (l.id === id ? { ...l, ...campos } : l)));
  }

  return (
    <Pantalla titulo="Registrar guías" descripcion={`Hoy ${hoy} · ${deHoy.length} paquetes registrados`}>
      <Tabs defaultValue="foto">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="foto" className="text-xs">
            <Camera className="mr-1 h-4 w-4" /> Foto
          </TabsTrigger>
          <TabsTrigger value="escanear" className="text-xs">
            <ScanLine className="mr-1 h-4 w-4" /> Escanear
          </TabsTrigger>
          <TabsTrigger value="pegar" className="text-xs">
            <ClipboardPaste className="mr-1 h-4 w-4" /> Pegar
          </TabsTrigger>
        </TabsList>
        <TabsContent value="foto" className="mt-4">
          <FotoEtiqueta onDatos={agregarEtiqueta} />
        </TabsContent>
        <TabsContent value="escanear" className="mt-4">
          <Escaner onCodigo={(g) => agregar(g)} />
        </TabsContent>
        <TabsContent value="pegar" className="mt-4 space-y-3">
          <Textarea
            value={pegado}
            onChange={(e) => setPegado(e.target.value)}
            placeholder="Pega o escribe las guías, una por línea"
            rows={6}
          />
          <Button className="w-full" onClick={agregarPegadas}>
            <Plus className="mr-2 h-4 w-4" /> Agregar a la lista
          </Button>
        </TabsContent>
      </Tabs>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Por guardar ({lista.length})</h2>
          {lista.length > 0 && (
            <Button size="sm" disabled={mutacion.isPending} onClick={() => mutacion.mutate()}>
              <Save className="mr-2 h-4 w-4" />
              {mutacion.isPending ? "Guardando…" : "Guardar en planilla"}
            </Button>
          )}
        </div>

        {lista.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Escanea el código de barras de cada paquete y aparecerá aquí.
          </p>
        )}

        {lista.map((l) => (
          <Card key={l.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold tracking-wide">{l.guia}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setLista((prev) => prev.filter((x) => x.id !== l.id))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="grid gap-3">
              <div>
                <Label htmlFor={`n-${l.id}`}>Nombre</Label>
                <Input
                  id={`n-${l.id}`}
                  value={l.nombre}
                  onChange={(e) => editar(l.id, { nombre: e.target.value })}
                  placeholder="Destinatario"
                />
              </div>
              <div>
                <Label htmlFor={`d-${l.id}`}>Dirección</Label>
                <Input
                  id={`d-${l.id}`}
                  value={l.direccion}
                  onChange={(e) => editar(l.id, { direccion: e.target.value })}
                  placeholder="Ej: Carrera 24 #12-30"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                <Label htmlFor={`c-${l.id}`} className="mb-0">
                  Tiene recaudo (RCE / FCE)
                </Label>
                <Switch
                  id={`c-${l.id}`}
                  checked={l.cobro}
                  onCheckedChange={(v) => editar(l.id, { cobro: v })}
                />
              </div>
              {l.cobro && (
                <div>
                  <Label htmlFor={`v-${l.id}`}>Valor a recaudar</Label>
                  <Input
                    id={`v-${l.id}`}
                    inputMode="numeric"
                    value={l.valor}
                    onChange={(e) => editar(l.id, { valor: e.target.value })}
                    placeholder="89000"
                  />
                </div>
              )}
              <div>
                <Label htmlFor={`o-${l.id}`}>Observaciones</Label>
                <Input
                  id={`o-${l.id}`}
                  value={l.observaciones}
                  onChange={(e) => editar(l.id, { observaciones: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Pantalla>
  );
}
