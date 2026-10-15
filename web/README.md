# RapiChonta Web

Cliente web de RapiChonta con **Next.js (App Router) + React + TypeScript**, **Tailwind CSS**, **Framer Motion** para microinteracciones y **MapLibre GL** para el mapa (sin dependencia de Google, sin API key con OpenFreeMap).

## Estructura (arquitectura limpia)

```
src/
├── app/                    # Rutas de Next.js. Solo composición: no contiene lógica de negocio.
├── core/
│   ├── domain/             # Entidades y puertos (interfaces de repositorio). TypeScript puro.
│   └── application/        # Casos de uso. Dependen solo del dominio.
├── infrastructure/
│   ├── http/               # Cliente HTTP hacia la API
│   ├── repositories/       # Implementaciones de los puertos (adaptadores)
│   └── di/                 # Contenedor: conecta casos de uso con adaptadores
└── presentation/
    ├── components/         # UI reutilizable (menú lateral, mapa)
    ├── hooks/              # Estado de UI y llamadas a casos de uso
    └── views/              # Pantallas completas
```

Regla: `app → presentation → application → domain`; `infrastructure → domain`. Un componente nunca llama `fetch` directamente.

## Idiomas

Los textos viven en `messages/es.json` y `messages/en.json` (next-intl), nunca en los componentes. En un componente: `const t = useTranslations(); t("menu.myOrders")`. El idioma se toma de la cookie `NEXT_LOCALE` (selector ES/EN del menú), luego del navegador y por defecto español. Para agregar un idioma: crear `messages/<idioma>.json` y sumarlo a `LOCALES` en `src/i18n/config.ts`.

## Desarrollo local

```bash
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3001 (la API debe estar en :3000)
```

Scripts: `npm run lint`, `npm run typecheck`, `npm run build`.
