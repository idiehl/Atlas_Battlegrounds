# Atlas Battlegrounds Droplet Deploy

This app runs as a single Node server that serves both the API and static files.

## Requirements

- Ubuntu/Debian droplet
- nginx
- `curl` and `xz-utils`
- A DNS `A` record for `atlasbattlegrounds.com` pointed at the droplet IP

`node:sqlite` was added in Node 22.5.0 and no longer needs the experimental CLI flag in Node 22.13.0+, so use a current Node 22 LTS release or newer.

## Server layout

- App code: `/opt/atlas-battlegrounds/current`
- Env file: `/etc/atlas-battlegrounds/atlas-battlegrounds.env`
- Persistent SQLite data: `/var/lib/atlas-battlegrounds`
- systemd unit: `/etc/systemd/system/atlas-battlegrounds.service`
- nginx site config: `/etc/nginx/sites-available/atlasbattlegrounds.conf`

## 1. Install runtime packages

```bash
sudo apt update
sudo apt install -y nginx curl xz-utils
```

## 2. Install an app-local Node 22 runtime

This avoids changing the system Node version that other sites on the droplet may already use.

```bash
cd /opt
sudo mkdir -p atlas-battlegrounds
cd /opt/atlas-battlegrounds
sudo curl -fsSLO https://nodejs.org/dist/v22.22.1/node-v22.22.1-linux-x64.tar.xz
sudo tar -xJf node-v22.22.1-linux-x64.tar.xz
sudo ln -sfn /opt/atlas-battlegrounds/node-v22.22.1-linux-x64 /opt/atlas-battlegrounds/node
/opt/atlas-battlegrounds/node/bin/node -v
```

## 3. Create the app user and directories

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin atlasbg
sudo mkdir -p /opt/atlas-battlegrounds/current
sudo mkdir -p /etc/atlas-battlegrounds
sudo mkdir -p /var/lib/atlas-battlegrounds
sudo chown -R atlasbg:atlasbg /opt/atlas-battlegrounds /var/lib/atlas-battlegrounds
sudo chmod 750 /var/lib/atlas-battlegrounds
```

## 4. Copy the app to the droplet

Sync this repo into `/opt/atlas-battlegrounds/current`.

```bash
sudo rsync -av --delete /path/to/local/Atlas_Battlegrounds/ /opt/atlas-battlegrounds/current/
sudo chown -R atlasbg:atlasbg /opt/atlas-battlegrounds/current
```

## 5. Create the environment file

Start from `.env.example` and place the real values in `/etc/atlas-battlegrounds/atlas-battlegrounds.env`.

Example:

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=4173
ATLAS_STORAGE_DIR=/var/lib/atlas-battlegrounds
ATLAS_SECURE_COOKIES=true
ATLAS_ADMIN_USERNAME=atlas_admin
ATLAS_ADMIN_EMAIL=admin@atlasbattlegrounds.com
ATLAS_ADMIN_DISPLAY_NAME=Atlas Admin
ATLAS_ADMIN_PASSWORD=replace-this-with-a-strong-password
```

## 6. Install and start the service

```bash
sudo cp /opt/atlas-battlegrounds/current/deploy/systemd/atlas-battlegrounds.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now atlas-battlegrounds
sudo systemctl status atlas-battlegrounds
```

## 7. Install nginx site config

```bash
sudo cp /opt/atlas-battlegrounds/current/deploy/nginx/atlasbattlegrounds.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/atlasbattlegrounds.conf /etc/nginx/sites-enabled/atlasbattlegrounds.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Add TLS

After DNS has propagated, install Certbot and issue the certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d atlasbattlegrounds.com -d www.atlasbattlegrounds.com
```

## 9. DNS

At your registrar, point these records at the droplet IP:

- `A` record for `atlasbattlegrounds.com`
- `A` record for `www.atlasbattlegrounds.com`

## 10. Smoke checks

```bash
curl -I http://127.0.0.1:4173
curl -I http://atlasbattlegrounds.com
sudo journalctl -u atlas-battlegrounds -n 100 --no-pager
```

## Notes

- The SQLite database is stored outside the repo so deploys do not wipe user data.
- Secure cookies are controlled by `ATLAS_SECURE_COOKIES=true`, which should stay enabled once HTTPS is live.
- `ads.txt.example` should be copied to `ads.txt` when AdSense is configured.

## GitHub Actions deploys

Once the initial droplet bootstrap is complete, pushes to `master` can deploy automatically through GitHub Actions using `.github/workflows/deploy.yml`.

Required repository configuration:

- Repository variable `ATLAS_DEPLOY_HOST`
- Repository variable `ATLAS_DEPLOY_USER`
- Repository secret `ATLAS_DEPLOY_SSH_KEY`

The workflow assumes:

- Atlas already has a working systemd service on the droplet
- nginx/TLS are already configured on the droplet
- releases are stored under `/opt/atlas-battlegrounds/releases`

The deploy job uploads the tracked repo contents, switches the `current` symlink, restarts `atlas-battlegrounds`, and runs a health check against `http://127.0.0.1:4173/api/session`.
