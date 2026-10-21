import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 publica configuración plana: ya no hace falta FlatCompat (@eslint/eslintrc).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Reglas nuevas del React Compiler (eslint-plugin-react-hooks 7). Marcan patrones que hoy funcionan
    // (ref con el último valor de las props, cargar datos en un efecto); quedan como avisos hasta
    // adoptar el compilador y migrar esos componentes uno por uno.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
