# Yardena (test CI/CD + Docker) — инструкция

Цель: поднять тестовую среду для `linuxtest3.woki.co.il`:
- Frontend (React) в контейнере (порт хоста `3003`)
- Backend (Node/Express) в контейнере (порт хоста `3001`)
- Postgres в контейнере + volume
- Virtualmin/Nginx проксирует домен на `http://127.0.0.1:3003`
- CI/CD: push в `main` → сервер делает `git pull` + `docker compose up -d --build`

## 0) Структура
- `backend/` — Node backend
- `frontend/` — React frontend (CRA)
- `deploy/` — docker-compose + env + restore script
- `.github/workflows/deploy.yml` — GitHub Actions deploy

## 1) Локально: создать GitHub репозиторий и залить код
1. GitHub → New repository (Private)
2. Распакуй архив проекта
3. В папке проекта:
   ```bash
   git init
   git add .
   git commit -m "init: docker + cicd"
   git branch -M main
   git remote add origin <REPO_URL>
   git push -u origin main
   ```

## 2) На сервере: подготовка папок
```bash
sudo mkdir -p /opt/apps/yardena
sudo chown -R woki1:woki1 /opt/apps
sudo mkdir -p /srv/backups/dumps
sudo chown -R woki1:woki1 /srv/backups
```

## 3) На сервере: клонирование проекта
```bash
cd /opt/apps/yardena
git clone <REPO_URL> .
```

## 4) На сервере: создать `deploy/backend.env`
```bash
cd /opt/apps/yardena/deploy
cp backend.env.example backend.env
nano backend.env
```
Минимум поменяй:
- `FRONTEND_URL=https://linuxtest3.woki.co.il`
- `SESSION_SECRET=...` (длинная случайная строка)

## 5) Восстановить дамп в Postgres контейнер (тест)
Дамп уже у тебя лежит в `/srv/backups/dumps/*.dump`.

```bash
cd /opt/apps/yardena/deploy
./restore_dump.sh docker-compose.prod.yml /srv/backups/dumps/backup_20260112_151239.dump
```

## 6) Поднять контейнеры
```bash
cd /opt/apps/yardena/deploy
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Проверка:
```bash
curl -I http://127.0.0.1:3003
```

## 7) Virtualmin / Nginx: проксировать домен на контейнер
В Virtualmin:
- Выбери `linuxtest3.woki.co.il`
- Web Configuration → (Nginx) Edit Nginx directives / Configure Nginx website
- Добавь внутри `server { ... }`:

```nginx
location / {
  proxy_pass http://127.0.0.1:3003;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Сохрани и нажми Apply Changes / Reload Nginx.

## 8) Включить CI/CD (GitHub Actions → SSH)
### 8.1 Сгенерировать ключ для GitHub Actions (на ПК)
PowerShell:
```powershell
ssh-keygen -t ed25519 -C "github-actions-yardena" -f $env:USERPROFILE\.ssh\yardena_github_actions -N ""
```

### 8.2 Добавить public key на сервер
На сервере:
```bash
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
```
Вставь содержимое `yardena_github_actions.pub`.

Права:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 8.3 Добавить Secrets в GitHub
Repo → Settings → Secrets and variables → Actions → New repository secret:
- `SSH_HOST` = `185.60.170.48`
- `SSH_USER` = `woki1`
- `SSH_KEY` = содержимое приватного ключа `yardena_github_actions` (не .pub)

После этого: любой `git push` в `main` будет деплоить.

## Примечание про Cloudflare
SSH по `admin.woki.co.il` у тебя не работает, потому что домен проксируется Cloudflare.
Для scp/ssh используй прямой IP сервера: `185.60.170.48`.
