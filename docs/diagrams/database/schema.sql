-- ============================================================
-- Boot-Tracker — Database Schema DDL (PostgreSQL)
-- ============================================================

CREATE TABLE "authentication_customuser" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "email" varchar(254) UNIQUE NOT NULL,
  "first_name" varchar(150) NOT NULL,
  "last_name" varchar(150) NOT NULL,
  "phone" varchar(20),
  "cedula" varchar(10) UNIQUE,
  "role" varchar(20) NOT NULL DEFAULT 'BOOTCAMPER',
  "password" varchar(128) NOT NULL,
  "last_login" timestamp,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_staff" boolean NOT NULL DEFAULT false,
  "is_superuser" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "programs_program" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(200) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "total_cost" decimal(10,2) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL
);

CREATE TABLE "programs_coordinatoremailconfig" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "program_id" uuid NOT NULL REFERENCES "programs_program"("id"),
  "email" varchar(254) NOT NULL,
  "name" varchar(200) NOT NULL,
  "recipient_type" varchar(2) NOT NULL DEFAULT 'TO',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL,
  UNIQUE("program_id", "email")
);

CREATE TABLE "programs_enrollment" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "bootcamper_id" uuid NOT NULL REFERENCES "authentication_customuser"("id"),
  "bootcamp_id" uuid NOT NULL REFERENCES "programs_program"("id"),
  "start_date" date NOT NULL,
  "agreed_price" decimal(10,2) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  UNIQUE("bootcamper_id", "bootcamp_id")
);

CREATE TABLE "leads_lead" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(200) NOT NULL,
  "phone" varchar(20) NOT NULL,
  "email" varchar(254),
  "program_interest" varchar(200),
  "source" varchar(20) NOT NULL DEFAULT 'MANUAL',
  "is_company" boolean NOT NULL DEFAULT false,
  "status" varchar(30) NOT NULL DEFAULT 'NEW',
  "owner_id" uuid REFERENCES "authentication_customuser"("id"),
  "program_id" uuid REFERENCES "programs_program"("id"),
  "assigned_at" timestamp,
  "last_contact" timestamp,
  "version" int NOT NULL DEFAULT 0,
  "deleted_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "leads_interaction" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "lead_id" uuid NOT NULL REFERENCES "leads_lead"("id"),
  "salesperson_id" uuid NOT NULL REFERENCES "authentication_customuser"("id"),
  "interaction_type" varchar(20) NOT NULL,
  "outcome" varchar(30) NOT NULL,
  "interest_level" int,
  "notes" text,
  "campaign" varchar(100),
  "duration_minutes" int,
  "next_action" text,
  "next_action_date" date,
  "created_at" timestamp NOT NULL
);

CREATE TABLE "payments_payment" (
  "id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "bootcamper_id" uuid NOT NULL REFERENCES "authentication_customuser"("id"),
  "program_id" uuid NOT NULL REFERENCES "programs_program"("id"),
  "receipt_file" varchar(255) NOT NULL,
  "receipt_file_type" varchar(10) NOT NULL,
  "ocr_bank_name" varchar(200),
  "ocr_account_last_digits" varchar(10),
  "ocr_amount" decimal(12,2),
  "ocr_transaction_id" varchar(100),
  "ocr_payment_date" date,
  "ocr_confidence" json,
  "ocr_raw_text" text,
  "confirmed_amount" decimal(12,2),
  "confirmed_bank_name" varchar(200),
  "confirmed_transaction_id" varchar(100),
  "status" varchar(10) NOT NULL DEFAULT 'PENDING',
  "rejection_reason" text,
  "validated_by_id" uuid REFERENCES "authentication_customuser"("id"),
  "validated_at" timestamp,
  "submitted_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
