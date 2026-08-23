CREATE TABLE sites (
    site_id SERIAL PRIMARY KEY,
    site_name TEXT UNIQUE NOT NULL
);

CREATE TABLE suppliers (
    supplier_id SERIAL PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    abn TEXT,
    category TEXT
);

CREATE TABLE fuel_deliveries (
    id SERIAL PRIMARY KEY,
    invoice_no TEXT NOT NULL,
    raw_delivery_date TEXT NOT NULL,
    cleaned_delivery_date DATE,
    fuel_type TEXT,
    raw_quantity TEXT,
    quantity_litres NUMERIC,
    raw_unit TEXT,
    raw_cost TEXT,
    cost_aud NUMERIC,
    site_id INT REFERENCES sites(site_id),
    data_quality_flag_id INT
);

CREATE TABLE electricity_readings (
    id SERIAL PRIMARY KEY,
    meter_id TEXT NOT NULL,
    meter_description TEXT,
    period DATE,
    consumption_kwh NUMERIC,
    data_quality_flag_id INT
);

CREATE TABLE incidents (
    id SERIAL PRIMARY KEY,
    incident_id TEXT UNIQUE NOT NULL,
    incident_date DATE,
    site_id INT REFERENCES sites(site_id),
    type_code TEXT,
    raw_severity TEXT,
    severity_normalised TEXT,
    description TEXT,
    ai_category TEXT,
    ai_is_psychosocial BOOLEAN,
    ai_severity_mismatch BOOLEAN,
    ai_mismatch_reasoning TEXT,
    data_quality_flag_id INT
);

CREATE TABLE emission_factors (
    id SERIAL PRIMARY KEY,
    activity TEXT NOT NULL,
    scope INT NOT NULL,
    unit TEXT NOT NULL,
    kg_co2e_per_unit NUMERIC NOT NULL,
    source TEXT
);

CREATE TABLE data_quality_flags (
    id SERIAL PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_record_ref TEXT NOT NULL,
    issue_description TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    justification TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);