# Wrench — Vehicle Maintenance Tracker
## Installation Guide

---

## Assumptions

- Docker Engine and the Docker Compose plugin are installed and running
- You have a terminal with basic command-line familiarity
- Port **3000** (application) and port **5432** (database) are available on your machine
- You have internet access for the initial image pull and font loading

---

## What You Need

The following files are required. All are included in the distribution package:

```
vehicle-api/
  Dockerfile
  docker-compose.yml
  index.js
  package.json
  package-lock.json
  .env.example
  public/
    index.html
vehicle_maintenance_blank.sql
INSTALL.md
```

---

## Step 1 — Create Your Project Folder

**Windows (PowerShell or Command Prompt):**
```cmd
mkdir C:\vehicle-api\public
```

**Linux / Mac:**
```bash
mkdir -p ~/vehicle-api/public
```

Copy all distribution files into place:

```
vehicle-api/Dockerfile
vehicle-api/docker-compose.yml
vehicle-api/index.js
vehicle-api/package.json
vehicle-api/package-lock.json
vehicle-api/.env.example
vehicle-api/public/index.html
```

Place vehicle_maintenance_blank.sql anywhere convenient — you will need
to navigate to it in Step 4.

---

## Step 2 — Configure Credentials

**Windows:**
```cmd
cd C:\vehicle-api
copy .env.example .env
```

**Linux / Mac:**
```bash
cd ~/vehicle-api
cp .env.example .env
```

Open .env in a text editor. The defaults will work as-is for a local
installation. If you want to change the database password (recommended),
edit these two lines and make sure they match:

```
POSTGRES_PASSWORD=your_password_here
PGPASSWORD=your_password_here
```

---

## Step 3 — Start the Application

**Windows:**
```cmd
cd C:\vehicle-api
docker compose up --build -d
```

**Linux / Mac:**
```bash
cd ~/vehicle-api
docker compose up --build -d
```

This will:
- Pull the Postgres and Node base images (first run only — requires internet)
- Build the application container
- Start both the database and application containers in the background

Wait approximately 15 seconds for the database to initialize, then verify
both containers are running:

```
docker ps
```

You should see two containers: vehicle-api-db-1 and vehicle-api-api-1.

---

## Step 4 — Initialize the Database

Navigate to the folder containing vehicle_maintenance_blank.sql first,
then run the appropriate command below.

**Windows (PowerShell):**
```powershell
cd C:\path\to\sql\file
Get-Content vehicle_maintenance_blank.sql | docker exec -i vehicle-api-db-1 psql -U postgres vehicle_maintenance_db
```

**Windows (Command Prompt):**
```cmd
cd C:\path\to\sql\file
docker exec -i vehicle-api-db-1 psql -U postgres vehicle_maintenance_db < vehicle_maintenance_blank.sql
```

**Linux / Mac:**
```bash
cd /path/to/sql/file
docker exec -i vehicle-api-db-1 psql -U postgres vehicle_maintenance_db < vehicle_maintenance_blank.sql
```

If you see a stream of CREATE, ALTER, and SET lines with no errors,
the database is ready.

Note — Linux only: If you receive an "invalid byte sequence for encoding
UTF8" error, convert the file first:

```bash
iconv -f UTF-16 -t UTF-8 vehicle_maintenance_blank.sql \
  -o vehicle_maintenance_blank_utf8.sql

docker exec -i vehicle-api-db-1 psql -U postgres vehicle_maintenance_db \
  < vehicle_maintenance_blank_utf8.sql
```

---

## Step 5 — Verify

Open a browser and go to:

```
http://localhost:3000
```

You should see the Wrench application with empty Vehicles, Garages, and
Maintenance Schedule lists.

To confirm the API is healthy, open a terminal and run:

```
docker exec vehicle-api-db-1 curl http://localhost:3000/health
```

Expected response: {"status":"ok"}

---

## Accessing From Other Devices

The application is accessible from any device on your local network.
Find your machine's IP address:

**Windows:**
```cmd
ipconfig
```
Look for the IPv4 Address under your active network adapter.

**Linux / Mac:**
```bash
hostname -I
```

Then open http://YOUR_IP_ADDRESS:3000 on any device on the same network.

---

## Starting and Stopping

**Start** (after initial setup):

Windows:
```cmd
cd C:\vehicle-api
docker compose up -d
```

Linux / Mac:
```bash
cd ~/vehicle-api
docker compose up -d
```

**Stop:**
```
docker compose down
```

**Restart the application after updating files:**
```
docker compose restart api
```

**Full rebuild** (after changes to index.js, package.json, or Dockerfile):
```
docker compose up --build -d
```

---

## Database Access

To connect to the database using a tool such as DBeaver or TablePlus:

| Setting  | Value                   |
|----------|-------------------------|
| Host     | localhost               |
| Port     | 5432                    |
| Database | vehicle_maintenance_db  |
| User     | postgres                |
| Password | (as set in your .env)   |

---

## First Steps After Installation

1. Go to the Garages tab and add at least one garage
2. Go to the Vehicles tab and add your vehicle(s)
3. Go to the Maintenance Schedule tab, select a vehicle, and enter
   your scheduled maintenance tasks
4. Return to the Work Orders tab to begin creating work orders

---

## Backup

It is recommended to schedule regular database backups. Navigate to your
project folder first, then run the appropriate command:

**Windows (PowerShell):**
```powershell
cd C:\vehicle-api
$date = Get-Date -Format "ddMMyy"
docker exec vehicle-api-db-1 pg_dump -U postgres vehicle_maintenance_db |
  Out-File -Encoding utf8 "vehicle_maintenance_backup_$date.sql"
```

**Windows (Command Prompt):**
```cmd
cd C:\vehicle-api
docker exec vehicle-api-db-1 pg_dump -U postgres vehicle_maintenance_db > vehicle_maintenance_backup.sql
```

**Linux / Mac:**
```bash
cd ~/vehicle-api
docker exec vehicle-api-db-1 pg_dump -U postgres vehicle_maintenance_db \
  > vehicle_maintenance_backup_$(date +%d%m%y).sql
```

Store the resulting .sql file in a safe location. It can be used to
restore your data on any compatible installation using the same process
as Step 4.
