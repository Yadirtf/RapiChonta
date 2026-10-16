import { GetNearbyEstablishments } from "@/core/application/use-cases/get-nearby-establishments";
import { HttpAccountRepository } from "../repositories/http-account-repository";
import { HttpAdminRepository } from "../repositories/http-admin-repository";
import { HttpAuthRepository } from "../repositories/http-auth-repository";
import { HttpEstablishmentRepository } from "../repositories/http-establishment-repository";

/** Composición de dependencias: único lugar donde se conectan casos de uso con sus adaptadores. */
const establishmentRepository = new HttpEstablishmentRepository();

export const container = {
  getNearbyEstablishments: new GetNearbyEstablishments(establishmentRepository),
  auth: new HttpAuthRepository(),
  account: new HttpAccountRepository(),
  admin: new HttpAdminRepository(),
};
