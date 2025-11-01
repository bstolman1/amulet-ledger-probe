# ACS Snapshot System - Complete Setup Guide

## Overview

This system automatically captures ACS (Active Contract Set) snapshots from Canton Network every 3 hours using GitHub Actions and stores the results in your Supabase database.

## Architecture

```
┌─────────────────┐     Bidirectional      ┌──────────────┐
│     Lovable     │◄────────Sync───────────►│    GitHub    │
│   (Development) │                         │ (Code Repo)  │
└─────────────────┘                         └───────┬──────┘
                                                    │
                                                    │ Triggers
                                                    │ (Every 3h)
                                                    ▼
                                            ┌───────────────┐
                                            │GitHub Actions │
                                            │  Workflow     │
                                            └───────┬───────┘
                                                    │
                                            ┌───────▼───────┐
                                            │ Self-Hosted   │
                                            │    Runner     │
                                            │(Whitelisted IP)│
                                            └───────┬───────┘
                                                    │
                            ┌───────────────────────┼───────────────────────┐
                            │                       │                       │
                    ┌───────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
                    │ snapshot-script│    │   Canton API    │    │upload-to-       │
                    │      .js       │───►│  (Fetch ACS)    │    │  supabase.js    │
                    └────────────────┘    └─────────────────┘    └────────┬────────┘
                            │                                              │
                            │ Generates                                    │ POSTs
                            ▼                                              ▼
                    ┌────────────────┐                           ┌─────────────────┐
                    │  JSON Files:   │                           │  Supabase Edge  │
                    │  - Summary     │                           │    Function     │
                    │  - Templates   │                           │(upload-acs-     │
                    │  - Full Data   │                           │  snapshot)      │
                    └────────────────┘                           └────────┬────────┘
                                                                          │
                                                                          │ Stores
                                                                          ▼
                                                        ┌─────────────────────────────┐
                                                        │      Supabase Cloud         │
                                                        ├─────────────────────────────┤
                                                        │ • acs_snapshots (table)     │
                                                        │ • acs_template_stats (table)│
                                                        │ • snapshot_logs (table)     │
                                                        │ • acs-data (storage bucket) │
                                                        └─────────────────────────────┘
```

## Components

### 1. **snapshot-script.js**
- Fetches ACS data from Canton Network API
- Uses BigNumber for precise decimal calculations
- Generates 3 types of output:
  - `circulating-supply-single-sv.json` - Overall summary
  - `circulating-supply-single-sv.templates.json` - Per-template aggregates
  - `./acs_full/*.json` - Full contract data per template (~117 files)

### 2. **upload-to-supabase.js**
- Reads the generated JSON files
- Combines them into a single payload
- POSTs to Supabase edge function
- Handles large payloads (5 minute timeout)

### 3. **GitHub Actions Workflow** (`.github/workflows/acs-snapshot.yml`)
- Runs on schedule: `0 0,3,6,9,12,15,18,21 * * *` (every 3 hours)
- Can be triggered manually
- Executes on self-hosted runner
- Archives artifacts for 30 days

### 4. **Supabase Edge Function** (`upload-acs-snapshot`)
- Receives snapshot payload
- Creates snapshot record in database
- Uploads template JSON files to storage
- Inserts template statistics
- Logs progress for real-time monitoring

### 5. **Lovable UI** (Snapshots Page)
- Displays snapshot history
- Shows real-time logs via Supabase Realtime
- Provides GitHub Actions integration info

## Quick Start

### Step 1: Connect to GitHub

1. Open your Lovable project
2. Click **GitHub** → **Connect to GitHub**
3. Authorize and create repository
4. ✅ Your code is now synced!

### Step 2: Set Up Self-Hosted Runner

On your machine/server with whitelisted IP:

```bash
# Navigate to GitHub repo → Settings → Actions → Runners → New self-hosted runner
# GitHub will provide specific download commands, then:

mkdir actions-runner && cd actions-runner
# Download and extract runner (use commands from GitHub)

# Configure
./config.sh --url https://github.com/YOUR_USERNAME/YOUR_REPO --token YOUR_TOKEN

# Install as service (recommended)
sudo ./svc.sh install
sudo ./svc.sh start

# Verify it's running
./svc.sh status
```

### Step 3: Add GitHub Secrets

In GitHub repo → Settings → Secrets and variables → Actions:

```
SUPABASE_URL: https://mbbjmxubfeaudnhxmwqf.supabase.co
SUPABASE_ANON_KEY: eyJhbGc... (your anon key)
```

### Step 4: Test It!

1. Go to GitHub → Actions tab
2. Click **ACS Snapshot** workflow
3. Click **Run workflow**
4. Monitor the logs
5. Check Snapshots page in Lovable to see results

## Scheduled Execution

The workflow runs automatically at:
- 00:00 UTC (midnight)
- 03:00 UTC
- 06:00 UTC
- 09:00 UTC
- 12:00 UTC
- 15:00 UTC
- 18:00 UTC
- 21:00 UTC

## Data Flow

1. **Trigger**: GitHub Actions CRON or manual dispatch
2. **Fetch**: `snapshot-script.js` fetches from Canton API
3. **Generate**: Creates JSON files locally on runner
4. **Upload**: `upload-to-supabase.js` POSTs to edge function
5. **Process**: Edge function stores in database + storage
6. **Display**: Lovable UI shows snapshot + real-time logs

## Database Schema

### `acs_snapshots`
```sql
- id (uuid, primary key)
- timestamp (timestamptz)
- migration_id (integer)
- record_time (text)
- sv_url (text)
- canonical_package (text)
- amulet_total (numeric)
- locked_total (numeric)
- circulating_supply (numeric)
- entry_count (integer)
- status (text: 'processing' | 'completed' | 'failed')
- error_message (text)
- created_at, updated_at (timestamptz)
```

