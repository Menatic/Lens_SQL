"""
DataGen — DuckDB-powered synthetic dataset generator.
Each template produces a realistic CSV using generate_series + DuckDB expressions.

DuckDB type note: hash() returns UBIGINT. Casting UBIGINT→BIGINT overflows for
large values. The safe pattern is (hash(x) % N)::BIGINT + 1 — do the modulo
while still UBIGINT (result is always in [0, N-1], fits in BIGINT), then cast.
"""
from __future__ import annotations

import os
import tempfile

import duckdb

# ── Template definitions ──────────────────────────────────────────────────────

TEMPLATES: dict[str, dict] = {
    "employees": {
        "label":        "HR / Employees",
        "icon":         "👥",
        "description":  "Employee records with departments, salaries, levels, and hire dates",
        "table":        "employees",
        "default_rows": 2000,
        "max_rows":     500_000,
        "columns":      ["employee_id","full_name","department","level","salary_usd",
                         "performance_score","hire_date","status","location","manager_id"],
        "sql": r"""
SELECT
    i                                                  AS employee_id,
    ['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Barbara',
     'David','Susan','Richard','Jessica','Joseph','Sarah','Thomas','Karen','Charles','Lisa',
     'Daniel','Nancy','Matthew','Betty','Anthony','Margaret','Mark','Sandra','Donald','Ashley',
     'Steven','Dorothy','Paul','Kimberly','Andrew','Emily','Kenneth','Donna','Joshua','Michelle']
    [(i % 40) + 1]
    || ' ' ||
    ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
     'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin']
    [(i % 20) + 1]                                    AS full_name,
    ['Engineering','Marketing','Sales','Finance','HR','Operations','Product','Legal','Support','Design']
    [(hash(i::TEXT) % 10)::BIGINT + 1]                AS department,
    ['Junior','Mid','Senior','Lead','Principal','Director','VP']
    [(hash(i::TEXT || 'l') % 7)::BIGINT + 1]          AS level,
    round(45000 + random() * 155000, -2)               AS salary_usd,
    round(1 + random() * 4, 1)                         AS performance_score,
    (DATE '2015-01-01' + INTERVAL (random() * 3285) DAY)::DATE AS hire_date,
    ['Active','Active','Active','Active','On Leave','Terminated']
    [(hash(i::TEXT || 's') % 6)::BIGINT + 1]          AS status,
    ['New York','San Francisco','London','Berlin','Toronto','Singapore',
     'Sydney','Austin','Chicago','Remote']
    [(hash(i::TEXT || 'c') % 10)::BIGINT + 1]         AS location,
    CASE WHEN i > 1 THEN (1 + (random() * (i - 1))::INT) ELSE NULL END AS manager_id
FROM generate_series(1, {rows}) t(i)
""",
    },

    "ecommerce": {
        "label":        "E-Commerce Orders",
        "icon":         "🛒",
        "description":  "Customer orders with products, revenue, payment methods, shipping country",
        "table":        "ecom_orders",
        "default_rows": 20_000,
        "max_rows":     2_000_000,
        "columns":      ["order_id","customer_id","product_name","category","quantity",
                         "unit_price","total_usd","status","order_date","payment_method","ship_country"],
        "sql": r"""
SELECT
    i                                                  AS order_id,
    (1 + (random() * 9999)::INT)                       AS customer_id,
    ['Laptop','Phone','Headphones','Camera','TV','Tablet','Smart Watch','Speaker',
     'Monitor','Keyboard','Mouse','SSD Drive','Graphics Card','Processor','RAM Kit',
     'Charger','USB Cable','Phone Case','Laptop Stand','Webcam']
    [(hash(i::TEXT) % 20)::BIGINT + 1]                AS product_name,
    ['Electronics','Accessories','Computing','Audio','Displays','Storage']
    [(hash(i::TEXT || 'cat') % 6)::BIGINT + 1]        AS category,
    (1 + (random() * 5)::INT)                          AS quantity,
    round(9.99 + random() * 1990, 2)                   AS unit_price,
    round((1 + (random() * 5)::INT) * (9.99 + random() * 1990), 2) AS total_usd,
    ['pending','processing','shipped','delivered','delivered','delivered','returned','cancelled']
    [(hash(i::TEXT || 'st') % 8)::BIGINT + 1]         AS status,
    (DATE '2022-01-01' + INTERVAL (random() * 1095) DAY)::DATE AS order_date,
    ['credit_card','paypal','apple_pay','google_pay','bank_transfer','crypto']
    [(hash(i::TEXT || 'pay') % 6)::BIGINT + 1]        AS payment_method,
    ['United States','United Kingdom','Canada','Germany','France','Australia','Japan',
     'India','Brazil','Mexico','Netherlands','Spain','Italy','South Korea','Sweden',
     'Norway','Denmark','Singapore','UAE','Switzerland']
    [(hash(i::TEXT || 'sh') % 20)::BIGINT + 1]        AS ship_country
FROM generate_series(1, {rows}) t(i)
""",
    },

    "web_analytics": {
        "label":        "Web Analytics",
        "icon":         "📊",
        "description":  "Page views, sessions, devices, referral sources, conversion events",
        "table":        "pageviews",
        "default_rows": 100_000,
        "max_rows":     5_000_000,
        "columns":      ["event_id","session_id","user_id","page_path","event_type",
                         "time_on_page_sec","scroll_depth","browser","device_type",
                         "country","traffic_source","event_ts"],
        "sql": r"""
SELECT
    i                                                  AS event_id,
    (1 + (random() * 19999)::INT)                      AS session_id,
    (1 + (random() * 9999)::INT)                       AS user_id,
    ['/','/','/','/','/products','/products','/products/detail',
     '/checkout','/checkout','/search','/blog','/about','/pricing',
     '/login','/signup','/dashboard','/account']
    [(hash(i::TEXT) % 17)::BIGINT + 1]                AS page_path,
    ['pageview','pageview','pageview','click','scroll','form_submit',
     'purchase','add_to_cart','search','login']
    [(hash(i::TEXT || 'ev') % 10)::BIGINT + 1]        AS event_type,
    round(1 + random() * 299, 1)                       AS time_on_page_sec,
    round(random(), 4)                                 AS scroll_depth,
    ['Chrome 120','Chrome 121','Firefox 122','Safari 17','Edge 120',
     'Mobile Chrome','Mobile Safari','Samsung Browser']
    [(hash(i::TEXT || 'ua') % 8)::BIGINT + 1]         AS browser,
    ['desktop','desktop','desktop','mobile','mobile','tablet']
    [(hash(i::TEXT || 'dv') % 6)::BIGINT + 1]         AS device_type,
    ['US','US','US','GB','CA','DE','AU','FR','IN','BR','NL','JP','SG','MX','SE']
    [(hash(i::TEXT || 'geo') % 15)::BIGINT + 1]       AS country,
    ['organic','organic','direct','direct','google_ads','facebook','email',
     'referral','twitter','affiliate']
    [(hash(i::TEXT || 'src') % 10)::BIGINT + 1]       AS traffic_source,
    TIMESTAMP '2024-01-01' + INTERVAL (random() * 31536000) SECOND AS event_ts
FROM generate_series(1, {rows}) t(i)
""",
    },

    "stock_prices": {
        "label":        "Stock Prices (OHLCV)",
        "icon":         "📈",
        "description":  "Daily OHLCV for 20 tickers with exchange, volume, and adjusted close",
        "table":        "stock_prices",
        "default_rows": 10_000,
        "max_rows":     1_000_000,
        "columns":      ["record_id","ticker","trade_date","open","high","low","close",
                         "adj_close","volume","exchange"],
        "sql": r"""
SELECT
    i                                                  AS record_id,
    ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','JPM','JNJ','V',
     'WMT','PG','MA','HD','BAC','KO','PEP','ABBV','MRK','CSCO']
    [(hash(i::TEXT) % 20)::BIGINT + 1]                AS ticker,
    (DATE '2020-01-01' + INTERVAL ((i-1) / 20) DAY)::DATE AS trade_date,
    round(50 + random() * 450, 2)                      AS open,
    round(50 + random() * 450 + random() * 15, 2)     AS high,
    round(50 + random() * 450 - random() * 15, 2)     AS low,
    round(50 + random() * 450, 2)                      AS close,
    round(50 + random() * 450, 2)                      AS adj_close,
    (500000 + (random() * 99500000)::BIGINT)           AS volume,
    ['NYSE','NASDAQ','NYSE','NASDAQ','NASDAQ','NASDAQ','NASDAQ','NYSE','NYSE','NYSE',
     'NYSE','NYSE','NYSE','NYSE','NYSE','NYSE','NASDAQ','NYSE','NYSE','NASDAQ']
    [(hash(i::TEXT) % 20)::BIGINT + 1]                AS exchange
FROM generate_series(1, {rows}) t(i)
""",
    },

    "iot_sensors": {
        "label":        "IoT Sensor Readings",
        "icon":         "🌡️",
        "description":  "Time-series sensor data with device IDs, values, units, and anomaly flags",
        "table":        "sensor_readings",
        "default_rows": 200_000,
        "max_rows":     10_000_000,
        "columns":      ["reading_id","device_id","sensor_type","value","unit",
                         "location","is_anomaly","battery_pct","recorded_at"],
        "sql": r"""
SELECT
    i                                                  AS reading_id,
    'device_' || lpad(((hash(i::TEXT) % 500)::BIGINT + 1)::TEXT, 4, '0') AS device_id,
    ['temperature','humidity','pressure','co2','motion','light','vibration','power_usage']
    [(hash(i::TEXT || 't') % 8)::BIGINT + 1]          AS sensor_type,
    round(CASE (hash(i::TEXT || 't') % 8)::BIGINT
        WHEN 0 THEN -10 + random() * 50
        WHEN 1 THEN 10  + random() * 85
        WHEN 2 THEN 950 + random() * 100
        WHEN 3 THEN 350 + random() * 1650
        WHEN 4 THEN random()
        WHEN 5 THEN random() * 1500
        WHEN 6 THEN random() * 10
        ELSE         random() * 5000
    END, 4)                                            AS value,
    ['C','%','hPa','ppm','bool','lux','g','W']
    [(hash(i::TEXT || 't') % 8)::BIGINT + 1]          AS unit,
    ['building_a','building_b','warehouse','outdoor','server_room','factory','lab','office']
    [(hash(i::TEXT || 'l') % 8)::BIGINT + 1]          AS location,
    random() < 0.02                                    AS is_anomaly,
    round(5 + random() * 95, 1)                        AS battery_pct,
    TIMESTAMP '2024-01-01' + i * INTERVAL '1' SECOND   AS recorded_at
FROM generate_series(1, {rows}) t(i)
""",
    },

    "saas_metrics": {
        "label":        "SaaS Subscriptions",
        "icon":         "💳",
        "description":  "MRR, plan tiers, churn events, billing cycles, seat counts",
        "table":        "subscriptions",
        "default_rows": 8_000,
        "max_rows":     500_000,
        "columns":      ["subscription_id","account_id","plan_name","mrr_usd","seats",
                         "billing_cycle","status","start_date","churn_date",
                         "payment_method","country","nps_score"],
        "sql": r"""
SELECT
    i                                                  AS subscription_id,
    (1 + (random() * GREATEST({rows}/3.0, 1))::INT)   AS account_id,
    ['free','starter','professional','business','enterprise']
    [(hash(i::TEXT || 'p') % 5)::BIGINT + 1]          AS plan_name,
    [0, 29, 99, 499, 1999]
    [(hash(i::TEXT || 'p') % 5)::BIGINT + 1]          AS mrr_usd,
    [1, 1, 5, 25, 100]
    [(hash(i::TEXT || 'p') % 5)::BIGINT + 1] * (1 + (random() * 3)::INT) AS seats,
    ['monthly','monthly','monthly','annual','annual']
    [(hash(i::TEXT || 'b') % 5)::BIGINT + 1]          AS billing_cycle,
    ['active','active','active','active','active','churned','churned','trial','paused']
    [(hash(i::TEXT || 's') % 9)::BIGINT + 1]          AS status,
    (DATE '2020-01-01' + INTERVAL (random() * 1460) DAY)::DATE AS start_date,
    CASE
        WHEN (hash(i::TEXT || 's') % 9)::BIGINT IN (5, 6)
        THEN (DATE '2020-01-01' + INTERVAL (30 + random() * 1430) DAY)::DATE
        ELSE NULL
    END                                                AS churn_date,
    ['credit_card','invoice','ach','wire']
    [(hash(i::TEXT || 'pm') % 4)::BIGINT + 1]         AS payment_method,
    ['US','US','US','UK','DE','CA','AU','FR','JP','IN','SG','NL','SE','BR','MX']
    [(hash(i::TEXT || 'co') % 15)::BIGINT + 1]        AS country,
    CASE WHEN random() < 0.3 THEN (1 + (random() * 9)::INT) ELSE NULL END AS nps_score
FROM generate_series(1, {rows}) t(i)
""",
    },

    "server_logs": {
        "label":        "API / Server Logs",
        "icon":         "🖥️",
        "description":  "HTTP access logs with endpoints, status codes, latency, and client IPs",
        "table":        "api_logs",
        "default_rows": 200_000,
        "max_rows":     10_000_000,
        "columns":      ["log_id","method","endpoint","status_code","latency_ms",
                         "response_bytes","client_ip","user_agent","user_id","timestamp"],
        "sql": r"""
SELECT
    i                                                  AS log_id,
    ['GET','GET','GET','GET','POST','POST','PUT','DELETE','PATCH']
    [(hash(i::TEXT) % 9)::BIGINT + 1]                 AS method,
    ['/api/users','/api/products','/api/orders','/api/auth/login','/api/search',
     '/api/dashboard','/api/reports','/health','/api/webhooks','/api/events',
     '/api/v2/analytics','/api/billing','/api/settings','/api/notifications']
    [(hash(i::TEXT || 'ep') % 14)::BIGINT + 1]        AS endpoint,
    CASE
        WHEN random() < 0.65  THEN 200
        WHEN random() < 0.80  THEN 201
        WHEN random() < 0.88  THEN 400
        WHEN random() < 0.93  THEN 401
        WHEN random() < 0.97  THEN 404
        WHEN random() < 0.995 THEN 500
        ELSE 503
    END                                                AS status_code,
    round(CASE WHEN random() < 0.03
          THEN 2000 + random() * 8000
          ELSE 1 + random() * 499 END, 2)              AS latency_ms,
    (512 + (random() * 500000)::INT)                   AS response_bytes,
    (10 + (random() * 245)::INT)::TEXT || '.' ||
    (random() * 255)::INT::TEXT || '.' ||
    (random() * 255)::INT::TEXT || '.' ||
    (random() * 255)::INT::TEXT                        AS client_ip,
    ['Mozilla/5.0 Chrome/120','Mozilla/5.0 Firefox/121',
     'Mozilla/5.0 Safari/17','Mozilla/5.0 Edge/120',
     'python-requests/2.31.0','curl/8.4.0','PostmanRuntime/7.36']
    [(hash(i::TEXT || 'ua') % 7)::BIGINT + 1]         AS user_agent,
    CASE WHEN random() < 0.85
         THEN (1 + (random() * 49999)::INT) ELSE NULL END AS user_id,
    TIMESTAMP '2024-01-01' + INTERVAL (random() * 7776000) SECOND AS timestamp
FROM generate_series(1, {rows}) t(i)
""",
    },

    "healthcare": {
        "label":        "Healthcare / Patients",
        "icon":         "🏥",
        "description":  "Patient visits, diagnoses, procedures, billing, insurance, and outcomes",
        "table":        "patient_visits",
        "default_rows": 15_000,
        "max_rows":     1_000_000,
        "columns":      ["visit_id","patient_id","age","gender","blood_group","department",
                         "primary_diagnosis","outcome","length_of_stay_days",
                         "total_bill_usd","insurance_covered_usd","insurance_provider","admission_date"],
        "sql": r"""
SELECT
    i                                                  AS visit_id,
    (1 + (random() * 9999)::INT)                       AS patient_id,
    18 + (random() * 80)::INT                          AS age,
    ['M','F','M','F','M','F','Other']
    [(hash(i::TEXT || 'g') % 7)::BIGINT + 1]          AS gender,
    ['A+','A-','B+','B-','AB+','AB-','O+','O-']
    [(hash(i::TEXT || 'bg') % 8)::BIGINT + 1]         AS blood_group,
    ['Emergency','Outpatient','Inpatient','ICU','Surgery','Radiology','Laboratory',
     'Cardiology','Oncology','Pediatrics']
    [(hash(i::TEXT || 'd') % 10)::BIGINT + 1]         AS department,
    ['Hypertension','Type 2 Diabetes','Bone Fracture','Appendicitis','Pneumonia',
     'Migraine','Asthma','Arthritis','Cardiac Arrest','COVID-19','Influenza',
     'Laceration','Anxiety Disorder','Major Depression','Kidney Stones','GERD',
     'Anemia','Hypertension Crisis','Chest Pain NOS','Back Pain']
    [(hash(i::TEXT || 'dx') % 20)::BIGINT + 1]        AS primary_diagnosis,
    ['Discharged','Discharged','Discharged','Admitted','Admitted',
     'Transferred','Observation','Deceased']
    [(hash(i::TEXT || 'oc') % 8)::BIGINT + 1]         AS outcome,
    (1 + (random() * 20)::INT)                         AS length_of_stay_days,
    round(250 + random() * 74750, 2)                   AS total_bill_usd,
    round(random() * 60000, 2)                         AS insurance_covered_usd,
    ['Medicare','Medicaid','BlueCross BlueShield','Aetna','UnitedHealth',
     'Cigna','Humana','Kaiser','Self-pay','Tricare']
    [(hash(i::TEXT || 'ins') % 10)::BIGINT + 1]       AS insurance_provider,
    (DATE '2018-01-01' + INTERVAL (random() * 2190) DAY)::DATE AS admission_date
FROM generate_series(1, {rows}) t(i)
""",
    },
}


