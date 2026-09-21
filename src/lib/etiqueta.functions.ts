import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Lee una foto de la etiqueta del paquete y extrae los datos con IA. */
export const leerEtiqueta = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ imagen: z.string().min(100).max(8_000_000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("La lectura con IA no está configurada.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente que lee etiquetas de envío de Coordinadora (Colombia). Devuelve SOLO un JSON con las claves guia, nombre, direccion, telefono, cobro, valor. " +
              "guia: el número de guía de 11 dígitos (solo dígitos). nombre: el destinatario. direccion: la dirección de entrega (sin ciudad si es posible). " +
              "telefono: teléfono del destinatario o cadena vacía. cobro: true si la etiqueta indica recaudo/RCE/FCE/contra entrega, si no false. valor: el valor a recaudar como número entero, 0 si no hay. " +
              "Si un dato no aparece, usa cadena vacía o 0. No escribas texto fuera del JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrae los datos de esta etiqueta." },
              { type: "image_url", image_url: { url: data.imagen } },
            ],
          },
        ],
      }),
    });

    const texto = await res.text();
    if (!res.ok) {
      console.error(`AI gateway falló [${res.status}]: ${texto}`);
      if (res.status === 429) throw new Error("Demasiadas lecturas seguidas. Espera unos segundos.");
      if (res.status === 402) throw new Error("Se agotaron los créditos de IA del proyecto.");
      throw new Error(`No pudimos leer la etiqueta (${res.status}).`);
    }

    const json = JSON.parse(texto) as { choices?: { message?: { content?: string } }[] };
    const contenido = json.choices?.[0]?.message?.content ?? "";
    const limpio = contenido.replace(/```json|```/g, "").trim();
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (inicio < 0 || fin < 0) throw new Error("No encontramos datos legibles en la foto.");

    const bruto = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>;
    const guia = String(bruto["guia"] ?? "").replace(/\D/g, "");
    return {
      guia,
      nombre: String(bruto["nombre"] ?? "").trim(),
      direccion: String(bruto["direccion"] ?? "").trim(),
      telefono: String(bruto["telefono"] ?? "").trim(),
      cobro: bruto["cobro"] === true || String(bruto["cobro"]).toUpperCase() === "SI",
      valor: Number(String(bruto["valor"] ?? "0").replace(/\D/g, "")) || 0,
    };
  });
