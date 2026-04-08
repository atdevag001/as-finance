#!/bin/bash
# ============================================================================
# VPS SETUP SCRIPT
# Automated setup for AS-Finance autonomous testing environment
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/atdevag001/as-finance/main/infrastructure/vps-testing/setup-vps.sh | bash
# ============================================================================

set -e

echo "============================================"
echo "  AS-Finance VPS Testing Environment Setup"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo bash setup-vps.sh"
  exit 1
fi

# System info
echo "System Information:"
echo "  OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "  CPUs: $(nproc)"
echo "  RAM: $(free -h | awk '/^Mem:/ {print $2}')"
echo "  Disk: $(df -h / | awk 'NR==2 {print $4}') available"
echo ""

# Check minimum requirements
RAM_GB=$(free -g | awk '/^Mem:/ {print $2}')
if [ "$RAM_GB" -lt 16 ]; then
  echo "WARNING: Less than 16GB RAM detected. Performance may be limited."
fi

# ============================================================================
# STEP 1: System Updates
# ============================================================================
echo "[1/7] Updating system..."
apt update && apt upgrade -y

# ============================================================================
# STEP 2: Install Dependencies
# ============================================================================
echo "[2/7] Installing dependencies..."
apt install -y \
  curl \
  git \
  jq \
  htop \
  ca-certificates \
  gnupg \
  lsb-release

# ============================================================================
# STEP 3: Install Docker
# ============================================================================
echo "[3/7] Installing Docker..."
if command -v docker &> /dev/null; then
  echo "  Docker already installed: $(docker --version)"
else
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
  echo "  Docker installed: $(docker --version)"
fi

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# ============================================================================
# STEP 4: Configure System
# ============================================================================
echo "[4/7] Configuring system..."

# Increase limits for high-memory workloads
cat >> /etc/sysctl.conf << EOF

# AS-Finance Testing Configuration
vm.max_map_count=262144
vm.swappiness=10
net.core.somaxconn=65535
fs.file-max=2097152
EOF

sysctl -p

# Increase ulimits
cat >> /etc/security/limits.conf << EOF

# AS-Finance Testing Limits
* soft nofile 65535
* hard nofile 65535
* soft nproc 65535
* hard nproc 65535
EOF

# ============================================================================
# STEP 5: Clone Repository
# ============================================================================
echo "[5/7] Cloning repository..."
mkdir -p /opt
cd /opt

if [ -d "as-finance" ]; then
  echo "  Repository already exists, updating..."
  cd as-finance
  git pull origin main
else
  git clone https://github.com/atdevag001/as-finance.git
  cd as-finance
fi

# ============================================================================
# STEP 6: Create Environment File
# ============================================================================
echo "[6/7] Creating environment configuration..."
cd infrastructure/vps-testing

if [ ! -f ".env" ]; then
  cat > .env << EOF
# AS-Finance Testing Environment
NODE_ENV=test

# Database
POSTGRES_USER=asfinance
POSTGRES_PASSWORD=asfinance_test_$(openssl rand -hex 8)
POSTGRES_DB=asfinance_lms

# API
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRY=15m

# Playwright - 16 workers for 64GB RAM
PLAYWRIGHT_WORKERS=16

# Coverage target
COVERAGE_TARGET=95

# Optional: Anthropic API key for Claude Code agent
# ANTHROPIC_API_KEY=your-key-here
EOF
  echo "  Created .env file"
  echo "  IMPORTANT: Edit .env to add ANTHROPIC_API_KEY if using Claude agent"
else
  echo "  .env file already exists, skipping"
fi

# ============================================================================
# STEP 7: Build and Start Services
# ============================================================================
echo "[7/7] Building Docker images..."
docker compose -f docker-compose.testing.yml build

echo ""
echo "============================================"
echo "  SETUP COMPLETE!"
echo "============================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Start the testing environment:"
echo "   cd /opt/as-finance/infrastructure/vps-testing"
echo "   docker compose -f docker-compose.testing.yml up -d"
echo ""
echo "2. Wait for services to be healthy (1-2 minutes):"
echo "   docker compose -f docker-compose.testing.yml ps"
echo ""
echo "3. Run autonomous testing:"
echo "   docker exec -it asf-test-runner ./scripts/autonomous-test-loop.sh"
echo ""
echo "4. For continuous testing:"
echo "   docker exec -it asf-test-runner ./scripts/autonomous-test-loop.sh --continuous"
echo ""
echo "Configuration:"
echo "  - Workers: \$PLAYWRIGHT_WORKERS (default: 16)"
echo "  - Coverage target: \$COVERAGE_TARGET (default: 95%)"
echo ""
echo "Documentation:"
echo "  /opt/as-finance/infrastructure/vps-testing/VPS_SETUP_GUIDE.md"
echo ""
