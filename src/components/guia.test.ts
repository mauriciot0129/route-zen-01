import { expect, test, vi } from "vitest";
vi.mock("@/lib/etiqueta.functions", () => ({ leerEtiqueta: () => null }));
import { guiaDe } from "./Escaner";
test("QR", () => expect(guiaDe("70020010200080014536396991942001")).toBe("36396991942"));
test("barras", () => expect(guiaDe("768323000359001")).toBe("68323000359"));
test("impresa", () => expect(guiaDe("36396991942.1")).toBe("36396991942"));
