# VPS Setup Guide for Autonomous Testing

## Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| vCPUs | 4 | 4+ |
| RAM | 32GB | **64GB** |
| Storage | 50GB SSD | 100GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

## Quick Start (5 minutes)

### Step 1: SSH into VPS
```bash
ssh root@your-vps-ip
```

### Step 2: Run Setup Script
```bash
curl -fsSL https://raw.githubusercontent.com/atdevag001/as-finance/main/infrastructure/vps-testing/setup-vps.sh | bash
```

### Step 3: Start Testing
```bash
cd /opt/as-finance
docker compose -f infrastructure/vps-testing/docker-compose.testing.yml up -d
docker exec -it asf-test-runner ./scripts/autonomous-test-loop.sh
```

---

## Manual Setup

### 1. System Preparation

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# Install Docker Compose
apt install -y docker-compose-plugin

# Install useful tools
apt install -y git curl jq htop

# Configure system limits for high-memory workloads
cat >> /etc/sysctl.conf << EOF
# Increase for high-memory applications
vm.max_map_count=262144
vm.swappiness=10
net.core.somaxconn=65535
EOF
sysctl -p
```

### 2. Clone Repository

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/atdevag001/as-finance.git
cd as-finance
```

### 3. Configure Environment

```bash
cd infrastructure/vps-testing

# Create environment file
cat > .env << EOF
# Testing environment
NODE_ENV=test

# Database
POSTGRES_USER=asfinance
POSTGRES_PASSWORD=asfinance_test
POSTGRES_DB=asfinance_lms

# API
JWT_SECRET=your-secure-jwt-secret-minimum-32-chars
JWT_EXPIRY=15m

# Playwright
PLAYWRIGHT_WORKERS=16

# Optional: Claude Code API key for autonomous fixes
ANTHROPIC_API_KEY=your-api-key-here
EOF
```

### 4. Build and Start Services

```bash
# Build all images (takes ~5-10 minutes)
docker compose -f docker-compose.testing.yml build

# Start services
docker compose -f docker-compose.testing.yml up -d

# Check status
docker compose -f docker-compose.testing.yml ps

# View logs
docker compose -f docker-compose.testing.yml logs -f
```

### 5. Initialize Database

```bash
# Run migrations
docker exec asf-test-api npx prisma migrate deploy

# Seed test data
docker exec asf-test-api npx prisma db seed
```

### 6. Verify Setup

```bash
# Check API health
curl http://localhost:3001/health/live

# Check Web health
curl http://localhost:3000

# Check database
docker exec asf-test-db psql -U asfinance -d asfinance_lms -c "SELECT 1"
```

---

## Running Tests

### Full Autonomous Cycle
```bash
docker exec -it asf-test-runner ./scripts/autonomous-test-loop.sh --continuous
```

### Single Test Run
```bash
docker exec -it asf-test-runner ./scripts/autonomous-test-loop.sh
```

### Specific Module
```bash
docker exec -it asf-test-runner ./scripts/autonomous-test-loop.sh --module loans
```

### Flakiness Detection
```bash
docker exec -it asf-test-runner ./scripts/autonomous-test-loop.sh --flakiness 5
```

### Manual Playwright Commands
```bash
# Enter test runner container
docker exec -it asf-test-runner bash

# Inside container:
cd /app/apps/web/test

# List all tests
npx playwright test --list

# Run specific test
npx playwright test loans.playwright.spec.ts --workers=16

# Run with UI (requires X11 forwarding)
npx playwright test --ui
```

---

## Performance Tuning

### Memory Allocation (64GB RAM)

| Service | Memory | Purpose |
|---------|--------|---------|
| PostgreSQL | 8GB | Shared buffers, caching |
| Redis | 2GB | Rate limiting cache |
| API | 2GB | NestJS server |
| Web | 2GB | Next.js dev server |
| Test Runner | 32GB | **16 parallel browsers** |
| OS Buffer | 18GB | System overhead |

### Playwright Workers

With 64GB RAM, you can run **16 parallel browser instances**:

```bash
# Set in environment
export PLAYWRIGHT_WORKERS=16

# Or in playwright.config.ts
workers: process.env.PLAYWRIGHT_WORKERS || 16
```

### PostgreSQL Tuning

The docker-compose already includes optimized settings:
- `shared_buffers=4GB`
- `effective_cache_size=16GB`
- `work_mem=64MB`
- `max_parallel_workers=4`

---

## Monitoring

### Enable Monitoring Stack
```bash
docker compose -f docker-compose.testing.yml --profile monitoring up -d
```

Access:
- Grafana: http://your-vps-ip:3030 (admin/admin)
- Prometheus: http://your-vps-ip:9090

### Resource Monitoring
```bash
# Real-time container stats
docker stats

# System resources
htop

# Disk usage
df -h
```

---

## Maintenance

### View Logs
```bash
# All services
docker compose -f docker-compose.testing.yml logs -f

# Specific service
docker compose -f docker-compose.testing.yml logs -f test-runner
```

### Restart Services
```bash
docker compose -f docker-compose.testing.yml restart
```

### Clean Up
```bash
# Stop all services
docker compose -f docker-compose.testing.yml down

# Remove volumes (WARNING: deletes data)
docker compose -f docker-compose.testing.yml down -v

# Remove images
docker compose -f docker-compose.testing.yml down --rmi all
```

### Update Code
```bash
cd /opt/as-finance
git pull origin main

# Rebuild containers
docker compose -f infrastructure/vps-testing/docker-compose.testing.yml build
docker compose -f infrastructure/vps-testing/docker-compose.testing.yml up -d
```

---

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs asf-test-runner

# Check resource limits
docker stats --no-stream
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker exec asf-test-db pg_isready

# Check logs
docker logs asf-test-db
```

### Out of Memory
```bash
# Check memory usage
free -h

# Reduce workers
export PLAYWRIGHT_WORKERS=8
```

### Tests Timeout
```bash
# Increase timeout in playwright.config.ts
timeout: 120_000 // 2 minutes

# Or per-test
test.setTimeout(120_000);
```

---

## Security Notes

1. **Firewall**: Only expose ports 22 (SSH), 3000 (Web), 3001 (API) if needed externally
2. **API Keys**: Store `ANTHROPIC_API_KEY` securely, don't commit to git
3. **Database**: Use strong passwords in production
4. **Updates**: Regularly update system and Docker images

```bash
# Basic firewall setup
ufw allow 22
ufw allow 3000
ufw allow 3001
ufw enable
```

---

## Cost Estimate

### Cloud Provider Pricing (approximate)

| Provider | Instance | Price/Month |
|----------|----------|-------------|
| DigitalOcean | s-4vcpu-64gb-intel | ~$504/mo |
| Linode | Dedicated 64GB | ~$480/mo |
| Vultr | 64GB RAM | ~$480/mo |
| Hetzner | CPX51 | ~$100/mo (best value) |
| AWS | r6i.xlarge | ~$200/mo (spot) |

**Recommendation**: Hetzner CPX51 or spot instances for testing
