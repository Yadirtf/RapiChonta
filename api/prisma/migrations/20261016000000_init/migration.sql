-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateTable
CREATE TABLE "countries" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "iso2" CHAR(2) NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "country_id" SMALLINT NOT NULL,
    "dane_code" CHAR(2) NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipalities" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY,
    "department_id" SMALLINT NOT NULL,
    "dane_code" CHAR(5) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "time_zone" VARCHAR(40) NOT NULL,
    "center" geography(Point, 4326) NOT NULL,
    "boundary" geography(Polygon, 4326),
    "launched_at" TIMESTAMPTZ(6),

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "minor_units" SMALLINT NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_cash_on_delivery" BOOLEAN NOT NULL,
    "is_account_based" BOOLEAN NOT NULL,
    "requires_bank" BOOLEAN NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_purposes" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "max_size_bytes" INTEGER NOT NULL,
    "allowed_mime_types" TEXT[],
    "requires_camera" BOOLEAN NOT NULL,

    CONSTRAINT "file_purposes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purpose_id" SMALLINT NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(6),
    "captured_location" geography(Point, 4326),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_actions" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "audit_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "actor_user_id" UUID,
    "action_id" SMALLINT NOT NULL,
    "entity_table" VARCHAR(63) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "changes" JSONB,
    "ip_address" INET,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "country_id" SMALLINT,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "given_names" VARCHAR(80) NOT NULL,
    "family_names" VARCHAR(80),
    "document_type_id" SMALLINT,
    "document_number" VARCHAR(20),
    "birth_date" DATE,
    "anonymized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_phones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "phone_e164" VARCHAR(16) NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_statuses" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,
    "can_sign_in" BOOLEAN NOT NULL,

    CONSTRAINT "user_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_status_transitions" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,

    CONSTRAINT "user_status_transitions_pkey" PRIMARY KEY ("from_status_id","to_status_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "password_hash" VARCHAR(255),
    "password_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "from_status_id" SMALLINT,
    "to_status_id" SMALLINT NOT NULL,
    "changed_by_user_id" UUID,
    "reason" VARCHAR(300),
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "user_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "requires_password" BOOLEAN NOT NULL,
    "is_self_assignable" BOOLEAN NOT NULL,
    "is_staff" BOOLEAN NOT NULL,
    "requires_municipality" BOOLEAN NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(60) NOT NULL,
    "module" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" SMALLINT NOT NULL,
    "permission_id" SMALLINT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "municipality_id" INTEGER,
    "granted_by_user_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "language_id" SMALLINT NOT NULL,
    "display_currency_id" SMALLINT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "platforms" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "installation_id" UUID NOT NULL,
    "platform_id" SMALLINT NOT NULL,
    "app_version" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_end_reasons" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "session_end_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "active_role_id" SMALLINT NOT NULL,
    "device_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason_id" SMALLINT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_purposes" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "otp_purposes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_channels" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "otp_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_e164" VARCHAR(16) NOT NULL,
    "purpose_id" SMALLINT NOT NULL,
    "channel_id" SMALLINT NOT NULL,
    "code_hash" VARCHAR(255),
    "provider_message_id" VARCHAR(100),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_factors" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "auth_factor_id" SMALLINT NOT NULL,
    "otp_challenge_id" UUID,
    "user_id" UUID,
    "succeeded" BOOLEAN NOT NULL,
    "ip_address" INET,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_types" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "legal_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_requirements" (
    "legal_document_type_id" SMALLINT NOT NULL,
    "role_id" SMALLINT NOT NULL,

    CONSTRAINT "legal_document_requirements_pkey" PRIMARY KEY ("legal_document_type_id","role_id")
);

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "legal_document_type_id" SMALLINT NOT NULL,
    "version_label" VARCHAR(20) NOT NULL,
    "file_id" UUID,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "legal_document_version_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "person_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_request_types" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_request_statuses" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,

    CONSTRAINT "data_request_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "request_type_id" SMALLINT NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "details" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_verification_statuses" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,
    "can_receive_offers" BOOLEAN NOT NULL,

    CONSTRAINT "courier_verification_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_verification_transitions" (
    "from_status_id" SMALLINT NOT NULL,
    "to_status_id" SMALLINT NOT NULL,

    CONSTRAINT "courier_verification_transitions_pkey" PRIMARY KEY ("from_status_id","to_status_id")
);

-- CreateTable
CREATE TABLE "courier_profiles" (
    "user_id" UUID NOT NULL,
    "verification_status_id" SMALLINT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "courier_verification_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_user_id" UUID NOT NULL,
    "from_status_id" SMALLINT,
    "to_status_id" SMALLINT NOT NULL,
    "changed_by_user_id" UUID,
    "reason" VARCHAR(300),
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "courier_verification_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_modes" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "funding_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_funding_modes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_user_id" UUID NOT NULL,
    "funding_mode_id" SMALLINT NOT NULL,
    "effective_on" DATE NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_funding_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "requires_plate" BOOLEAN NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_user_id" UUID NOT NULL,
    "vehicle_type_id" SMALLINT NOT NULL,
    "plate" VARCHAR(10),
    "description" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_document_types" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "requires_expiry" BOOLEAN NOT NULL,
    "is_vehicle_document" BOOLEAN NOT NULL,

    CONSTRAINT "courier_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_document_statuses" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,

    CONSTRAINT "courier_document_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_user_id" UUID NOT NULL,
    "document_type_id" SMALLINT NOT NULL,
    "vehicle_id" UUID,
    "file_id" UUID NOT NULL,
    "expires_on" DATE,
    "status_id" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "ach_code" VARCHAR(10),
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account_types" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "bank_account_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_collection_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_user_id" UUID NOT NULL,
    "payment_method_id" SMALLINT NOT NULL,
    "bank_id" SMALLINT,
    "bank_account_type_id" SMALLINT,
    "account_number" VARCHAR(30) NOT NULL,
    "holder_name" VARCHAR(120) NOT NULL,
    "qr_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "courier_collection_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "establishment_statuses" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,
    "is_visible_on_map" BOOLEAN NOT NULL,
    "accepts_orders" BOOLEAN NOT NULL,

    CONSTRAINT "establishment_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "establishments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "municipality_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address_line" VARCHAR(200) NOT NULL,
    "location" geography(Point, 4326) NOT NULL,
    "area" geography(Polygon, 4326) NOT NULL,
    "logo_file_id" UUID,
    "status_id" SMALLINT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "establishments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "establishment_categories" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "establishment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "establishment_category_translations" (
    "category_id" SMALLINT NOT NULL,
    "language_id" SMALLINT NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "establishment_category_translations_pkey" PRIMARY KEY ("category_id","language_id")
);

-- CreateTable
CREATE TABLE "establishment_category_links" (
    "establishment_id" UUID NOT NULL,
    "category_id" SMALLINT NOT NULL,
    "is_primary" BOOLEAN NOT NULL,

    CONSTRAINT "establishment_category_links_pkey" PRIMARY KEY ("establishment_id","category_id")
);

-- CreateTable
CREATE TABLE "establishment_phones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "establishment_id" UUID NOT NULL,
    "phone_e164" VARCHAR(16) NOT NULL,
    "label" VARCHAR(40),

    CONSTRAINT "establishment_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "establishment_id" UUID NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "menu_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_section_translations" (
    "menu_section_id" UUID NOT NULL,
    "language_id" SMALLINT NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "menu_section_translations_pkey" PRIMARY KEY ("menu_section_id","language_id")
);

