# KBB ICO Lead Availability Checker

Internal tool for KBB ICO sellers to check lead availability by zip code and reserve leads for dealers.

## Features
- Zip code availability lookup with 15/30/45-mi radius rings
- 4-card availability breakdown (Base Zip + 3 booster rings)
- Dealer list with monthly performance (Dec/Jan/Feb/Mar leads + % of target)
- **Shared reservations** via Vercel KV — all sellers see the same live state
- 14-day auto-expiry on reservations
- Update Data modal to refresh Opportunity Finder OLR, Dealer Export, Dealer List

## Setup

### 1. Install dependencies
```bash
npm install
npm install @vercel/kv
```

### 2. Deploy to Vercel

```bash
git init
git add .
git commit -m "initial"
git remote add origin https://icoalliance:YOUR_TOKEN@github.com/icoalliance/ico-availability.git
git push -u origin main
```

Then in Vercel:
1. Import `icoalliance/ico-availability`
2. Framework: Vite (auto-detected)
3. **Add KV Store**: Vercel Dashboard → Storage → Create KV Database → name it `ico-reservations` → Connect to this project
4. Deploy

### 3. Environment variables
After connecting the KV store, Vercel automatically adds these env vars:
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

No manual setup needed.

### Updating data
When you get a new Opportunity Finder OLR export, update `src/matMap.js` by running the data pipeline script. For now, update manually or use the in-app Update Data button (note: in-app updates are local to that browser session; for permanent updates, update the source files and redeploy).

## Git credentials reminder
```bash
git config user.name "icoalliance"
git config user.email "your-icoalliance-email"
git remote set-url origin https://icoalliance:YOUR_PAT@github.com/icoalliance/ico-availability.git
```
