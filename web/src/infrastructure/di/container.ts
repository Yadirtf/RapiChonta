import { GetNearbyEstablishments } from "@/core/application/use-cases/get-nearby-establishments";
import { HttpFileUploader } from "../files/http-file-uploader";
import { HttpAccountRepository } from "../repositories/http-account-repository";
import { HttpAdminRepository } from "../repositories/http-admin-repository";
import { HttpAuthRepository } from "../repositories/http-auth-repository";
import { HttpBusinessAdminRepository, HttpBusinessPublicRepository } from "../repositories/http-business-repository";
import { HttpCashRepository } from "../repositories/http-cash-repository";
import { HttpDeskRepository } from "../repositories/http-desk-repository";
import { HttpDispatchRepository } from "../repositories/http-dispatch-repository";
import { HttpCatalogAdminRepository } from "../repositories/http-catalog-admin-repository";
import { HttpEstablishmentRepository } from "../repositories/http-establishment-repository";
import { HttpMerchantRepository, HttpPartnershipRepository } from "../repositories/http-merchant-repository";
import { HttpOrderRepository } from "../repositories/http-order-repository";

/** Composición de dependencias: único lugar donde se conectan casos de uso con sus adaptadores. */
const establishmentRepository = new HttpEstablishmentRepository();

export const container = {
  getNearbyEstablishments: new GetNearbyEstablishments(establishmentRepository),
  establishments: establishmentRepository,
  auth: new HttpAuthRepository(),
  account: new HttpAccountRepository(),
  admin: new HttpAdminRepository(),
  catalogAdmin: new HttpCatalogAdminRepository(),
  files: new HttpFileUploader(),
  businessAdmin: new HttpBusinessAdminRepository(),
  business: new HttpBusinessPublicRepository(),
  orders: new HttpOrderRepository(),
  dispatch: new HttpDispatchRepository(),
  desk: new HttpDeskRepository(),
  cash: new HttpCashRepository(),
  merchant: new HttpMerchantRepository(),
  partnerships: new HttpPartnershipRepository(),
};
