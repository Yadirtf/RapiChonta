-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'COURIER', 'OPERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstablishmentCategory" AS ENUM ('FAST_FOOD', 'RESTAURANT', 'SUPERMARKET', 'STORE', 'PHARMACY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'AT_ESTABLISHMENT', 'AWAITING_CUSTOMER', 'PREPARING', 'ON_THE_WAY', 'ARRIVING', 'DELIVERED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('COURIER_PURCHASE', 'MERCHANT_DIRECT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'NEQUI', 'DAVIPLATA', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CourierFundingMode" AS ENUM ('CASH_BOX', 'OWN_FUNDS');

-- CreateEnum
CREATE TYPE "CashBoxStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MoneyTransferMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING', 'PURCHASE', 'COLLECTION', 'DELIVERY_FEE', 'RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('UNAVAILABLE', 'PRICE_CHANGED');

-- CreateEnum
CREATE TYPE "AdjustmentDecision" AS ENUM ('PENDING', 'SUBSTITUTE', 'REMOVE_ITEM', 'ACCEPT_PRICE', 'CANCEL_ORDER', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('NOT_RECEIVED', 'WRONG_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('FCM', 'HMS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "reference" TEXT,
    "recipient_name" TEXT,
    "recipient_phone" TEXT,
    "location" geography(Point, 4326) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_profiles" (
    "user_id" UUID NOT NULL,
    "vehicle_type" TEXT NOT NULL,
    "vehicle_plate" TEXT,
    "document_id" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "funding_mode" "CourierFundingMode" NOT NULL DEFAULT 'CASH_BOX',
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "last_location" geography(Point, 4326),
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "courier_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "establishments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EstablishmentCategory" NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "logo_url" TEXT,
    "location" geography(Point, 4326) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_partner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "establishments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "prep_minutes" INTEGER NOT NULL,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_fee_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "establishment_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "establishment_id" UUID NOT NULL,
    "courier_id" UUID,
    "address_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    "fulfillment_mode" "FulfillmentMode" NOT NULL DEFAULT 'COURIER_PURCHASE',
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "items_total" DECIMAL(12,2) NOT NULL,
    "purchase_total" DECIMAL(12,2),
    "delivery_fee" DECIMAL(12,2) NOT NULL,
    "estimated_ready_at" TIMESTAMP(3),
    "prep_delayed" BOOLEAN NOT NULL DEFAULT false,
    "receipt_url" TEXT,
    "customer_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "prep_minutes" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_adjustments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "new_price" DECIMAL(12,2),
    "substitute_product_id" UUID,
    "decision" "AdjustmentDecision" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reported_by_id" UUID NOT NULL,
    "type" "IncidentType" NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_boxes" (
    "id" UUID NOT NULL,
    "courier_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "CashBoxStatus" NOT NULL DEFAULT 'OPEN',
    "opening_amount" DECIMAL(12,2) NOT NULL,
    "opening_method" "MoneyTransferMethod" NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "closed_by_id" UUID,
    "closing_notes" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "cash_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "cash_box_id" UUID NOT NULL,
    "order_id" UUID,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT,
    "created_by_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "platform" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "addresses_location_idx" ON "addresses" USING GIST ("location");

-- CreateIndex
CREATE INDEX "courier_profiles_last_location_idx" ON "courier_profiles" USING GIST ("last_location");

-- CreateIndex
CREATE INDEX "establishments_location_idx" ON "establishments" USING GIST ("location");

-- CreateIndex
CREATE INDEX "establishments_category_idx" ON "establishments"("category");

-- CreateIndex
CREATE INDEX "products_establishment_id_idx" ON "products"("establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_courier_id_idx" ON "orders"("courier_id");

-- CreateIndex
CREATE INDEX "order_status_events_order_id_idx" ON "order_status_events"("order_id");

-- CreateIndex
CREATE INDEX "order_adjustments_order_id_idx" ON "order_adjustments"("order_id");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_boxes_courier_id_business_date_key" ON "cash_boxes"("courier_id", "business_date");

-- CreateIndex
CREATE INDEX "cash_movements_cash_box_id_idx" ON "cash_movements"("cash_box_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_profiles" ADD CONSTRAINT "courier_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_fee_rules" ADD CONSTRAINT "delivery_fee_rules_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "courier_profiles"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_substitute_product_id_fkey" FOREIGN KEY ("substitute_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_boxes" ADD CONSTRAINT "cash_boxes_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_box_id_fkey" FOREIGN KEY ("cash_box_id") REFERENCES "cash_boxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

