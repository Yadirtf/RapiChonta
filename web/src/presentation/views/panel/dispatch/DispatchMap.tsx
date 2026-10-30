"use client";

import type * as GeoJSON from "geojson";
import { maplibregl } from "@/presentation/components/map/maplibre";
import { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { DispatchOrder, LocatedCourier } from "@/core/domain/entities/dispatch";
import { needsAttention } from "@/core/domain/entities/dispatch";
import type { GeoPoint } from "@/core/domain/entities/establishment";
import { createBrandMap } from "../../../components/map/mapStyle";

const BIKE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
const STORE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>`;
const HOME = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;

interface Props {
  center: GeoPoint;
  orders: DispatchOrder[];
  couriers: LocatedCourier[];
  selectedOrder: DispatchOrder | null;
  selectedCourierId: string | null;
  onSelectOrder: (code: string) => void;
  onSelectCourier: (userId: string) => void;
}

/**
 * Mapa de la central (H07.2, RF-31): los pedidos que esperan clavados en su local, los domiciliarios
 * disponibles con su moto y, del pedido elegido, el local, la casa y el trayecto entre los dos. Solo lo ve
 * el personal; la ubicación del domiciliario nunca llega al cliente.
 */
export function DispatchMap({ center, orders, couriers, selectedOrder, selectedCourierId, onSelectOrder, onSelectCourier }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ onSelectOrder, onSelectCourier });
  latest.current = { onSelectOrder, onSelectCourier };
  const framed = useRef<string | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = createBrandMap({ container: container.current, center: [center.lng, center.lat], zoom: 14.5, maxZoom: 19 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#14121f", "line-width": 6, "line-opacity": 0.25 } });
      map.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#e4572e", "line-width": 3.5, "line-dasharray": [1.5, 1.2] } });
      setReady(true);
    });
    mapRef.current = map;
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pedidos que esperan: una mini comanda con el código en cada local (el elegido se dibuja aparte).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: Marker[] = orders
      .filter((o) => o.needsCourier && o.code !== selectedOrder?.code)
      .map((o) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = `order-flag ${needsAttention(o) ? "is-new" : ""}`;
        el.textContent = o.code.replace("RC-", "");
        el.title = `${o.code} · ${o.establishment.name}`;
        el.addEventListener("click", () => latest.current.onSelectOrder(o.code));
        return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([o.establishment.longitude, o.establishment.latitude]).addTo(map);
      });
    return () => markers.forEach((m) => m.remove());
  }, [orders, selectedOrder?.code]);

  // Pedido elegido: local, casa y la línea punteada del trayecto.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const route = map.getSource("route") as GeoJSONSource;
    if (!selectedOrder) {
      route.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const store: [number, number] = [selectedOrder.establishment.longitude, selectedOrder.establishment.latitude];
    const home: [number, number] = [selectedOrder.delivery.longitude, selectedOrder.delivery.latitude];
    const line: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [store, home] } };
    route.setData({ type: "FeatureCollection", features: [line] });

    const storeEl = document.createElement("div");
    storeEl.className = "store-pin";
    storeEl.style.cursor = "default";
    storeEl.innerHTML = STORE;
    storeEl.title = selectedOrder.establishment.name;
    const homeEl = document.createElement("div");
    homeEl.innerHTML = `<span class="drop-pin">${HOME}</span>`;
    homeEl.title = selectedOrder.delivery.reference ?? "";
    const markers = [
      new maplibregl.Marker({ element: storeEl }).setLngLat(store).addTo(map),
      new maplibregl.Marker({ element: homeEl, anchor: "bottom", offset: [0, -6] }).setLngLat(home).addTo(map),
    ];
    return () => markers.forEach((m) => m.remove());
  }, [selectedOrder, ready]);

  // Domiciliarios disponibles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: Marker[] = couriers.map((c) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `moto-marker ${c.hasPendingOffer ? "is-pending" : ""} ${c.declined ? "is-declined" : ""}`;
      el.setAttribute("aria-pressed", String(c.userId === selectedCourierId));
      el.innerHTML = `<i>${BIKE}</i><b></b>`;
      el.querySelector("b")!.textContent = c.givenNames.split(" ")[0];
      el.addEventListener("click", () => latest.current.onSelectCourier(c.userId));
      return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([c.longitude, c.latitude]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [couriers, selectedCourierId]);

  // Encuadre: al elegir otro pedido, el local, la casa y los domiciliarios cercanos (una vez por pedido).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const key = selectedOrder?.code ?? "all";
    if (framed.current === key) return;
    const points: [number, number][] = selectedOrder
      ? [
          [selectedOrder.establishment.longitude, selectedOrder.establishment.latitude],
          [selectedOrder.delivery.longitude, selectedOrder.delivery.latitude],
          ...couriers.slice(0, 4).map((c): [number, number] => [c.longitude, c.latitude]),
        ]
      : [...orders.filter((o) => o.needsCourier).map((o): [number, number] => [o.establishment.longitude, o.establishment.latitude]), ...couriers.map((c): [number, number] => [c.longitude, c.latitude])];
    if (!points.length) return;
    framed.current = key;
    const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 16.5, duration: 600 });
  }, [selectedOrder, couriers, orders, ready]);

  return (
    <div className="blueprint relative h-full w-full">
      <div ref={container} className="size-full" />
    </div>
  );
}
