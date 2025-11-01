# GitHub Self-Hosted Runner Setup

This guide will help you set up a self-hosted GitHub Actions runner on your machine with the whitelisted IP.

## Why Self-Hosted Runner?

The Canton API requires IP whitelisting, and GitHub's hosted runners have dynamic IPs. By running the workflow on your own machine (which is whitelisted), the snapshot script can successfully fetch data from the Canton API.

## Setup Steps

### 1. Navigate to Runner Settings

1. Go to your GitHub repository
2. Click **Settings** → **Actions** → **Runners**
3. Click **New self-hosted runner**

### 2. Choose Your Operating System

Select your operating system (Linux, macOS, or Windows) and follow the commands provided by GitHub.

### 3. Download and Configure Runner

GitHub will provide commands similar to these (example for Linux):

```bash
# Create a folder
mkdir actions-runner && cd actions-runner

# Download the latest runner package
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract the installer
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure the runner
./config.sh --url https://github.com/YOUR-USERNAME/YOUR-REPO --token YOUR-TOKEN

# Run the runner
./run.sh
```

### 4. Run as a Service (Recommended)

To keep the runner running in the background:

**Linux/macOS:**
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

**Windows:**
```powershell
./svc.sh install
./svc.sh start
```

### 5. Verify Runner is Online

1. Go back to **Settings** → **Actions** → **Runners**
2. You should see your runner with a green "Idle" status

## Update Workflow

Before the workflow runs, update line 24 in `.github/workflows/acs-snapshot.yml`:

```yaml
node your-snapshot-script.js
```

Replace `your-snapshot-script.js` with the actual name of your Canton API snapshot script.

## Testing

### Manual Test

You can manually trigger the workflow to test:

1. Go to **Actions** tab in your repository
2. Select "ACS Snapshot Scheduler" workflow
3. Click **Run workflow**

### Scheduled Runs

The workflow will automatically run every 3 hours at:
- 00:00 UTC
- 03:00 UTC
- 06:00 UTC
- 09:00 UTC
- 12:00 UTC
- 15:00 UTC
- 18:00 UTC
- 21:00 UTC

## Monitoring

### View Workflow Runs

1. Go to **Actions** tab
2. Click on any workflow run to see logs
3. Check each step for success/failure

### Check Snapshot Status

Visit your application's `/snapshots` page to see:
- Real-time logs during processing
- Completed snapshot details
- Any errors that occurred

## Troubleshooting

### Runner Not Connecting

- Check firewall settings
- Ensure the runner service is running
- Verify the token hasn't expired

### Workflow Fails on Snapshot Script

- Ensure your snapshot script is in the repository
- Check that the script path is correct in the workflow
- Verify dependencies are installed

### Upload Fails

- Check Supabase connection
- Verify the JSON files are generated correctly
- Review workflow logs for specific errors

## Security Notes

- The runner has access to repository secrets
- Only run the runner on a trusted, secure machine
- Keep the runner software updated
- Monitor workflow logs regularly
