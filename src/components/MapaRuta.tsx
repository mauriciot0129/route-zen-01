import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface ParadaMapa {
  posicion: number;
  guia: string;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
}

function icono(texto: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.4)">${texto}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function MapaRuta({
  origen,
  paradas,
}: {
  origen: { lat: number; lon: number; direccion: string };
  paradas: ParadaMapa[];
}) {
  const puntos: [number, number][] = [
    [origen.lat, origen.lon],
    ...paradas.map((p) => [p.lat, p.lon] as [number, number]),
  ];
  const bounds = L.latLngBounds(puntos);

  return (
    <div className="h-80 overflow-hidden rounded-xl border border-border">
      <MapContainer bounds={bounds} boundsOptions={{ padding: [28, 28] }} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={puntos} pathOptions={{ color: "#166534", weight: 4, opacity: 0.8 }} />
        <Marker position={[origen.lat, origen.lon]} icon={icono("★", "#c2410c")}>
          <Popup>Punto de partida: {origen.direccion}</Popup>
        </Marker>
        {paradas.map((p) => (
          <Marker key={p.guia} position={[p.lat, p.lon]} icon={icono(String(p.posicion), "#166534")}>
            <Popup>
              <strong>
                {p.posicion}. {p.nombre || p.guia}
              </strong>
              <br />
              {p.direccion}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
