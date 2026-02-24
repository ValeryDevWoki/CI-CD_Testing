test dev branch



# Yardena (prod/test) — Docker + CI/CD + Virtualmin reverse proxy

Цель: поднять `linuxtest3.woki.co.il` на Ubuntu 24.04 так, чтобы:
- **Virtualmin/Nginx** принимает домен (80/443) и проксирует на **локальный** порт `127.0.0.1:3003`
- В Docker Compose крутятся:
  - `frontend` (Nginx + статик React) — слушает **внутри** контейнера 80, на хосте **только** `127.0.0.1:3003`
  - `backend` (Node/Express) — на хосте **только** `127.0.0.1:3001`
  - `db` (Postgres) — **без** публикации порта на хост
- CI/CD: `push` в `main` → GitHub Actions → SSH на сервер → `docker compose up -d --build`

---

## Архитектура

Интернет → Cloudflare → **Virtualmin Nginx** → `http://127.0.0.1:3003` → контейнер `frontend`  
`frontend` (Nginx) проксирует `/api/*` → контейнер `backend:3001` → контейнер `db:5432`

Почему так:
- наружу открыт только Nginx Virtualmin (80/443)
- контейнеры доступны с хоста только через `127.0.0.1`
- БД вообще не торчит наружу

---

## 1) Что положить в GitHub

Коммитим всё **кроме секретов**. В репо должны быть:
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `deploy/docker-compose.prod.yml`
- `deploy/backend.env.example`
- `deploy/restore_dump.sh`
- `.github/workflows/deploy.yml`
- `.gitignore`

> Важно: реальные `.env` (с паролями/токенами) **не коммитить**.

---

## 2) Что сделать на сервере (один раз)

### 2.1 Папки
```bash
sudo mkdir -p /opt/apps/yardena
sudo chown -R $USER:$USER /opt/apps/yardena

sudo mkdir -p /srv/backups/dumps
sudo chown -R $USER:$USER /srv/backups
```

### 2.2 Docker / Compose
Убедись что:
```bash
docker version
docker compose version
```
и пользователь в группе `docker`:
```bash
groups | grep docker || sudo usermod -aG docker $USER
```
(после этого перелогинься в ssh)

### 2.3 Клонирование
```bash
git clone git@github.com:<OWNER>/<REPO>.git /opt/apps/yardena
cd /opt/apps/yardena
```

### 2.4 Runtime env для backend (НА СЕРВЕРЕ)
```bash
cd /opt/apps/yardena/deploy
cp backend.env.example backend.env
nano backend.env
```

---

## 3) Postgres в Docker и восстановление dump

1) Убедись, что dump лежит тут:
`/srv/backups/dumps/backup_20260112_151239.dump`

2) Подними только БД:
```bash
cd /opt/apps/yardena/deploy
docker compose -f docker-compose.prod.yml up -d db
```

3) Восстанови dump:
```bash
./restore_dump.sh docker-compose.prod.yml /srv/backups/dumps/backup_20260112_151239.dump
```

Если увидишь `pg_restore: unsupported version ...`:
- значит dump сделан **более новым** `pg_dump`, чем версия Postgres в контейнере.
- Решение: поднять версию `postgres:<X>` в `docker-compose.prod.yml` до той же или новее.

---

## 4) Поднять всё приложение
```bash
cd /opt/apps/yardena/deploy
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Проверка:
```bash
curl -I http://127.0.0.1:3003/
curl -I http://127.0.0.1:3003/api/health || true
```

---

## 5) Virtualmin / Nginx reverse proxy

В Virtualmin для домена `linuxtest3.woki.co.il`:

**Вариант A (проще):** Nginx proxy pass на порт фронта  
- Nginx website enabled
- Добавь прокси на `/` → `http://127.0.0.1:3003`

**Важно:** порт указываем **локальный** `127.0.0.1`, не публичный IP.

---

## 6) CI/CD (GitHub Actions)

### 6.1 Secrets в GitHub
В репозитории: **Settings → Secrets and variables → Actions → New repository secret**
- `SSH_HOST` = `185.60.170.48`
- `SSH_USER` = твой юзер на сервере (например `woki1`)
- `SSH_KEY` = приватный ключ (deploy key или ключ пользователя)
- (опционально) `SSH_PORT` = `22`

Важно для приватного репо:
- добавь **deploy key** (public key) в GitHub repo → Settings → Deploy keys → **Allow read access**.

После этого: `push` в `main` → деплой.



preview test for bla bla bla


