/**
 * Fondo de los paneles oscuros (menú lateral, ingreso al panel): el paisaje de Villagarzón detrás de un
 * vidrio oscuro. Va dentro de un contenedor con `relative isolate`; el contraste del texto está medido
 * sobre el punto más claro del paisaje (ver .sidebar-glass en globals.css).
 * `bar` = el contenedor es una barra horizontal por debajo de lg: el vidrio es parejo, sin el claro de arriba.
 */
export function SidebarBackdrop({ bar = false }: { bar?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="sidebar-scene absolute inset-0" />
      <div className={`sidebar-glass absolute inset-0 ${bar ? "sidebar-glass--bar" : ""}`} />
    </div>
  );
}
