import { PrismaService } from './shared/infrastructure/prisma/prisma.service';
async function main() {
  const prisma = new PrismaService();
  const readings = [
    { lat: 1.03, lng: -76.61, accuracyM: 7.3, recordedAt: new Date('2026-10-22T02:00:00.123Z') },
    { lat: 1.031, lng: -76.611, accuracyM: null, recordedAt: new Date('2026-10-22T02:00:05Z') },
  ];
  const rows = await prisma.$queryRaw`
    SELECT r.lat, r.lng, r.accuracy, r.recorded_at
    FROM unnest(${readings.map((r) => r.lat)}::float8[], ${readings.map((r) => r.lng)}::float8[],
                ${readings.map((r) => r.accuracyM)}::numeric[], ${readings.map((r) => r.recordedAt)}::timestamptz[])
         AS r(lat, lng, accuracy, recorded_at)`;
  console.log(rows);
  await prisma.$disconnect();
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