### `acs_template_stats`
```sql
- id (uuid, primary key)
- snapshot_id (uuid, foreign key)
- template_id (text)
- contract_count (integer)
- field_sums (jsonb) - aggregated numeric fields
- status_tallies (jsonb) - status counts
- storage_path (text) - path to full JSON in storage
- created_at (timestamptz)
```

### `snapshot_logs`
```sql
- id (uuid, primary key)
- snapshot_id (uuid, foreign key)
- log_level (text: 'info' | 'success' | 'error')
- message (text)
- metadata (jsonb)
- created_at (timestamptz)
```

### Storage: `acs-data` bucket
```
<snapshot_id>/
  ├── template1.json
  ├── template2.json
  └── ... (~117 files)
```

## Troubleshooting

### Runner Not Executing
```bash
# Check runner status
./svc.sh status

# Restart runner
sudo ./svc.sh stop
sudo ./svc.sh start

# Check runner logs
journalctl -u actions.runner.*
```

### Canton API Not Accessible
- Verify IP is still whitelisted
- Test manually: `curl https://scan.sv-1.global.canton.network.sync.global/api/scan/v0/state/acs/snapshot-timestamp`
- Check network/firewall settings

### Snapshot Script Fails
```bash
# Test locally on runner machine
cd /path/to/repo
node snapshot-script.js

# Check for missing dependencies
npm install axios bignumber.js
```

### Upload Fails
```bash
# Test upload manually
SUPABASE_URL=... SUPABASE_ANON_KEY=... node upload-to-supabase.js

# Check Supabase edge function logs in Lovable
# Navigate to Cloud Backend → Functions → upload-acs-snapshot
```

### GitHub Secrets Not Working
- Verify secret names match exactly: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Re-add secrets if needed
- Check workflow file uses `${{ secrets.SECRET_NAME }}`

## Manual Execution

You can run snapshots manually anytime:

### From GitHub UI
1. Go to Actions tab
2. Select "ACS Snapshot" workflow
3. Click "Run workflow"

### From Runner Machine
```bash
cd /path/to/repo
node snapshot-script.js
node upload-to-supabase.js
```

### From Local Machine
```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Install dependencies
npm install axios bignumber.js

# Run snapshot (if you have whitelisted IP)
node snapshot-script.js

# Upload to Supabase
SUPABASE_URL=... SUPABASE_ANON_KEY=... node upload-to-supabase.js
```

## Development Workflow

1. **Make changes in Lovable** → Auto-syncs to GitHub
2. **GitHub Actions runs** → Uses latest code from GitHub
3. **Results populate database** → Visible in Lovable UI

You can develop freely in Lovable while snapshots run automatically!

## Cost Breakdown

- **Self-hosted runner**: Free (you provide compute)
- **GitHub Actions minutes**: Free for public repos, 2000 min/month for private
- **Supabase database**: Free tier includes 500 MB storage
- **Supabase storage**: Free tier includes 1 GB
- **GitHub artifact storage**: Free for public repos

Estimated monthly data:
- ~4 snapshots/day × 30 days = 120 snapshots
- ~117 files × 120 snapshots = ~14,040 files
- Average file size ~10 KB = ~140 MB total

✅ Comfortably within free tiers!

## Alternative Setups

### Option A: GitHub-Hosted Runner + Proxy
```yaml
runs-on: ubuntu-latest # Instead of self-hosted
```
- Use static IP proxy service (Quotaguard, Fixie, etc.)
- Configure proxy in `snapshot-script.js`
- No self-hosted runner maintenance

### Option B: VM with Static IP + Direct CRON
- Deploy runner on AWS EC2, DigitalOcean, etc.
- Set up system CRON instead of GitHub Actions
- More control, but requires VM management

### Option C: Keep Running Locally
- Run `snapshot-script.js` on your local machine
- Use CRON/Task Scheduler for automation
- Manual or automated `upload-to-supabase.js` execution

## Security Considerations

- ✅ Supabase keys stored as GitHub secrets (encrypted)
- ✅ RLS policies protect data access
- ✅ Edge functions validate uploads
- ✅ Self-hosted runner isolated on whitelisted machine
- ✅ No API keys committed to code

## Monitoring

### Real-Time Logs
- View in Lovable → Snapshots page
- Logs stream via Supabase Realtime
- Shows progress during 15-minute execution

### GitHub Actions Logs
- Detailed execution logs per run
- Download logs for debugging
- View timing and resource usage

### Supabase Logs
- Edge function execution logs
- Database operation logs
- Storage upload logs

## Support

- **Lovable**: Discord community, docs.lovable.dev
- **GitHub Actions**: docs.github.com/actions
- **Supabase**: supabase.com/docs
- **Canton Network**: Check with your network administrator

## Next Steps

After setup:
1. ✅ Wait for first scheduled run (or trigger manually)
2. ✅ Verify snapshot appears in Lovable UI
3. ✅ Check logs for any issues
4. ✅ Monitor GitHub Actions for successful runs
5. ✅ Continue developing in Lovable as normal!

## Files Reference

- `.github/workflows/acs-snapshot.yml` - GitHub Actions workflow
- `snapshot-script.js` - Main ACS fetching script
- `upload-to-supabase.js` - Supabase upload script
- `GITHUB_ACTIONS_SETUP.md` - Detailed setup instructions
- `README_SNAPSHOT_SETUP.md` - This file
- `supabase/functions/upload-acs-snapshot/index.ts` - Edge function
- `src/pages/Snapshots.tsx` - Lovable UI page
