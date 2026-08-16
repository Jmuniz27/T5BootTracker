-- ============================================================
-- Boot-Tracker — DDL para importar en draw.io
--
--   draw.io → Extras (Más) → Editar diagrama... NO.
--   draw.io → Arrange/Disposición → Insert/Insertar → Advanced/Avanzado → SQL...
--   Pegar este archivo completo → Insert.
--
-- Por qué existe este archivo y no se usa `schema.sql`:
-- el importador de draw.io sólo dibuja las relaciones que encuentra como
-- FOREIGN KEY DENTRO del CREATE TABLE. El `pg_dump` las emite todas como
-- ALTER TABLE al final, así que draw.io genera las cajas sin ninguna línea.
-- Acá las FKs están inline y las tablas ordenadas por dependencia.
--
-- Diferencias deliberadas con la base real (ver README.md):
--   - Sólo las 14 tablas de negocio. Se omiten django_*, auth_*, token_blacklist_*.
--   - Sin ON DELETE: en Postgres tampoco existe. CASCADE / SET_NULL / PROTECT
--     los aplica Django. La semántica por arista está en `erd.mmd`.
--   - Sin índices no-únicos: no aportan nada al diagrama.
--
-- Verificado: este archivo se ejecuta sin errores en PostgreSQL 16.
-- ============================================================