# ── Generator ─────────────────────────────────────────────────────────────────

def generate_dataset(template_id: str, rows: int, custom_sql: str | None = None) -> dict:
    """
    Generate a CSV file from a template or custom SQL.
    Returns: {path, table_name, rows, columns, preview}
    """
    if template_id == "custom":
        if not custom_sql:
            return {"error": "custom_sql required for template_id='custom'"}
        sql        = custom_sql
        table_name = "custom_data"
    else:
        tmpl = TEMPLATES.get(template_id)
        if not tmpl:
            return {"error": f"Unknown template: {template_id!r}"}
        rows       = min(rows, tmpl["max_rows"])
        sql        = tmpl["sql"].format(rows=rows)
        table_name = tmpl["table"]

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    tmp.close()

    try:
        conn = duckdb.connect()
        conn.execute(f"COPY ({sql}) TO '{tmp.name}' (HEADER true, DELIMITER ',')")

        preview_rows = conn.execute(
            f"SELECT * FROM read_csv_auto('{tmp.name}') LIMIT 8"
        ).fetchall()
        cols = [d[0] for d in conn.execute(
            f"SELECT * FROM read_csv_auto('{tmp.name}') LIMIT 0"
        ).description or []]
        actual_rows = conn.execute(
            f"SELECT COUNT(*) FROM read_csv_auto('{tmp.name}')"
        ).fetchone()[0]
        conn.close()

        return {
            "path":       tmp.name,
            "table_name": table_name,
            "rows":       actual_rows,
            "columns":    cols,
            "preview":    [dict(zip(cols, row)) for row in preview_rows],
        }
    except Exception as e:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)
        return {"error": str(e)}
