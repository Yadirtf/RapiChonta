import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Datos de ejemplo para probar el mapa. Reemplazar por el catálogo real de la ciudad de lanzamiento.
const establishments = [
  { name: 'Burger Demo', category: 'FAST_FOOD', address: 'Dirección de ejemplo 1', lat: 1.0294, lng: -76.6165 },
  { name: 'Pizza Demo', category: 'FAST_FOOD', address: 'Dirección de ejemplo 2', lat: 1.0322, lng: -76.6133 },
  { name: 'Súper Demo', category: 'SUPERMARKET', address: 'Dirección de ejemplo 3', lat: 1.0259, lng: -76.6199 },
];

async function main() {
  for (const e of establishments) {
    await prisma.$executeRaw`
      INSERT INTO establishments (id, name, category, address, location, updated_at)
      VALUES (gen_random_uuid(), ${e.name}, ${e.category}::"EstablishmentCategory", ${e.address},
              ST_SetSRID(ST_MakePoint(${e.lng}, ${e.lat}), 4326)::geography, now())
    `;
  }
}

main().finally(() => prisma.$disconnect());
