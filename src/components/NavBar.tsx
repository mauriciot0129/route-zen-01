import { Link } from "@tanstack/react-router";
import { ScanLine, Map, PackageCheck } from "lucide-react";

const items = [
  { to: "/", label: "Registrar", icon: ScanLine },
  { to: "/ruta", label: "Ruta", icon: Map },
  { to: "/entregas", label: "Entregas", icon: PackageCheck },
] as const;

export function NavBar() {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-xs text-muted-foreground transition-colors data-[status=active]:text-primary data-[status=active]:font-bold"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Pantalla({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-primary px-4 py-5 text-primary-foreground">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-xl font-bold tracking-tight">{titulo}</h1>
          <p className="mt-1 text-sm opacity-80">{descripcion}</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-5">{children}</main>
      <NavBar />
    </div>
  );
}
