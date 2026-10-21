// Primero que todo: Sentry debe iniciar antes de cargar Nest y Express para engancharse a ellos.
import { initSentry } from './shared/infrastructure/observability/sentry';

initSentry();
