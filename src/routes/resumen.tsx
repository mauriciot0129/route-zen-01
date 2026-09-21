import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, PackageCheck, PackageX, Clock, Banknote, Wallet } from "lucide-react";

import { Pantalla } from "@/components/NavBar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listarPaquetes, type Paquete } from "@/lib/sheets.functions";

export const Route = createFileRoute("/resumen")({
  head: () => ({
    meta: [
      { title: "Resumen de reparto | Reparto Coordinadora" },
      {
        name: "description",
        content:
          "Paquetes recibidos, entregados, fallidos y pendientes con el recaudo en efectivo por día, semana, quincena, mes y total.",
      },
      { property: "og:title", content: "Resumen de reparto | Reparto Coordinadora" },
      {
        property: "og:description",
        content:
          "Paquetes recibidos, entregados, fallidos y pendientes con el recaudo en efectivo por día, semana, quincena, mes y total.",
      },
    ],
  }),
  component: Resumen,
});

/** Convierte la fecha de la planilla (d/M/yyyy) a una fecha comparable. */
function aFecha(txt: string): Date | null {
  const m = txt.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function hoyLocal(): Date {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = f.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

type Periodo = "dia" | "semana" | "quincena" | "mes" | "total";

function rango(periodo: Periodo, hoy: Date): { desde: Date; hasta: Date; etiqueta: string } {
  const hasta = hoy;
  if (periodo === "dia") return { desde: hoy, hasta, etiqueta: "Hoy" };
  if (periodo === "semana") {
    const dia = (hoy.getDay() + 6) % 7; // lunes = 0
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dia);
    return { desde, hasta, etiqueta: "Esta semana (desde el lunes)" };
  }
  if (periodo === "quincena") {
    const primera = hoy.getDate() <= 15;
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), primera ? 1 : 16);
    return { desde, hasta, etiqueta: primera ? "Quincena del 1 al 15" : "Quincena del 16 en adelante" };
  }
  if (periodo === "mes") {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return { desde, hasta, etiqueta: "Este mes" };
  }
  return { desde: new Date(2000, 0, 1), hasta: new Date(2999, 0, 1), etiqueta: "Todo el histórico" };
}

function dentro(txt: string, desde: Date, hasta: Date) {
  const f = aFecha(txt);
  if (!f) return false;
  return f.getTime() >= desde.getTime() && f.getTime() <= hasta.getTime();
}

function numero(txt: string) {
  return Number(txt.replace(/[^\d]/g, "")) || 0;
}

function pesos(n: number) {
  return `$${n.toLocaleString("es-CO")}`;
}

function calcular(paquetes: Paquete[], periodo: Periodo, hoy: Date) {
  const { desde, hasta, etiqueta } = rango(periodo, hoy);
  const recibidos = paquetes.filter((p) => dentro(p.fecha, desde, hasta));
  const entregados = paquetes.filter((p) => p.entregaEfectiva === "SI" && dentro(p.fechaEntrega, desde, hasta));
  const fallidos = paquetes.filter((p) => p.fechaDevolucion !== "" && dentro(p.fechaDevolucion, desde, hasta));
  const pendientes = recibidos.filter((p) => p.entregaEfectiva === "" && p.fechaDevolucion === "");
  const efectivo = entregados.filter((p) => p.cobro === "SI").reduce((s, p) => s + numero(p.valor), 0);
  const conEfectivo = entregados.filter((p) => p.cobro === "SI" && numero(p.valor) > 0).length;
  const aPagar = entregados.reduce((s, p) => s + numero(p.valorPagar), 0);
  return { etiqueta, recibidos, entregados, fallidos, pendientes, efectivo, conEfectivo, aPagar };
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Resumen de un rango cualquiera de fechas. */
function calcularRango(paquetes: Paquete[], desde: Date, hasta: Date) {
  const recibidos = paquetes.filter((p) => dentro(p.fecha, desde, hasta));
  const entregados = paquetes.filter((p) => p.entregaEfectiva === "SI" && dentro(p.fechaEntrega, desde, hasta));
  const fallidos = paquetes.filter((p) => p.fechaDevolucion !== "" && dentro(p.fechaDevolucion, desde, hasta));
  const pendientes = recibidos.filter((p) => p.entregaEfectiva === "" && p.fechaDevolucion === "");
  const efectivo = entregados.filter((p) => p.cobro === "SI").reduce((s, p) => s + numero(p.valor), 0);
  const aPagar = entregados.reduce((s, p) => s + numero(p.valorPagar), 0);
  return {
    recibidos: recibidos.length,
    entregados: entregados.length,
    fallidos: fallidos.length,
    pendientes: pendientes.length,
    efectivo,
    aPagar,
  };
}

/** Todos los meses con registros, del más reciente al más antiguo. */
function historial(paquetes: Paquete[]) {
  const claves = new Set<string>();
  for (const p of paquetes) {
    const f = aFecha(p.fecha);
    if (f) claves.add(`${f.getFullYear()}-${f.getMonth()}`);
  }
  return Array.from(claves)
    .map((k) => {
      const [y, m] = k.split("-").map(Number);
      const anio = y!;
      const mes = m!;
      const finMes = new Date(anio, mes + 1, 0).getDate();
      return {
        clave: k,
        titulo: `${MESES[mes]} ${anio}`,
        mes: calcularRango(paquetes, new Date(anio, mes, 1), new Date(anio, mes, finMes)),
        q1: calcularRango(paquetes, new Date(anio, mes, 1), new Date(anio, mes, 15)),
        q2: calcularRango(paquetes, new Date(anio, mes, 16), new Date(anio, mes, finMes)),
        orden: anio * 12 + mes,
      };
    })
    .sort((a, b) => b.orden - a.orden);
}

function Fila({ nombre, r }: { nombre: string; r: ReturnType<typeof calcularRango> }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-2">{nombre}</td>
      <td className="py-2 text-center">{r.recibidos}</td>
      <td className="py-2 text-center text-success">{r.entregados}</td>
      <td className="py-2 text-center text-destructive">{r.fallidos}</td>
      <td className="py-2 text-center">{r.pendientes}</td>
      <td className="py-2 text-right">{pesos(r.efectivo)}</td>
      <td className="py-2 text-right">{pesos(r.aPagar)}</td>
    </tr>
  );
}