-- CreateTable
CREATE TABLE "product_statuses" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),
    "is_initial" BOOLEAN NOT NULL,
    "is_terminal" BOOLEAN NOT NULL,
    "is_visible" BOOLEAN NOT NULL,
    "is_orderable" BOOLEAN NOT NULL,

    CONSTRAINT "product_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "establishment_id" UUID NOT NULL,
    "menu_section_id" UUID NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "prep_minutes" SMALLINT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_version_texts" (
    "product_version_id" UUID NOT NULL,
    "language_id" SMALLINT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,

    CONSTRAINT "product_version_texts_pkey" PRIMARY KEY ("product_version_id","language_id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "product_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sort_order" SMALLINT NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("product_id","file_id")
);

-- CreateTable
CREATE TABLE "zone_kinds" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "zone_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "municipality_id" INTEGER NOT NULL,
    "zone_kind_id" SMALLINT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "area" geography(Polygon, 4326) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zone_fees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_zone_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "delivery_zone_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "municipality_id" INTEGER NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "opens_at" TIME(0) NOT NULL,
    "closes_at" TIME(0) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_hour_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "municipality_id" INTEGER NOT NULL,
    "on_date" DATE NOT NULL,
    "opens_at" TIME(0),
    "closes_at" TIME(0),
    "reason" VARCHAR(120),

    CONSTRAINT "operating_hour_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting_data_types" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "code" VARCHAR(40) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "setting_data_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting_definitions" (
    "id" SMALLINT GENERATED ALWAYS AS IDENTITY,
    "key" VARCHAR(60) NOT NULL,
    "data_type_id" SMALLINT NOT NULL,
    "min_value" DECIMAL(14,4),
    "max_value" DECIMAL(14,4),
    "is_scoped_by_municipality" BOOLEAN NOT NULL,

    CONSTRAINT "setting_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "setting_definition_id" SMALLINT NOT NULL,
    "municipality_id" INTEGER,
    "value" DECIMAL(14,4) NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "setting_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "municipality_id" INTEGER NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "currency_id" SMALLINT NOT NULL,
    "cop_per_unit" DECIMAL(14,4) NOT NULL,
    "source" VARCHAR(60) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "departments_dane_code_key" ON "departments"("dane_code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_country_id_name_key" ON "departments"("country_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_dane_code_key" ON "municipalities"("dane_code");

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "file_purposes_code_key" ON "file_purposes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "audit_actions_code_key" ON "audit_actions"("code");

-- CreateIndex
CREATE INDEX "audit_logs_entity_table_entity_id_occurred_at_idx" ON "audit_logs"("entity_table", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "people_document_type_id_document_number_key" ON "people"("document_type_id", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "person_phones_phone_e164_key" ON "person_phones"("phone_e164");

-- CreateIndex
CREATE INDEX "person_phones_person_id_idx" ON "person_phones"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_emails_email_key" ON "person_emails"("email");

-- CreateIndex
CREATE INDEX "person_emails_person_id_idx" ON "person_emails"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_statuses_code_key" ON "user_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_person_id_key" ON "users"("person_id");

-- CreateIndex
CREATE INDEX "users_status_id_idx" ON "users"("status_id");

-- CreateIndex
CREATE INDEX "user_status_history_user_id_changed_at_idx" ON "user_status_history"("user_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_code_key" ON "platforms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "devices_installation_id_key" ON "devices"("installation_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_end_reasons_code_key" ON "session_end_reasons"("code");

-- CreateIndex
CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "otp_purposes_code_key" ON "otp_purposes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "otp_channels_code_key" ON "otp_channels"("code");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_e164_created_at_idx" ON "otp_challenges"("phone_e164", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_factors_code_key" ON "auth_factors"("code");

-- CreateIndex
CREATE INDEX "auth_attempts_otp_challenge_id_idx" ON "auth_attempts"("otp_challenge_id");

-- CreateIndex
CREATE INDEX "auth_attempts_user_id_attempted_at_idx" ON "auth_attempts"("user_id", "attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_types_code_key" ON "legal_document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_versions_legal_document_type_id_version_labe_key" ON "legal_document_versions"("legal_document_type_id", "version_label");

-- CreateIndex
CREATE INDEX "person_consents_person_id_idx" ON "person_consents"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_request_types_code_key" ON "data_request_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "data_request_statuses_code_key" ON "data_request_statuses"("code");

-- CreateIndex
CREATE INDEX "data_requests_person_id_idx" ON "data_requests"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "courier_verification_statuses_code_key" ON "courier_verification_statuses"("code");

-- CreateIndex
CREATE INDEX "courier_verification_history_courier_user_id_changed_at_idx" ON "courier_verification_history"("courier_user_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "funding_modes_code_key" ON "funding_modes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "courier_funding_modes_courier_user_id_effective_on_key" ON "courier_funding_modes"("courier_user_id", "effective_on");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_code_key" ON "vehicle_types"("code");

-- CreateIndex
CREATE INDEX "vehicles_courier_user_id_idx" ON "vehicles"("courier_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_id_courier_user_id_key" ON "vehicles"("id", "courier_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "courier_document_types_code_key" ON "courier_document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "courier_document_statuses_code_key" ON "courier_document_statuses"("code");

-- CreateIndex
CREATE INDEX "courier_documents_courier_user_id_idx" ON "courier_documents"("courier_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "banks_code_key" ON "banks"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_types_code_key" ON "bank_account_types"("code");

-- CreateIndex
CREATE INDEX "courier_collection_accounts_courier_user_id_idx" ON "courier_collection_accounts"("courier_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "establishment_statuses_code_key" ON "establishment_statuses"("code");

-- CreateIndex
CREATE INDEX "establishments_location_idx" ON "establishments" USING GIST ("location");

-- CreateIndex
CREATE INDEX "establishments_area_idx" ON "establishments" USING GIST ("area");

-- CreateIndex
CREATE INDEX "establishments_municipality_id_idx" ON "establishments"("municipality_id");

-- CreateIndex
CREATE UNIQUE INDEX "establishment_categories_code_key" ON "establishment_categories"("code");

-- CreateIndex
CREATE INDEX "establishment_category_links_category_id_idx" ON "establishment_category_links"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "establishment_phones_establishment_id_phone_e164_key" ON "establishment_phones"("establishment_id", "phone_e164");

-- CreateIndex
CREATE INDEX "menu_sections_establishment_id_idx" ON "menu_sections"("establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_sections_id_establishment_id_key" ON "menu_sections"("id", "establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_statuses_code_key" ON "product_statuses"("code");

-- CreateIndex
CREATE INDEX "products_establishment_id_idx" ON "products"("establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_product_id_created_at_key" ON "product_versions"("product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "zone_kinds_code_key" ON "zone_kinds"("code");

-- CreateIndex
CREATE INDEX "delivery_zones_area_idx" ON "delivery_zones" USING GIST ("area");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_fees_delivery_zone_id_created_at_key" ON "delivery_zone_fees"("delivery_zone_id", "created_at");

-- CreateIndex
CREATE INDEX "operating_hours_municipality_id_weekday_idx" ON "operating_hours"("municipality_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "setting_data_types_code_key" ON "setting_data_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "setting_definitions_key_key" ON "setting_definitions"("key");

-- CreateIndex
CREATE INDEX "setting_values_setting_definition_id_municipality_id_create_idx" ON "setting_values"("setting_definition_id", "municipality_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rates_municipality_id_created_at_key" ON "commission_rates"("municipality_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_id_fetched_at_key" ON "exchange_rates"("currency_id", "fetched_at");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_purpose_id_fkey" FOREIGN KEY ("purpose_id") REFERENCES "file_purposes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "audit_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_phones" ADD CONSTRAINT "person_phones_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_emails" ADD CONSTRAINT "person_emails_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_transitions" ADD CONSTRAINT "user_status_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "user_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_transitions" ADD CONSTRAINT "user_status_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "user_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "user_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_history" ADD CONSTRAINT "user_status_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_history" ADD CONSTRAINT "user_status_history_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "user_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_history" ADD CONSTRAINT "user_status_history_from_status_id_to_status_id_fkey" FOREIGN KEY ("from_status_id", "to_status_id") REFERENCES "user_status_transitions"("from_status_id", "to_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_history" ADD CONSTRAINT "user_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_display_currency_id_fkey" FOREIGN KEY ("display_currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_role_id_fkey" FOREIGN KEY ("active_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_end_reason_id_fkey" FOREIGN KEY ("end_reason_id") REFERENCES "session_end_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_purpose_id_fkey" FOREIGN KEY ("purpose_id") REFERENCES "otp_purposes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "otp_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_attempts" ADD CONSTRAINT "auth_attempts_auth_factor_id_fkey" FOREIGN KEY ("auth_factor_id") REFERENCES "auth_factors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_attempts" ADD CONSTRAINT "auth_attempts_otp_challenge_id_fkey" FOREIGN KEY ("otp_challenge_id") REFERENCES "otp_challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_attempts" ADD CONSTRAINT "auth_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_requirements" ADD CONSTRAINT "legal_document_requirements_legal_document_type_id_fkey" FOREIGN KEY ("legal_document_type_id") REFERENCES "legal_document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_requirements" ADD CONSTRAINT "legal_document_requirements_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_legal_document_type_id_fkey" FOREIGN KEY ("legal_document_type_id") REFERENCES "legal_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_consents" ADD CONSTRAINT "person_consents_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_consents" ADD CONSTRAINT "person_consents_legal_document_version_id_fkey" FOREIGN KEY ("legal_document_version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_request_type_id_fkey" FOREIGN KEY ("request_type_id") REFERENCES "data_request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "data_request_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_verification_transitions" ADD CONSTRAINT "courier_verification_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "courier_verification_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_verification_transitions" ADD CONSTRAINT "courier_verification_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "courier_verification_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_profiles" ADD CONSTRAINT "courier_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_profiles" ADD CONSTRAINT "courier_profiles_verification_status_id_fkey" FOREIGN KEY ("verification_status_id") REFERENCES "courier_verification_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_profiles" ADD CONSTRAINT "courier_profiles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_verification_history" ADD CONSTRAINT "courier_verification_history_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_verification_history" ADD CONSTRAINT "courier_verification_history_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "courier_verification_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_verification_history" ADD CONSTRAINT "courier_verification_history_from_status_id_to_status_id_fkey" FOREIGN KEY ("from_status_id", "to_status_id") REFERENCES "courier_verification_transitions"("from_status_id", "to_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_verification_history" ADD CONSTRAINT "courier_verification_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_funding_modes" ADD CONSTRAINT "courier_funding_modes_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_funding_modes" ADD CONSTRAINT "courier_funding_modes_funding_mode_id_fkey" FOREIGN KEY ("funding_mode_id") REFERENCES "funding_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_funding_modes" ADD CONSTRAINT "courier_funding_modes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_documents" ADD CONSTRAINT "courier_documents_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_documents" ADD CONSTRAINT "courier_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "courier_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_documents" ADD CONSTRAINT "courier_documents_vehicle_id_courier_user_id_fkey" FOREIGN KEY ("vehicle_id", "courier_user_id") REFERENCES "vehicles"("id", "courier_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_documents" ADD CONSTRAINT "courier_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_documents" ADD CONSTRAINT "courier_documents_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "courier_document_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_collection_accounts" ADD CONSTRAINT "courier_collection_accounts_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "courier_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_collection_accounts" ADD CONSTRAINT "courier_collection_accounts_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_collection_accounts" ADD CONSTRAINT "courier_collection_accounts_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_collection_accounts" ADD CONSTRAINT "courier_collection_accounts_bank_account_type_id_fkey" FOREIGN KEY ("bank_account_type_id") REFERENCES "bank_account_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_collection_accounts" ADD CONSTRAINT "courier_collection_accounts_qr_file_id_fkey" FOREIGN KEY ("qr_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "establishment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_category_translations" ADD CONSTRAINT "establishment_category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "establishment_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_category_translations" ADD CONSTRAINT "establishment_category_translations_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_category_links" ADD CONSTRAINT "establishment_category_links_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_category_links" ADD CONSTRAINT "establishment_category_links_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "establishment_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishment_phones" ADD CONSTRAINT "establishment_phones_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_section_translations" ADD CONSTRAINT "menu_section_translations_menu_section_id_fkey" FOREIGN KEY ("menu_section_id") REFERENCES "menu_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_section_translations" ADD CONSTRAINT "menu_section_translations_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_menu_section_id_establishment_id_fkey" FOREIGN KEY ("menu_section_id", "establishment_id") REFERENCES "menu_sections"("id", "establishment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "product_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_version_texts" ADD CONSTRAINT "product_version_texts_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_version_texts" ADD CONSTRAINT "product_version_texts_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_zone_kind_id_fkey" FOREIGN KEY ("zone_kind_id") REFERENCES "zone_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zone_fees" ADD CONSTRAINT "delivery_zone_fees_delivery_zone_id_fkey" FOREIGN KEY ("delivery_zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zone_fees" ADD CONSTRAINT "delivery_zone_fees_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_hour_exceptions" ADD CONSTRAINT "operating_hour_exceptions_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_definitions" ADD CONSTRAINT "setting_definitions_data_type_id_fkey" FOREIGN KEY ("data_type_id") REFERENCES "setting_data_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_values" ADD CONSTRAINT "setting_values_setting_definition_id_fkey" FOREIGN KEY ("setting_definition_id") REFERENCES "setting_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_values" ADD CONSTRAINT "setting_values_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_values" ADD CONSTRAINT "setting_values_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Integridad que Prisma no genera (Docs/14-base-de-datos/README.md).
-- Prisma Migrate no conoce lo que sigue: revise toda migración nueva y quite
-- cualquier DROP INDEX / DROP TRIGGER / DROP VIEW que no sea intencional.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────── Reglas de formato (CHECK) ───────────────

ALTER TABLE "person_phones" ADD CONSTRAINT "person_phones_phone_e164_check" CHECK ("phone_e164" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_phone_e164_check" CHECK ("phone_e164" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "establishment_phones" ADD CONSTRAINT "establishment_phones_phone_e164_check" CHECK ("phone_e164" ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "people" ADD CONSTRAINT "people_document_pair_check" CHECK (("document_type_id" IS NULL) = ("document_number" IS NULL));
ALTER TABLE "people" ADD CONSTRAINT "people_given_names_check" CHECK (length(btrim("given_names")) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_password_pair_check" CHECK (("password_hash" IS NULL) = ("password_changed_at" IS NULL));
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_revoked_pair_check" CHECK (("revoked_at" IS NULL) = ("revoked_by_user_id" IS NULL));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_end_pair_check" CHECK (("ended_at" IS NULL) = ("end_reason_id" IS NULL));
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_expiry_check" CHECK ("expires_at" > "issued_at");
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_code_source_check" CHECK (num_nonnulls("code_hash", "provider_message_id") >= 1);
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_expiry_check" CHECK ("expires_at" > "created_at");
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_resolved_pair_check" CHECK (("resolved_at" IS NULL) = ("resolved_by_user_id" IS NULL) OR "resolved_by_user_id" IS NULL);
ALTER TABLE "files" ADD CONSTRAINT "files_size_check" CHECK ("size_bytes" > 0);
ALTER TABLE "files" ADD CONSTRAINT "files_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "establishments" ADD CONSTRAINT "establishments_area_covers_location_check" CHECK (ST_Covers("area", "location"));
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_price_check" CHECK ("price" > 0);
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_prep_minutes_check" CHECK ("prep_minutes" BETWEEN 0 AND 240);
ALTER TABLE "delivery_zone_fees" ADD CONSTRAINT "delivery_zone_fees_amount_check" CHECK ("amount" > 0);
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_rate_check" CHECK ("rate" >= 0 AND "rate" < 1);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_cop_per_unit_check" CHECK ("cop_per_unit" > 0);
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_range_check" CHECK ("closes_at" > "opens_at");
ALTER TABLE "operating_hour_exceptions" ADD CONSTRAINT "operating_hour_exceptions_pair_check" CHECK (("opens_at" IS NULL) = ("closes_at" IS NULL));
ALTER TABLE "operating_hour_exceptions" ADD CONSTRAINT "operating_hour_exceptions_range_check" CHECK ("closes_at" > "opens_at");

-- ─────────────── "Solo uno vigente": índices únicos parciales ───────────────

CREATE UNIQUE INDEX "person_phones_one_primary_idx" ON "person_phones" ("person_id") WHERE "is_primary";
CREATE UNIQUE INDEX "person_emails_one_primary_idx" ON "person_emails" ("person_id") WHERE "is_primary";
CREATE UNIQUE INDEX "user_roles_active_unique_idx" ON "user_roles" ("user_id", "role_id", "municipality_id") NULLS NOT DISTINCT WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "refresh_tokens_one_current_idx" ON "refresh_tokens" ("session_id") WHERE "consumed_at" IS NULL;
CREATE UNIQUE INDEX "person_consents_active_unique_idx" ON "person_consents" ("person_id", "legal_document_version_id") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "vehicles_one_current_idx" ON "vehicles" ("courier_user_id") WHERE "retired_at" IS NULL;
CREATE UNIQUE INDEX "vehicles_plate_current_idx" ON "vehicles" ("plate") WHERE "retired_at" IS NULL;
CREATE UNIQUE INDEX "courier_collection_accounts_one_per_method_idx" ON "courier_collection_accounts" ("courier_user_id", "payment_method_id") WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "establishment_category_links_one_primary_idx" ON "establishment_category_links" ("establishment_id") WHERE "is_primary";
CREATE UNIQUE INDEX "delivery_zones_name_active_idx" ON "delivery_zones" ("municipality_id", "name") WHERE "deactivated_at" IS NULL;
CREATE UNIQUE INDEX "operating_hour_exceptions_unique_idx" ON "operating_hour_exceptions" ("municipality_id", "on_date", "opens_at") NULLS NOT DISTINCT;
CREATE INDEX "sessions_open_idx" ON "sessions" ("user_id") WHERE "ended_at" IS NULL;

-- Franjas de horario del mismo día y municipio que no se superponen.
CREATE TYPE "timerange" AS RANGE (subtype = time);
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_no_overlap"
  EXCLUDE USING gist ("municipality_id" WITH =, "weekday" WITH =, timerange("opens_at", "closes_at") WITH &&)
  WHERE ("deactivated_at" IS NULL);

-- ─────────────── Patrón genérico de estados con historial ───────────────
-- El estado actual (<entidad>.status) solo lo escribe el disparador del historial.

-- AFTER INSERT en <entidad>_history. Argumentos: tabla entidad, llave de la entidad,
-- columna del historial que apunta a la entidad, columna de estado, catálogo de estados.
CREATE FUNCTION fn_status_history_apply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entity_table  text := TG_ARGV[0];
  v_entity_pk     text := TG_ARGV[1];
  v_history_fk    text := TG_ARGV[2];
  v_status_column text := TG_ARGV[3];
  v_catalog       text := TG_ARGV[4];
  v_entity_id     text := to_jsonb(NEW) ->> v_history_fk;
  v_is_initial    boolean;
  v_current       smallint;
  v_rows          integer;
BEGIN
  IF NEW.from_status_id IS NULL THEN
    EXECUTE format('SELECT is_initial FROM %I WHERE id = $1', v_catalog) INTO v_is_initial USING NEW.to_status_id;
    IF NOT coalesce(v_is_initial, false) THEN
      RAISE EXCEPTION 'La primera fila de % debe llevar a un estado inicial', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    EXECUTE format('SELECT %I FROM %I WHERE %I::text = $1', v_status_column, v_entity_table, v_entity_pk) INTO v_current USING v_entity_id;
    IF v_current IS DISTINCT FROM NEW.to_status_id THEN
      RAISE EXCEPTION 'La primera fila de % no coincide con el estado de la entidad', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    EXECUTE format('SELECT count(*) FROM %I WHERE %I::text = $1', TG_TABLE_NAME, v_history_fk) INTO v_rows USING v_entity_id;
    IF v_rows > 1 THEN
      RAISE EXCEPTION 'Solo la primera fila de % puede tener from_status_id nulo', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END IF;

  EXECUTE format('UPDATE %I SET %I = $1 WHERE %I::text = $2 AND %I = $3',
                 v_entity_table, v_status_column, v_entity_pk, v_status_column)
    USING NEW.to_status_id, v_entity_id, NEW.from_status_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    -- Otro cambio llegó primero (concurrencia) o el estado de origen no es el actual.
    RAISE EXCEPTION 'STATUS_CONFLICT: el estado actual de % cambió', v_entity_table USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN NULL;
END;
$$;

-- BEFORE UPDATE OF <estado> en la entidad: solo el disparador del historial puede cambiarlo.
CREATE FUNCTION fn_status_column_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) ->> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[0]) AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'El estado de % se cambia insertando en su historial', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Al confirmar la transacción que crea la entidad, debe existir la primera fila de su historial.
-- Argumentos: tabla historial, columna del historial que apunta a la entidad, llave de la entidad.
CREATE FUNCTION fn_status_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_exists boolean;
BEGIN
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I::text = $1 AND from_status_id IS NULL)', TG_ARGV[0], TG_ARGV[1])
    INTO v_exists USING (to_jsonb(NEW) ->> TG_ARGV[2]);
  IF NOT v_exists THEN
    RAISE EXCEPTION '% se creó sin la primera fila de %', TG_TABLE_NAME, TG_ARGV[0] USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- Filas inmutables: historiales, versiones, auditoría.
CREATE FUNCTION fn_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las filas de % no se editan ni se borran', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- users ← user_status_history
CREATE TRIGGER "user_status_history_apply" AFTER INSERT ON "user_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_status_history_apply('users', 'id', 'user_id', 'status_id', 'user_statuses');
CREATE TRIGGER "users_status_guard" BEFORE UPDATE OF "status_id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION fn_status_column_guard('status_id');
CREATE CONSTRAINT TRIGGER "users_status_history_required" AFTER INSERT ON "users"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_status_history_required('user_status_history', 'user_id', 'id');
CREATE TRIGGER "user_status_history_immutable" BEFORE UPDATE OR DELETE ON "user_status_history"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- courier_profiles ← courier_verification_history
CREATE TRIGGER "courier_verification_history_apply" AFTER INSERT ON "courier_verification_history"
  FOR EACH ROW EXECUTE FUNCTION fn_status_history_apply('courier_profiles', 'user_id', 'courier_user_id', 'verification_status_id', 'courier_verification_statuses');
CREATE TRIGGER "courier_profiles_status_guard" BEFORE UPDATE OF "verification_status_id" ON "courier_profiles"
  FOR EACH ROW EXECUTE FUNCTION fn_status_column_guard('verification_status_id');
CREATE CONSTRAINT TRIGGER "courier_profiles_history_required" AFTER INSERT ON "courier_profiles"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_status_history_required('courier_verification_history', 'courier_user_id', 'user_id');
CREATE TRIGGER "courier_verification_history_immutable" BEFORE UPDATE OR DELETE ON "courier_verification_history"
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- Versiones y registros inmutables.
CREATE TRIGGER "audit_logs_immutable" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "product_versions_immutable" BEFORE UPDATE OR DELETE ON "product_versions" FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "delivery_zone_fees_immutable" BEFORE UPDATE OR DELETE ON "delivery_zone_fees" FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "setting_values_immutable" BEFORE UPDATE OR DELETE ON "setting_values" FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "commission_rates_immutable" BEFORE UPDATE OR DELETE ON "commission_rates" FOR EACH ROW EXECUTE FUNCTION fn_immutable();
CREATE TRIGGER "exchange_rates_immutable" BEFORE UPDATE OR DELETE ON "exchange_rates" FOR EACH ROW EXECUTE FUNCTION fn_immutable();

-- ─────────────── Reglas por tipo que dependen de un catálogo ───────────────

-- user_roles: alcance obligatorio si el rol lo exige y un solo rol COURIER vigente por usuario.
CREATE FUNCTION fn_user_roles_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_role roles%ROWTYPE;
BEGIN
  SELECT * INTO v_role FROM roles WHERE id = NEW.role_id;
  IF v_role.requires_municipality AND NEW.municipality_id IS NULL THEN
    RAISE EXCEPTION 'El rol % exige municipio', v_role.code USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_at IS NULL AND v_role.code = 'COURIER' THEN
    PERFORM 1 FROM users WHERE id = NEW.user_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = NEW.user_id AND ur.role_id = NEW.role_id
               AND ur.revoked_at IS NULL AND ur.id <> NEW.id) THEN
      RAISE EXCEPTION 'El usuario ya tiene un rol COURIER vigente' USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "user_roles_rules" BEFORE INSERT OR UPDATE ON "user_roles" FOR EACH ROW EXECUTE FUNCTION fn_user_roles_rules();

-- auth_attempts: el intento de código apunta a su desafío; el de contraseña, a su usuario.
CREATE FUNCTION fn_auth_attempts_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
BEGIN
  SELECT code INTO v_code FROM auth_factors WHERE id = NEW.auth_factor_id;
  IF v_code = 'OTP' AND NEW.otp_challenge_id IS NULL THEN
    RAISE EXCEPTION 'Un intento OTP debe indicar el desafío' USING ERRCODE = 'check_violation';
  END IF;
  IF v_code = 'PASSWORD' AND NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Un intento de contraseña debe indicar el usuario' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "auth_attempts_rules" BEFORE INSERT ON "auth_attempts" FOR EACH ROW EXECUTE FUNCTION fn_auth_attempts_rules();

-- data_requests: resolved_at lleno si y solo si el estado es terminal.
CREATE FUNCTION fn_data_requests_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_terminal boolean;
BEGIN
  SELECT is_terminal INTO v_terminal FROM data_request_statuses WHERE id = NEW.status_id;
  IF v_terminal <> (NEW.resolved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'resolved_at se llena solo en un estado terminal' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "data_requests_rules" BEFORE INSERT OR UPDATE ON "data_requests" FOR EACH ROW EXECUTE FUNCTION fn_data_requests_rules();

-- vehicles: placa obligatoria si el tipo la exige.
CREATE FUNCTION fn_vehicles_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT requires_plate FROM vehicle_types WHERE id = NEW.vehicle_type_id) AND NEW.plate IS NULL THEN
    RAISE EXCEPTION 'Este tipo de vehículo exige placa' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "vehicles_rules" BEFORE INSERT OR UPDATE ON "vehicles" FOR EACH ROW EXECUTE FUNCTION fn_vehicles_rules();

-- courier_documents: vehículo y vencimiento según el tipo de documento.
CREATE FUNCTION fn_courier_documents_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_type courier_document_types%ROWTYPE;
BEGIN
  SELECT * INTO v_type FROM courier_document_types WHERE id = NEW.document_type_id;
  IF v_type.is_vehicle_document <> (NEW.vehicle_id IS NOT NULL) THEN
    RAISE EXCEPTION 'El documento % % vehículo', v_type.code, CASE WHEN v_type.is_vehicle_document THEN 'exige' ELSE 'no lleva' END USING ERRCODE = 'check_violation';
  END IF;
  IF v_type.requires_expiry AND NEW.expires_on IS NULL THEN
    RAISE EXCEPTION 'El documento % exige fecha de vencimiento', v_type.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "courier_documents_rules" BEFORE INSERT OR UPDATE ON "courier_documents" FOR EACH ROW EXECUTE FUNCTION fn_courier_documents_rules();

-- courier_collection_accounts: medio basado en cuenta; banco y tipo de cuenta solo si el medio lo exige.
CREATE FUNCTION fn_collection_accounts_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_method payment_methods%ROWTYPE;
BEGIN
  SELECT * INTO v_method FROM payment_methods WHERE id = NEW.payment_method_id;
  IF NOT v_method.is_account_based THEN
    RAISE EXCEPTION 'El medio % no recibe en una cuenta', v_method.code USING ERRCODE = 'check_violation';
  END IF;
  IF v_method.requires_bank <> (NEW.bank_id IS NOT NULL AND NEW.bank_account_type_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Banco y tipo de cuenta: % para %', CASE WHEN v_method.requires_bank THEN 'obligatorios' ELSE 'no aplican' END, v_method.code
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_method.requires_bank = false AND (NEW.bank_id IS NOT NULL OR NEW.bank_account_type_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Banco y tipo de cuenta no aplican para %', v_method.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "courier_collection_accounts_rules" BEFORE INSERT OR UPDATE ON "courier_collection_accounts" FOR EACH ROW EXECUTE FUNCTION fn_collection_accounts_rules();

-- files: tipo y tamaño permitidos por el propósito.
CREATE FUNCTION fn_files_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_purpose file_purposes%ROWTYPE;
BEGIN
  SELECT * INTO v_purpose FROM file_purposes WHERE id = NEW.purpose_id;
  IF NOT (NEW.mime_type = ANY (v_purpose.allowed_mime_types)) OR NEW.size_bytes > v_purpose.max_size_bytes THEN
    RAISE EXCEPTION 'Archivo no permitido para %', v_purpose.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "files_rules" BEFORE INSERT OR UPDATE ON "files" FOR EACH ROW EXECUTE FUNCTION fn_files_rules();

-- product_versions: cada versión tiene su texto en español al confirmar la transacción.
CREATE FUNCTION fn_product_version_requires_es() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_version_texts t JOIN languages l ON l.id = t.language_id
                 WHERE t.product_version_id = NEW.id AND l.code = 'es') THEN
    RAISE EXCEPTION 'La versión de producto % no tiene texto en español', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "product_versions_requires_es" AFTER INSERT ON "product_versions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_product_version_requires_es();

-- delivery_zones: dos zonas activas del mismo municipio no se superponen (bloquea el municipio).
CREATE FUNCTION fn_delivery_zones_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deactivated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM municipalities WHERE id = NEW.municipality_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM delivery_zones z
             WHERE z.municipality_id = NEW.municipality_id AND z.deactivated_at IS NULL AND z.id <> NEW.id
               AND ST_Intersects(z.area, NEW.area)
               AND ST_Area(ST_Intersection(z.area::geometry, NEW.area::geometry)::geography) > 0) THEN
    RAISE EXCEPTION 'La zona se superpone con otra zona activa' USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "delivery_zones_no_overlap" BEFORE INSERT OR UPDATE ON "delivery_zones" FOR EACH ROW EXECUTE FUNCTION fn_delivery_zones_no_overlap();

-- operating_hour_exceptions: un día no mezcla "cerrado" con franjas especiales (bloquea el municipio).
CREATE FUNCTION fn_operating_hour_exceptions_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM municipalities WHERE id = NEW.municipality_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM operating_hour_exceptions e
             WHERE e.municipality_id = NEW.municipality_id AND e.on_date = NEW.on_date AND e.id <> NEW.id
               AND ((e.opens_at IS NULL) <> (NEW.opens_at IS NULL))) THEN
    RAISE EXCEPTION 'Un día no puede estar cerrado y tener franjas especiales' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "operating_hour_exceptions_rules" BEFORE INSERT OR UPDATE ON "operating_hour_exceptions" FOR EACH ROW EXECUTE FUNCTION fn_operating_hour_exceptions_rules();

-- setting_values: municipio solo si la definición admite valor por municipio.
CREATE FUNCTION fn_setting_values_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.municipality_id IS NOT NULL AND NOT (SELECT is_scoped_by_municipality FROM setting_definitions WHERE id = NEW.setting_definition_id) THEN
    RAISE EXCEPTION 'Este parámetro no admite valor por municipio' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "setting_values_rules" BEFORE INSERT ON "setting_values" FOR EACH ROW EXECUTE FUNCTION fn_setting_values_rules();

-- ─────────────── Vistas ───────────────

CREATE VIEW "v_active_user_roles" AS
SELECT ur.id, ur.user_id, ur.role_id, r.code AS role_code, ur.municipality_id, ur.granted_at
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.revoked_at IS NULL;

CREATE VIEW "v_user_identity" AS
SELECT u.id AS user_id, p.id AS person_id, p.given_names, p.family_names,
       pp.phone_e164 AS primary_phone, us.code AS status_code, us.can_sign_in,
       coalesce(array_agg(DISTINCT ar.role_code) FILTER (WHERE ar.role_code IS NOT NULL), '{}') AS role_codes,
       u.created_at
FROM users u
JOIN people p ON p.id = u.person_id
JOIN user_statuses us ON us.id = u.status_id
LEFT JOIN person_phones pp ON pp.person_id = p.id AND pp.is_primary
LEFT JOIN v_active_user_roles ar ON ar.user_id = u.id
GROUP BY u.id, p.id, pp.phone_e164, us.code, us.can_sign_in;

CREATE VIEW "v_dispatchable_couriers" AS
SELECT cp.user_id, ar.municipality_id
FROM courier_profiles cp
JOIN courier_verification_statuses vs ON vs.id = cp.verification_status_id AND vs.can_receive_offers
JOIN users u ON u.id = cp.user_id
JOIN user_statuses us ON us.id = u.status_id AND us.can_sign_in
JOIN v_active_user_roles ar ON ar.user_id = cp.user_id AND ar.role_code = 'COURIER';

CREATE VIEW "v_current_courier_funding_mode" AS
SELECT DISTINCT ON (cfm.courier_user_id) cfm.courier_user_id, cfm.funding_mode_id, fm.code AS funding_mode_code, cfm.effective_on
FROM courier_funding_modes cfm
JOIN funding_modes fm ON fm.id = cfm.funding_mode_id
WHERE cfm.effective_on <= current_date
ORDER BY cfm.courier_user_id, cfm.effective_on DESC;

CREATE VIEW "v_current_legal_document_versions" AS
SELECT DISTINCT ON (v.legal_document_type_id) v.id, v.legal_document_type_id, t.code AS document_type_code, v.version_label, v.published_at
FROM legal_document_versions v
JOIN legal_document_types t ON t.id = v.legal_document_type_id
WHERE v.published_at <= now() AND t.deactivated_at IS NULL
ORDER BY v.legal_document_type_id, v.published_at DESC;

CREATE VIEW "v_pending_consents" AS
SELECT DISTINCT u.id AS user_id, cv.id AS legal_document_version_id, cv.document_type_code, cv.version_label
FROM users u
JOIN v_active_user_roles ar ON ar.user_id = u.id
JOIN legal_document_requirements req ON req.role_id = ar.role_id
JOIN v_current_legal_document_versions cv ON cv.legal_document_type_id = req.legal_document_type_id
WHERE NOT EXISTS (SELECT 1 FROM person_consents pc
                  WHERE pc.person_id = u.person_id AND pc.legal_document_version_id = cv.id AND pc.revoked_at IS NULL);

CREATE VIEW "v_current_product_versions" AS
SELECT DISTINCT ON (product_id) id, product_id, price, prep_minutes, created_at
FROM product_versions
ORDER BY product_id, created_at DESC;

CREATE VIEW "v_map_establishments" AS
SELECT e.id, e.municipality_id, e.name, e.address_line, e.location, e.logo_file_id,
       s.code AS status_code, s.accepts_orders, c.code AS primary_category_code
FROM establishments e
JOIN establishment_statuses s ON s.id = e.status_id AND s.is_visible_on_map
JOIN municipalities m ON m.id = e.municipality_id AND m.launched_at IS NOT NULL AND m.launched_at <= now()
LEFT JOIN establishment_category_links l ON l.establishment_id = e.id AND l.is_primary
LEFT JOIN establishment_categories c ON c.id = l.category_id;

CREATE VIEW "v_current_zone_fees" AS
SELECT DISTINCT ON (f.delivery_zone_id) f.id, f.delivery_zone_id, f.amount, f.created_at
FROM delivery_zone_fees f
JOIN delivery_zones z ON z.id = f.delivery_zone_id AND z.deactivated_at IS NULL
ORDER BY f.delivery_zone_id, f.created_at DESC;

-- Valor vigente por clave y municipio, con respaldo en el valor global (municipality_id nulo).
CREATE VIEW "v_current_settings" AS
WITH latest AS (
  SELECT DISTINCT ON (sv.setting_definition_id, sv.municipality_id)
         sv.setting_definition_id, sv.municipality_id, sv.value
  FROM setting_values sv
  ORDER BY sv.setting_definition_id, sv.municipality_id, sv.created_at DESC
)
SELECT d.key, NULL::integer AS municipality_id, g.value
FROM setting_definitions d JOIN latest g ON g.setting_definition_id = d.id AND g.municipality_id IS NULL
UNION ALL
SELECT d.key, m.id AS municipality_id, coalesce(s.value, g.value) AS value
FROM setting_definitions d
CROSS JOIN municipalities m
LEFT JOIN latest s ON s.setting_definition_id = d.id AND s.municipality_id = m.id
LEFT JOIN latest g ON g.setting_definition_id = d.id AND g.municipality_id IS NULL
WHERE coalesce(s.value, g.value) IS NOT NULL;

CREATE VIEW "v_current_commission_rates" AS
SELECT DISTINCT ON (municipality_id) id, municipality_id, rate, created_at
FROM commission_rates
ORDER BY municipality_id, created_at DESC;

CREATE VIEW "v_current_exchange_rates" AS
SELECT DISTINCT ON (currency_id) id, currency_id, cop_per_unit, source, fetched_at
FROM exchange_rates
ORDER BY currency_id, fetched_at DESC;

-- ─────────────── Anonimización del titular (H01.5, Ley 1581) ───────────────
-- Las épicas siguientes amplían esta función con sus tablas (direcciones, destinatarios, notas de pedidos).
CREATE FUNCTION anonymize_person(p_person_id uuid, p_actor_user_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_user users%ROWTYPE;
  v_closed smallint := (SELECT id FROM user_statuses WHERE code = 'CLOSED');
  v_reason smallint := (SELECT id FROM session_end_reasons WHERE code = 'ACCOUNT_DISABLED');
BEGIN
  UPDATE people
     SET given_names = 'Anónimo', family_names = NULL, document_type_id = NULL, document_number = NULL,
         birth_date = NULL, anonymized_at = now(), updated_at = now()
   WHERE id = p_person_id AND anonymized_at IS NULL;
  DELETE FROM person_phones WHERE person_id = p_person_id;
  DELETE FROM person_emails WHERE person_id = p_person_id;

  SELECT * INTO v_user FROM users WHERE person_id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE refresh_tokens rt SET consumed_at = now()
    FROM sessions s WHERE rt.session_id = s.id AND s.user_id = v_user.id AND rt.consumed_at IS NULL;
  UPDATE sessions SET ended_at = now(), end_reason_id = v_reason WHERE user_id = v_user.id AND ended_at IS NULL;

  UPDATE courier_collection_accounts SET holder_name = '', account_number = '', archived_at = coalesce(archived_at, now())
   WHERE courier_user_id = v_user.id;

  UPDATE users SET password_hash = NULL, password_changed_at = NULL WHERE id = v_user.id;
  IF v_user.status_id <> v_closed THEN
    INSERT INTO user_status_history (user_id, from_status_id, to_status_id, changed_by_user_id, reason)
    VALUES (v_user.id, v_user.status_id, v_closed, p_actor_user_id, 'DATA_DELETION_REQUEST');
  END IF;
END;
$$;