CREATE TABLE programs_program (
    id uuid PRIMARY KEY,
    name varchar(200) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_cost numeric(10,2) NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE authentication_customuser (
    id uuid PRIMARY KEY,
    email varchar(254) NOT NULL UNIQUE,
    password varchar(128) NOT NULL,
    first_name varchar(150) NOT NULL,
    last_name varchar(150) NOT NULL,
    phone varchar(20) NULL,
    cedula varchar(13) NULL UNIQUE,
    role varchar(20) NOT NULL,
    coordinator_scope varchar(20) NOT NULL,
    finance_owner_id uuid NULL,
    finance_assigned_at timestamptz NULL,
    verification_status varchar(25) NOT NULL,
    verified_by_id uuid NULL,
    verified_at timestamptz NULL,
    verification_rejection_reason text NOT NULL,
    onboarding_completed_at timestamptz NULL,
    onboarding_token_issued_at timestamptz NULL,
    data_consent_at timestamptz NULL,
    data_consent_version varchar(20) NOT NULL,
    is_active boolean NOT NULL,
    is_staff boolean NOT NULL,
    is_superuser boolean NOT NULL,
    last_login timestamptz NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (finance_owner_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (verified_by_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE authentication_customuser_coordinator_programs (
    id bigint PRIMARY KEY,
    customuser_id uuid NOT NULL,
    program_id uuid NOT NULL,
    UNIQUE (customuser_id, program_id),
    FOREIGN KEY (customuser_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (program_id) REFERENCES programs_program (id)
);

CREATE TABLE programs_cohort (
    id uuid PRIMARY KEY,
    program_id uuid NOT NULL,
    number integer NOT NULL,
    start_month date NOT NULL,
    end_month date NOT NULL,
    status varchar(20) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (program_id, number),
    FOREIGN KEY (program_id) REFERENCES programs_program (id)
);

CREATE TABLE programs_coordinatoremailconfig (
    id uuid PRIMARY KEY,
    program_id uuid NOT NULL,
    email varchar(254) NOT NULL,
    name varchar(200) NOT NULL,
    recipient_type varchar(2) NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamptz NOT NULL,
    UNIQUE (program_id, email),
    FOREIGN KEY (program_id) REFERENCES programs_program (id)
);

CREATE TABLE programs_enrollment (
    id uuid PRIMARY KEY,
    bootcamper_id uuid NOT NULL,
    bootcamp_id uuid NOT NULL,
    cohort_id uuid NULL,
    start_date date NOT NULL,
    discount_percentage numeric(5,2) NOT NULL,
    agreed_price numeric(10,2) NOT NULL,
    status varchar(20) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (bootcamper_id, bootcamp_id, cohort_id),
    FOREIGN KEY (bootcamper_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (bootcamp_id) REFERENCES programs_program (id),
    FOREIGN KEY (cohort_id) REFERENCES programs_cohort (id)
);

CREATE TABLE payments_paymentlink (
    id uuid PRIMARY KEY,
    enrollment_id uuid NOT NULL,
    url varchar(200) NOT NULL,
    amount numeric(12,2) NULL,
    note varchar(200) NOT NULL,
    status varchar(10) NOT NULL,
    created_by_id uuid NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz NULL,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (enrollment_id) REFERENCES programs_enrollment (id),
    FOREIGN KEY (created_by_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE payments_payment (
    id uuid PRIMARY KEY,
    bootcamper_id uuid NOT NULL,
    program_id uuid NOT NULL,
    payment_link_id uuid NULL,
    receipt_file varchar(100) NOT NULL,
    receipt_file_type varchar(10) NOT NULL,
    payment_method varchar(10) NOT NULL,
    ocr_bank_name varchar(200) NOT NULL,
    ocr_account_last_digits varchar(10) NOT NULL,
    ocr_amount numeric(12,2) NULL,
    ocr_transaction_id varchar(100) NOT NULL,
    ocr_payment_date date NULL,
    ocr_confidence jsonb NOT NULL,
    ocr_raw_text text NOT NULL,
    payer_name varchar(200) NOT NULL,
    payer_identification varchar(20) NOT NULL,
    payer_email varchar(254) NOT NULL,
    payer_address varchar(255) NOT NULL,
    payer_phone varchar(20) NOT NULL,
    document_number varchar(50) NOT NULL,
    confirmed_amount numeric(12,2) NULL,
    confirmed_bank_name varchar(200) NOT NULL,
    confirmed_transaction_id varchar(100) NOT NULL,
    status varchar(10) NOT NULL,
    rejection_reason text NOT NULL,
    validated_by_id uuid NULL,
    validated_at timestamptz NULL,
    submitted_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz NULL,
    deleted_by_id uuid NULL,
    FOREIGN KEY (bootcamper_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (program_id) REFERENCES programs_program (id),
    FOREIGN KEY (payment_link_id) REFERENCES payments_paymentlink (id),
    FOREIGN KEY (validated_by_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (deleted_by_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE payments_paymentplan (
    id uuid PRIMARY KEY,
    bootcamper_id uuid NOT NULL UNIQUE,
    file varchar(100) NOT NULL,
    file_type varchar(10) NOT NULL,
    original_name varchar(255) NOT NULL,
    uploaded_by_id uuid NULL,
    uploaded_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (bootcamper_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (uploaded_by_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE payments_bootcamperassignmentsetting (
    id bigint PRIMARY KEY,
    self_assign_enabled boolean NOT NULL,
    updated_by_id uuid NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (updated_by_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE leads_lead (
    id uuid PRIMARY KEY,
    name varchar(200) NOT NULL,
    phone varchar(20) NOT NULL,
    email varchar(254) NULL,
    program_interest varchar(200) NOT NULL,
    source varchar(20) NOT NULL,
    is_company boolean NOT NULL,
    status varchar(30) NOT NULL,
    owner_id uuid NULL,
    bootcamper_id uuid NULL,
    program_id uuid NULL,
    assigned_at timestamptz NULL,
    released_at timestamptz NULL,
    last_contact timestamptz NULL,
    discard_reason varchar(20) NOT NULL,
    discard_detail text NOT NULL,
    discarded_at timestamptz NULL,
    discarded_by_id uuid NULL,
    status_before_discard varchar(30) NOT NULL,
    version integer NOT NULL,
    deleted_at timestamptz NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (bootcamper_id) REFERENCES authentication_customuser (id),
    FOREIGN KEY (program_id) REFERENCES programs_program (id),
    FOREIGN KEY (discarded_by_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE leads_interaction (
    id uuid PRIMARY KEY,
    lead_id uuid NOT NULL,
    salesperson_id uuid NOT NULL,
    interaction_type varchar(20) NOT NULL,
    outcome varchar(30) NOT NULL,
    interest_level integer NULL,
    notes text NOT NULL,
    campaign varchar(100) NOT NULL,
    duration_minutes integer NULL,
    next_action text NOT NULL,
    next_action_date date NULL,
    lead_status varchar(20) NULL,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES leads_lead (id),
    FOREIGN KEY (salesperson_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE leads_leadassignmentsetting (
    id bigint PRIMARY KEY,
    self_assign_enabled boolean NOT NULL,
    updated_by_id uuid NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (updated_by_id) REFERENCES authentication_customuser (id)
);

CREATE TABLE meetings_meeting (
    id bigint PRIMARY KEY,
    title varchar(255) NOT NULL,
    description text NOT NULL,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    lead_id uuid NOT NULL,
    assigned_to_id uuid NULL,
    google_event_id varchar(255) NULL,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES leads_lead (id),
    FOREIGN KEY (assigned_to_id) REFERENCES authentication_customuser (id)
);
