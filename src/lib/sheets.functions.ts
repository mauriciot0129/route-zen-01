import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SHEET_ID = "10lFPYTyFZ99YbrdJ9wrP9yA1YLl7VE4MG-Rl8sIkFnY";
const TAB = "BD";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

export interface Paquete {
  row: number;
  fecha: string;
  guia: string;
  nombre: string;
  fechaEntrega: string;
  cobro: string;
  valor: string;
  entregaEfectiva: string;
  fechaDevolucion: string;
  valorPagar: string;
  observaciones: string;
  direccion: string;
}

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("La conexión con Google Sheets no está configurada.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function sheets(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: gatewayHeaders() });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Google Sheets request failed [${res.status}]: ${text}`);
    throw new Error(`Google Sheets respondió ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/** Fecha en el formato que usa la hoja: d/M/yyyy (hora de Colombia). */
export function hoyBogota(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${Number(get("day"))}/${Number(get("month"))}/${get("year")}`;
}

export const listarPaquetes = createServerFn({ method: "GET" }).handler(async () => {
  const data = (await sheets(`/spreadsheets/${SHEET_ID}/values/${TAB}!A2:K1000`)) as {
    values?: string[][];
  };
  const rows = data.values ?? [];
  const paquetes: Paquete[] = rows
    .map((r, i) => ({
      row: i + 2,
      fecha: r[0] ?? "",
      guia: (r[1] ?? "").trim(),
      nombre: r[2] ?? "",
      fechaEntrega: r[3] ?? "",
      cobro: r[4] ?? "",
      valor: (r[5] ?? "").trim(),
      entregaEfectiva: r[6] ?? "",
      fechaDevolucion: r[7] ?? "",
      valorPagar: (r[8] ?? "").trim(),
      observaciones: r[9] ?? "",
      direccion: r[10] ?? "",
    }))
    .filter((p) => p.guia !== "");
  return { paquetes, hoy: hoyBogota() };
});

const nuevoPaquete = z.object({
  guia: z.string().min(1),
  nombre: z.string().default(""),
  cobro: z.enum(["SI", "NO"]).default("NO"),
  valor: z.number().nonnegative().default(0),
  direccion: z.string().default(""),
  observaciones: z.string().default(""),
});

export const guardarPaquetes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ items: z.array(nuevoPaquete).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    // Asegura el encabezado de la columna de dirección.
    const head = (await sheets(`/spreadsheets/${SHEET_ID}/values/${TAB}!K1`)) as {
      values?: string[][];
    };
    if (!head.values?.[0]?.[0]) {
      await sheets(`/spreadsheets/${SHEET_ID}/values/${TAB}!K1?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ values: [["Dirección"]] }),
      });
    }

    const existentes = (await sheets(
      `/spreadsheets/${SHEET_ID}/values/${TAB}!B2:B1000`,
    )) as { values?: string[][] };
    const yaEstan = new Set((existentes.values ?? []).map((r) => (r[0] ?? "").trim()));

    const fecha = hoyBogota();
    const nuevos = data.items.filter((i) => !yaEstan.has(i.guia.trim()));
    const duplicados = data.items.length - nuevos.length;

    if (nuevos.length > 0) {
      const values = nuevos.map((i) => [
        fecha,
        i.guia.trim(),
        i.nombre,
        "",
        i.cobro,
        i.cobro === "SI" ? i.valor : 0,
        "",
        "",
        "",
        i.observaciones,
        i.direccion,
      ]);
      await sheets(
        `/spreadsheets/${SHEET_ID}/values/${TAB}!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values }) },
      );
    }

    return { guardados: nuevos.length, duplicados };
  });

export const actualizarPaquete = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        row: z.number().int().min(2),
        estado: z.enum(["ENTREGADO", "FALLIDA", "PENDIENTE"]),
        valorPagar: z.number().nonnegative().optional(),
        observaciones: z.string().optional(),
        direccion: z.string().optional(),
        pago: z.enum(["EFECTIVO", "TRANSFERENCIA"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const fecha = hoyBogota();
    const entregado = data.estado === "ENTREGADO";
    const fallida = data.estado === "FALLIDA";
    const pendiente = data.estado === "PENDIENTE";
    const valorPagar = entregado ? (data.valorPagar ?? 1500) : 0;

    const fila = [
      pendiente ? "" : entregado ? fecha : "", // D fecha de entrega
      null, // E cobro (no se toca)
      null, // F valor (no se toca)
      pendiente ? "" : entregado ? "SI" : "NO", // G entrega efectiva
      fallida ? fecha : "", // H fecha devolución
      pendiente ? "" : valorPagar, // I valor a pagar
    ];

    const dataRanges: { range: string; values: (string | number)[][] }[] = [
      { range: `${TAB}!D${data.row}`, values: [[fila[0] as string]] },
      { range: `${TAB}!G${data.row}:I${data.row}`, values: [[fila[3] as string, fila[4] as string, fila[5] as string | number]] },
    ];
    if (data.observaciones !== undefined) {
      dataRanges.push({ range: `${TAB}!J${data.row}`, values: [[data.observaciones]] });
    }
    if (data.direccion !== undefined) {
      dataRanges.push({ range: `${TAB}!K${data.row}`, values: [[data.direccion]] });
    }
    // Pago por transferencia: se borra el cobro y el valor para que no cuente como recaudo en efectivo.
    if (data.pago === "TRANSFERENCIA") {
      dataRanges.push({ range: `${TAB}!E${data.row}:F${data.row}`, values: [["", ""]] });
    }

    await sheets(`/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: dataRanges }),
    });

    return { ok: true };
  });
