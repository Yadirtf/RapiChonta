import { GetNearbyEstablishments } from "@/core/application/use-cases/get-nearby-establishments";
import { HttpEstablishmentRepository } from "../repositories/http-establishment-repository";

/** Composición de dependencias: único lugar donde se conectan casos de uso con sus adaptadores. */
const establishmentRepository = new HttpEstablishmentRepository();

export const container = {
  getNearbyEstablishments: new GetNearbyEstablishments(establishmentRepository),
};