function Metrica({
  icono: Icono,
  titulo,
  valor,
  detalle,
  clase,
}: {
  icono: typeof PackagePlus;
  titulo: string;
  valor: string;
  detalle?: string;
  clase: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${clase}`}>
          <Icono className="h-4 w-4" />
        </span>
        <p className="text-sm text-muted-foreground">{titulo}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </Card>
  );
}

function Resumen() {
  const { data, isLoading } = useQuery({ queryKey: ["paquetes"], queryFn: () => listarPaquetes() });
  const paquetes = data?.paquetes ?? [];
  const hoy = hoyLocal();

  const periodos: { valor: Periodo; texto: string }[] = [
    { valor: "dia", texto: "Día" },
    { valor: "semana", texto: "Semana" },
    { valor: "quincena", texto: "Quincena" },
    { valor: "mes", texto: "Mes" },
    { valor: "total", texto: "Total" },
  ];

  const pendientesGlobal = paquetes.filter((p) => p.entregaEfectiva === "" && p.fechaDevolucion === "").length;

  return (
    <Pantalla titulo="Resumen" descripcion={`${paquetes.length} paquetes en la planilla · ${pendientesGlobal} pendientes en total`}>
      {isLoading && <p className="text-sm text-muted-foreground">Calculando tus números…</p>}

      <Tabs defaultValue="dia">
        <TabsList className="grid w-full grid-cols-5">
          {periodos.map((p) => (
            <TabsTrigger key={p.valor} value={p.valor} className="text-xs">
              {p.texto}
            </TabsTrigger>
          ))}
        </TabsList>

        {periodos.map((p) => {
          const r = calcular(paquetes, p.valor, hoy);
          const efectividad = r.entregados.length + r.fallidos.length
            ? Math.round((r.entregados.length * 100) / (r.entregados.length + r.fallidos.length))
            : 0;
          return (
            <TabsContent key={p.valor} value={p.valor} className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">{r.etiqueta}</p>
              <div className="grid grid-cols-2 gap-3">
                <Metrica
                  icono={PackagePlus}
                  titulo="Recibidos"
                  valor={String(r.recibidos.length)}
                  clase="bg-secondary text-secondary-foreground"
                />
                <Metrica
                  icono={PackageCheck}
                  titulo="Entregados"
                  valor={String(r.entregados.length)}
                  detalle={`${efectividad}% de efectividad`}
                  clase="bg-success/15 text-success"
                />
                <Metrica
                  icono={PackageX}
                  titulo="Fallidos"
                  valor={String(r.fallidos.length)}
                  clase="bg-destructive/15 text-destructive"
                />
                <Metrica
                  icono={Clock}
                  titulo="Pendientes"
                  valor={String(r.pendientes.length)}
                  detalle="de lo recibido en el periodo"
                  clase="bg-warning/15 text-warning"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Metrica
                  icono={Banknote}
                  titulo="Recaudado en efectivo"
                  valor={pesos(r.efectivo)}
                  detalle={`${r.conEfectivo} entregas con recaudo en efectivo`}
                  clase="bg-accent/20 text-accent-foreground"
                />
                <Metrica
                  icono={Wallet}
                  titulo="Te deben pagar"
                  valor={pesos(r.aPagar)}
                  detalle={`${r.entregados.length} entregas × tarifa`}
                  clase="bg-primary/15 text-primary"
                />
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <p className="mt-6 text-xs text-muted-foreground">
        Las entregas pagadas por transferencia no suman al recaudo en efectivo: al marcarlas se borra el cobro y el
        valor en la planilla.
      </p>
    </Pantalla>
  );
}
