import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

interface Punto {
  guia: string;
  nombre: string;
  direccion: string;
  lat: number | null;
  lon: number | null;
}

// Punto de partida fijo: coordenadas conocidas para no depender del mapa
const INICIOS_FIJOS: Array<{ clave: string; lat: number; lon: number }> = [
  { clave: "cl53a#47a-38losnaranjositagui", lat: 6.1741, lon: -75.6059 },
];

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Genera variantes de una dirección colombiana para mejorar el reconocimiento. */
function variantes(direccion: string, ciudad: string, incluirCiudad: boolean): string[] {
  const base = direccion
    .replace(/\s+/g, " ")
    .replace(/\bCL\b/gi, "Calle")
    .replace(/\bCR\b|\bCRA\b|\bKR\b/gi, "Carrera")
    .replace(/\bDG\b/gi, "Diagonal")
    .replace(/\bTV\b/gi, "Transversal")
    .replace(/\bAV\b/gi, "Avenida")
    .trim();

  const sinSimbolos = base.replace(/#/g, " ").replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
  // "Calle 53A 47A 38 Los Naranjos" -> "Calle 53A # 47A-38"
  const vial = sinSimbolos.match(/^((?:Calle|Carrera|Diagonal|Transversal|Avenida)\s+\d+[A-Za-z]?)\s+(\d+[A-Za-z]?)\s*(\d+)?/i);
  const lista = new Set<string>();
  lista.add(`${base}, ${ciudad}, Colombia`);
  lista.add(`${sinSimbolos}, ${ciudad}, Colombia`);
  if (vial) {
    lista.add(`${vial[1]} #${vial[2]}-${vial[3] ?? ""}, ${ciudad}, Colombia`);
    lista.add(`${vial[1]}, ${ciudad}, Colombia`);
  }
  lista.add(`${ciudad}, Colombia`);
  return [...lista];
}

async function buscar(q: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RutaCoordinadora/1.0 (reparto de paquetes)", Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`Geocoding falló [${res.status}]: ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: Number(data[0]!.lat), lon: Number(data[0]!.lon) };
  } catch (e) {
    console.error("Geocoding error", e);
    return null;
  }
}

async function geocodificar(direccion: string, ciudad: string): Promise<{ lat: number; lon: number } | null> {
  const fijo = INICIOS_FIJOS.find((f) => normalizar(direccion).includes(f.clave));
  if (fijo) return { lat: fijo.lat, lon: fijo.lon };

  const opciones = variantes(direccion, ciudad);
  for (let i = 0; i < opciones.length; i++) {
    const r = await buscar(opciones[i]!);
    if (r) return r;
    if (i < opciones.length - 1) await new Promise((res) => setTimeout(res, 1100));
  }
  return null;
}

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function ordenar(puntos: (Punto & { lat: number; lon: number })[], inicio: { lat: number; lon: number }) {
  // Vecino más cercano
  const restantes = [...puntos];
  const orden: typeof puntos = [];
  let actual = inicio;
  while (restantes.length) {
    let mejor = 0;
    let mejorD = Infinity;
    restantes.forEach((p, i) => {
      const d = km(actual, p);
      if (d < mejorD) {
        mejorD = d;
        mejor = i;
      }
    });
    const elegido = restantes.splice(mejor, 1)[0]!;
    orden.push(elegido);
    actual = elegido;
  }
  // Mejora 2-opt
  const total = (arr: typeof puntos) => {
    let d = km(inicio, arr[0]!);
    for (let i = 1; i < arr.length; i++) d += km(arr[i - 1]!, arr[i]!);
    return d;
  };
  let mejoro = true;
  let iter = 0;
  while (mejoro && iter < 60) {
    mejoro = false;
    iter++;
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const copia = [...orden];
        const trozo = copia.slice(i, j + 1).reverse();
        copia.splice(i, j - i + 1, ...trozo);
        if (total(copia) < total(orden) - 0.0001) {
          orden.splice(0, orden.length, ...copia);
          mejoro = true;
        }
      }
    }
  }
  return { orden, distanciaKm: total(orden) };
}

export const optimizarRuta = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        ciudad: z.string().min(2),
        inicio: z.string().min(2),
        paradas: z
          .array(z.object({ guia: z.string(), nombre: z.string(), direccion: z.string().min(3) }))
          .min(1)
          .max(60),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const origen = await geocodificar(data.inicio, data.ciudad);
    if (!origen) {
      return { error: "No pudimos ubicar el punto de partida. Escríbelo más completo." as string };
    }

    const puntos: Punto[] = [];
    for (const p of data.paradas) {
      const coord = await geocodificar(p.direccion, data.ciudad);
      puntos.push({ ...p, lat: coord?.lat ?? null, lon: coord?.lon ?? null });
      await new Promise((r) => setTimeout(r, 1100)); // respeta el límite del servicio de mapas
    }

    const ubicados = puntos.filter((p): p is Punto & { lat: number; lon: number } => p.lat !== null);
    const sinUbicar = puntos.filter((p) => p.lat === null);

    if (!ubicados.length) {
      return { error: "No pudimos ubicar ninguna dirección. Revisa cómo están escritas." as string };
    }

    const { orden, distanciaKm } = ordenar(ubicados, origen);
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(
      `${data.inicio}, ${data.ciudad}, Colombia`,
    )}&destination=${encodeURIComponent(`${orden[orden.length - 1]!.direccion}, ${data.ciudad}, Colombia`)}${
      orden.length > 1
        ? `&waypoints=${orden
            .slice(0, -1)
            .map((p) => encodeURIComponent(`${p.direccion}, ${data.ciudad}, Colombia`))
            .join("%7C")}`
        : ""
    }`;

    return {
      origen: { lat: origen.lat, lon: origen.lon, direccion: data.inicio },
      orden: orden.map((p, i) => ({
        posicion: i + 1,
        guia: p.guia,
        nombre: p.nombre,
        direccion: p.direccion,
        lat: p.lat,
        lon: p.lon,
      })),
      sinUbicar: sinUbicar.map((p) => ({ guia: p.guia, nombre: p.nombre, direccion: p.direccion })),
      distanciaKm: Math.round(distanciaKm * 10) / 10,
      mapsUrl,
    };
  });
