# Payroll System — Database Setup Guide

## Prerequisites

- **MySQL 8.0+** installed on the DB server device
- Network access between devices (same LAN or VPN)

---

## 1. Install MySQL

### macOS (Homebrew)
```bash
brew install mysql
brew services start mysql
mysql_secure_installation   # Set root password, remove test DBs
```

### Ubuntu / Debian
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
sudo mysql_secure_installation
```

### Windows
Download the [MySQL Installer](https://dev.mysql.com/downloads/installer/) and follow the setup wizard.

---

## 2. Run the Schema

```bash
# From the project root:
mysql -u root -p < database/schema.sql
```

This creates:
- Database `payroll_db`
- Application user `payroll_app` with full access
- All required tables
- Default salary components and system settings
- Default admin user (`admin@payroll.local` / `Admin@123`)

---

## 3. Enable Remote Connections

By default MySQL only listens on `127.0.0.1`. To allow other devices on the LAN:

### Edit MySQL config

**macOS** (Homebrew): `/opt/homebrew/etc/my.cnf`  
**Ubuntu**: `/etc/mysql/mysql.conf.d/mysqld.cnf`  
**Windows**: `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`

```ini
[mysqld]
bind-address = 0.0.0.0
```

Then restart MySQL:
```bash
# macOS
brew services restart mysql

# Ubuntu
sudo systemctl restart mysql
```

### Verify the user has remote access

The schema already creates the user with `@'%'` (any host). Verify:
```sql
SELECT user, host FROM mysql.user WHERE user = 'payroll_app';
-- Should show:  payroll_app | %
```

---

## 4. Firewall

Ensure port **3306** is open on the DB server:

```bash
# macOS (usually no firewall by default)

# Ubuntu
sudo ufw allow 3306/tcp

# Windows
# Add inbound rule for port 3306 in Windows Firewall
```

---

## 5. Configure the Next.js App

On **each device** running the Next.js app, create `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
MYSQL_HOST=192.168.1.100    # Replace with your DB server's IP
MYSQL_PORT=3306
MYSQL_USER=payroll_app
MYSQL_PASSWORD=Payroll@SecurePass123
MYSQL_DATABASE=payroll_db
```

### Find the DB server's IP
```bash
# macOS / Linux
ifconfig | grep "inet "
# or
hostname -I

# Windows
ipconfig
```

---

## 6. Test Connection

```bash
# From any client device:
mysql -h 192.168.1.100 -u payroll_app -p payroll_db -e "SELECT 1;"
```

If this works, the Next.js app will also connect successfully.

---

## Architecture Diagram

```
┌──────────────────────────────────────┐
│         DB SERVER (Device 1)         │
│                                      │
│   MySQL 8.x  ←  bind 0.0.0.0:3306   │
│   ┌──────────────────────────────┐   │
│   │       payroll_db             │   │
│   │  (all tables, all data)      │   │
│   └──────────────────────────────┘   │
│   User: payroll_app@'%'             │
│                                      │
│   Can ALSO run the Next.js app       │
│   (.env: MYSQL_HOST=127.0.0.1)       │
└──────────────────────────────────────┘
          │  Port 3306 (LAN)
          │
    ┌─────┴─────┐
    │           │
┌───▼───┐  ┌───▼───┐
│Dev 2  │  │Dev 3  │
│Next.js│  │Next.js│
│App    │  │App    │
│.env:  │  │.env:  │
│HOST=  │  │HOST=  │
│192.168│  │192.168│
│.1.100 │  │.1.100 │
└───────┘  └───────┘
```

---

## Default Login Credentials

| Email | Password | Role |
|-------|----------|------|
| `admin@payroll.local` | `Admin@123` | Super Admin |

> **Change the password immediately after first login** by updating the `users` table:
> ```bash
> node -e "require('bcryptjs').hash('YourNewPassword', 12).then(h => console.log(h))"
> # Then:
> mysql -u root -p payroll_db -e "UPDATE users SET password='<hash>' WHERE email='admin@payroll.local';"
> ```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED` | MySQL not running, or `bind-address` not set to `0.0.0.0` |
| `ER_ACCESS_DENIED` | Wrong password in `.env.local`, or user doesn't have `@'%'` host |
| `ER_BAD_DB_ERROR` | Schema not imported yet — run `mysql -u root -p < database/schema.sql` |
| `ETIMEDOUT` | Firewall blocking port 3306, or wrong IP in `.env.local` |
