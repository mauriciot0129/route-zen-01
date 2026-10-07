import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, X, Search, Banknote, Smartphone, Pencil, Mic, MicOff, Save } from "lucide-react";

import { Pantalla } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  actualizarPaquete,
  editarPaquete,
  listarPaquetes,
  type Paquete,
} from "@/lib/sheets.functions";

export const Route = createFileRoute("/entregas")({
  head: () => ({
    meta: [
      { title: "Entregas del día | Reparto Coordinadora" },
      {
        name: "description",
        content: "Marca entregado o fallida, edita datos y usa la voz; todo se guarda en tu planilla.",
      },
      { property: "og:title", content: "Entregas del día | Reparto Coordinadora" },
      {
        property: "og:description",
        content: "Marca entregado o fallida, edita datos y usa la voz; todo se guarda en tu planilla.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Entregas,
});

const TARIFA = 1500;
type Pago = "EFECTIVO" | "TRANSFERENCIA";

interface Edicion {
  guia: string;
  nombre: string;
  cobro: boolean;
  valor: string;
  direccion: string;
  observaciones: string;
}

function sinAcentos(t: string) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function Entregas() {
  const [busqueda, setBusqueda] = useState("");
  const [pagos, setPagos] = useState<Record<number, Pago>>({});
  const [editando, setEditando] = useState<Record<number, Edicion>>({});
  const [escuchando, setEscuchando] = useState(false);
  const [oido, setOido] = useState("");
  const reconocedor = useRef<any>(null);
  const actualizar = useServerFn(actualizarPaquete);
  const editar = useServerFn(editarPaquete);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["paquetes"], queryFn: () => listarPaquetes() });

  const mutacion = useMutation({
    mutationFn: (vars: { row: number; estado: "ENTREGADO" | "FALLIDA"; pago?: Pago }) =>
      actualizar({ data: { ...vars, valorPagar: vars.estado === "ENTREGADO" ? TARIFA : 0 } }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["paquetes"] });
      toast.success(v.estado === "ENTREGADO" ? "Marcado como entregado" : "Marcado como fallida");
    },
    onError: (e: Error) => toast.error("No se pudo actualizar", { description: e.message }),
  });

  const guardarEdicion = useMutation({
    mutationFn: (v: { row: number; e: Edicion }) =>
      editar({
        data: {
          row: v.row,
          guia: v.e.guia,
          nombre: v.e.nombre,
          cobro: v.e.cobro ? "SI" : "NO",
          valor: Number(v.e.valor.replace(/\D/g, "")) || 0,
          direccion: v.e.direccion,
          observaciones: v.e.observaciones,
        },
      }),
    onSuccess: (_r, v) => {
      setEditando((s) => {
        const n = { ...s };
        delete n[v.row];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["paquetes"] });
      toast.success("Cambios guardados en la planilla");
    },
    onError: (e: Error) => toast.error("No se pudo guardar", { description: e.message }),
  });

  const todos = data?.paquetes ?? [];
  const pendientes = todos.filter((p) => p.entregaEfectiva === "" && p.fechaDevolucion === "");
  const filtrados = (busqueda
    ? todos.filter((p) => {
        const dig = busqueda.replace(/\D/g, "");
        return (
          (dig.length > 0 && p.guia.includes(dig)) ||
          sinAcentos(p.nombre).includes(sinAcentos(busqueda.trim()))
        );
      })
    : pendientes
  ).slice(0, 80);

  function marcar(p: Paquete, estado: "ENTREGADO" | "FALLIDA", pagoVoz?: Pago) {
    if (estado === "FALLIDA") return mutacion.mutate({ row: p.row, estado });
    const pago = pagoVoz ?? pagos[p.row];
    if (p.cobro === "SI" && !pago) {
      toast.warning("Elige si el recaudo fue en efectivo o por transferencia");
      return;
    }
    mutacion.mutate({ row: p.row, estado, ...(pago ? { pago } : {}) });
  }

  function empezarEdicion(p: Paquete) {
    setEditando((s) => ({
      ...s,
      [p.row]: {
        guia: p.guia,
        nombre: p.nombre,
        cobro: p.cobro === "SI",
        valor: p.valor.replace(/\D/g, ""),
        direccion: p.direccion,
        observaciones: p.observaciones,
      },
    }));
  }

  // --- Voz ---
  const filtradosRef = useRef(filtrados);
  filtradosRef.current = filtrados;
  const pagosRef = useRef(pagos);
  pagosRef.current = pagos;

  function procesarVoz(texto: string) {
    const t = sinAcentos(texto).trim();
    setOido(texto);
    const lista = filtradosRef.current;
    const objetivo = lista.length === 1 ? lista[0] : undefined;
    const pidePago = /efectivo/.test(t) ? "EFECTIVO" : /transferencia|nequi|daviplata/.test(t) ? "TRANSFERENCIA" : undefined;

    if (/^(buscar|busca|buscame)\b/.test(t)) {
      const q = texto.replace(/^\s*\S+\s*/, "");
      const dig = q.replace(/\D/g, "");
      setBusqueda(dig.length >= 3 ? dig : q);
      return;
    }
    if (/^(limpiar|borrar busqueda|todos)/.test(t)) return setBusqueda("");

    const accion = /fallid|no entreg|devuel/.test(t) ? "FALLIDA" : /entregad|entregar/.test(t) ? "ENTREGADO" : undefined;
    if (!objetivo && (accion || pidePago)) {
      toast.warning("Primero busca un solo paquete", { description: 'Di por ejemplo "buscar María"' });
      return;
    }
    if (objetivo && pidePago) setPagos((s) => ({ ...s, [objetivo.row]: pidePago }));
    if (objetivo && accion) {
      marcar(objetivo, accion, pidePago ?? pagosRef.current[objetivo.row]);
      return;
    }
    if (objetivo && pidePago) return toast.success(`Pago: ${pidePago.toLowerCase()}`);
    if (!accion && !pidePago) setBusqueda(texto.trim());
  }

  useEffect(() => () => reconocedor.current?.abort?.(), []);

  function alternarVoz() {
    if (escuchando) {
      reconocedor.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Tu navegador no permite usar la voz", { description: "Prueba con Chrome." });
      return;
    }
    const r = new SR();
    r.lang = "es-CO";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: any) => {
      const res = e.results[e.results.length - 1];
      if (res.isFinal) procesarVoz(res[0].transcript);
    };
    r.onend = () => setEscuchando(false);
    r.onerror = (e: any) => {
      if (e.error !== "no-speech") toast.error("No se pudo usar el micrófono");
    };
    reconocedor.current = r;
    r.start();
    setEscuchando(true);
  }

  return (
    <Pantalla titulo="Entregas" descripcion={`${pendientes.length} pendientes por entregar`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por guía o nombre"
          />
        </div>
        <Button
          size="icon"
          variant={escuchando ? "destructive" : "default"}
          onClick={alternarVoz}
          aria-label="Usar la voz"
        >
          {escuchando ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
      </div>
      {escuchando && (
        <div className="mt-2 rounded-lg bg-secondary p-3 text-xs">
          <p className="font-semibold">Escuchando… di:</p>
          <p className="text-muted-foreground">
            "buscar María" · "efectivo" · "transferencia" · "entregado" · "fallida" · "limpiar"
          </p>
          {oido && <p className="mt-1">Oí: “{oido}”</p>}
        </div>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Cargando tu planilla…</p>}

      <div className="mt-4 space-y-3">
        {filtrados.map((p) => {
          const ed = editando[p.row];
          const set = (c: Partial<Edicion>) =>
            setEditando((s) => ({ ...s, [p.row]: { ...(s[p.row] as Edicion), ...c } }));
          return (
            <Card key={p.row} className="space-y-3 p-4">
              {ed ? (
                <div className="grid gap-3">
                  <div>
                    <Label>Guía</Label>
                    <Input inputMode="numeric" value={ed.guia} onChange={(e) => set({ guia: e.target.value })} />
                  </div>
                  <div>
                    <Label>Nombre</Label>
                    <Input value={ed.nombre} onChange={(e) => set({ nombre: e.target.value })} />
                  </div>
                  <div>
                    <Label>Dirección</Label>
                    <Input value={ed.direccion} onChange={(e) => set({ direccion: e.target.value })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                    <Label className="mb-0">Tiene recaudo</Label>
                    <Switch checked={ed.cobro} onCheckedChange={(v) => set({ cobro: v })} />
                  </div>
                  {ed.cobro && (
                    <div>
                      <Label>Valor a recaudar</Label>
                      <Input inputMode="numeric" value={ed.valor} onChange={(e) => set({ valor: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <Label>Observaciones</Label>
                    <Input value={ed.observaciones} onChange={(e) => set({ observaciones: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={guardarEdicion.isPending || !ed.guia.trim()}
                      onClick={() => guardarEdicion.mutate({ row: p.row, e: ed })}
                    >
                      <Save className="mr-2 h-4 w-4" /> Guardar
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        setEditando((s) => {
                          const n = { ...s };
                          delete n[p.row];
                          return n;
                        })
                      }
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.nombre || "Sin nombre"}</p>
                      <p className="font-display text-sm tracking-wide text-muted-foreground">{p.guia}</p>
                      {p.direccion && <p className="text-sm text-muted-foreground">{p.direccion}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => empezarEdicion(p)}>
                        <Pencil className="mr-1 h-3 w-3" /> Editar
                      </Button>
                      {p.entregaEfectiva === "SI" && (
                        <Badge className="bg-success text-success-foreground">Entregado</Badge>
                      )}
                      {p.fechaDevolucion !== "" && <Badge variant="destructive">Fallida</Badge>}
                      {p.cobro === "SI" && <Badge variant="secondary">Recaudo {p.valor}</Badge>}
                    </div>
                  </div>

                  {p.observaciones && <p className="text-sm text-muted-foreground">{p.observaciones}</p>}

                  {p.cobro === "SI" && (
                    <div className="rounded-lg bg-secondary p-3">
                      <p className="text-xs font-semibold">¿Cómo pagó el recaudo de {p.valor}?</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant={pagos[p.row] === "EFECTIVO" ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => setPagos((s) => ({ ...s, [p.row]: "EFECTIVO" }))}
                        >
                          <Banknote className="mr-2 h-4 w-4" /> Efectivo
                        </Button>
                        <Button
                          size="sm"
                          variant={pagos[p.row] === "TRANSFERENCIA" ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => setPagos((s) => ({ ...s, [p.row]: "TRANSFERENCIA" }))}
                        >
                          <Smartphone className="mr-2 h-4 w-4" /> Transferencia
                        </Button>
                      </div>
                      {pagos[p.row] === "TRANSFERENCIA" && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Al marcar la entrega se borra el cobro y el valor: no cuenta en el efectivo recaudado.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={mutacion.isPending} onClick={() => marcar(p, "ENTREGADO")}>
                      <Check className="mr-2 h-4 w-4" /> Entregado
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      disabled={mutacion.isPending}
                      onClick={() => marcar(p, "FALLIDA")}
                    >
                      <X className="mr-2 h-4 w-4" /> Fallida
                    </Button>
                  </div>
                </>
              )}
            </Card>
          );
        })}
        {!isLoading && filtrados.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No hay paquetes pendientes.
          </p>
        )}
      </div>
    </Pantalla>
  );
}
