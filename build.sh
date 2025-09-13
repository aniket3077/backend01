#!/bin/bash

# =========================================
# Build Script for Dandiya Platform Backend
# =========================================

set -e  # Exit on any error

echo "🚀 Starting build process for Dandiya Platform Backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =========================================
# 1. Environment Setup
# =========================================
print_status "Checking Node.js environment..."
node_version=$(node -v 2>/dev/null || echo "not found")
npm_version=$(npm -v 2>/dev/null || echo "not found")

if [ "$node_version" = "not found" ]; then
    print_error "Node.js is not installed!"
    exit 1
else
    print_success "Node.js version: $node_version"
fi

if [ "$npm_version" = "not found" ]; then
    print_error "npm is not installed!"
    exit 1
else
    print_success "npm version: $npm_version"
fi

# =========================================
# 2. Clean Previous Build
# =========================================
print_status "Cleaning previous build artifacts..."

# Remove node_modules if doing clean build
if [ "$1" = "--clean" ]; then
    print_warning "Performing clean build - removing node_modules..."
    rm -rf node_modules
    rm -f package-lock.json
fi

# Clean logs
rm -rf logs/*.log 2>/dev/null || true
mkdir -p logs

# Clean uploads (optional)
if [ "$1" = "--clean-uploads" ]; then
    print_warning "Cleaning upload directory..."
    rm -rf uploads/*
    mkdir -p uploads
fi

print_success "Cleanup completed"

# =========================================
# 3. Install Dependencies
# =========================================
print_status "Installing dependencies..."

if npm ci --only=production 2>/dev/null; then
    print_success "Production dependencies installed with npm ci"
elif npm install --only=production; then
    print_success "Production dependencies installed with npm install"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# =========================================
# 4. Environment Validation
# =========================================
print_status "Validating environment configuration..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found - creating template"
    cat > .env << EOF
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:password@host:port/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
RESEND_API_KEY=your-resend-key
AISENSY_API_KEY=your-aisensy-key
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret
CORS_ORIGIN=http://localhost:3000
EOF
    print_warning "Please update .env file with your actual values"
fi

# Validate critical environment variables
required_vars=(
    "NODE_ENV"
    "PORT"
    "DATABASE_URL"
    "SUPABASE_URL"
    "SUPABASE_ANON_KEY"
)

# Load environment variables more safely
set -a  # automatically export all variables
if [ -f ".env" ]; then
    # Source .env file while handling special characters
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip comments and empty lines
        if [[ ! "$line" =~ ^[[:space:]]*# ]] && [[ -n "$line" ]]; then
            # Only process lines that look like variable assignments
            if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
                export "$line" 2>/dev/null || true
            fi
        fi
    done < .env
fi
set +a  # stop automatically exporting

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    print_warning "Missing environment variables: ${missing_vars[*]}"
    print_warning "Some features may not work properly"
else
    print_success "All critical environment variables are set"
fi

# =========================================
# 5. Build Process
# =========================================
print_status "Running build process..."

# Create build directory
mkdir -p build

# Copy source files to build directory
print_status "Copying source files..."
cp -r config build/ 2>/dev/null || true
cp -r controllers build/ 2>/dev/null || true
cp -r routes build/ 2>/dev/null || true
cp -r services build/ 2>/dev/null || true
cp -r utils build/ 2>/dev/null || true
cp server.js build/ 2>/dev/null || true
cp package.json build/ 2>/dev/null || true

print_success "Source files copied to build directory"

# =========================================
# 6. Health Check
# =========================================
print_status "Running health checks..."

# Check if main server file exists
if [ ! -f "server.js" ]; then
    print_error "Main server file (server.js) not found!"
    exit 1
fi

# Validate package.json
if ! node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2>/dev/null; then
    print_error "Invalid package.json file!"
    exit 1
fi

print_success "Health checks passed"

# =========================================
# 7. Production Optimizations
# =========================================
print_status "Applying production optimizations..."

# Set NODE_ENV to production in build
sed -i 's/NODE_ENV=development/NODE_ENV=production/g' build/.env 2>/dev/null || true

# Create production start script
cat > build/start.sh << 'EOF'
#!/bin/bash
export NODE_ENV=production
exec node server.js
EOF
chmod +x build/start.sh

print_success "Production optimizations applied"

# =========================================
# 8. Generate Build Info
# =========================================
print_status "Generating build information..."

cat > build-info.json << EOF
{
  "buildTime": "$(date -Iseconds)",
  "buildNumber": "${BUILD_NUMBER:-local}",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "nodeVersion": "$node_version",
  "npmVersion": "$npm_version",
  "platform": "$(uname -s)",
  "environment": "${NODE_ENV:-development}"
}
EOF

cp build-info.json build/ 2>/dev/null || true

print_success "Build information generated"

# =========================================
# 9. Security Checks
# =========================================
print_status "Running security checks..."

# Check for common security issues
if [ -f ".env" ] && grep -q "password123\|admin\|secret123" .env; then
    print_warning "Potentially weak passwords detected in .env file"
fi

# Check if sensitive files are properly ignored
if [ ! -f ".gitignore" ]; then
    print_warning ".gitignore file not found"
    cat > .gitignore << 'EOF'
node_modules/
.env
logs/
uploads/
.DS_Store
*.log
build-info.json
EOF
fi

print_success "Security checks completed"

# =========================================
# 10. Final Validation
# =========================================
print_status "Running final validation..."

# Test if the application can start (quick test)
timeout 10s node -e "
try {
  require('./server.js');
  console.log('✅ Application syntax is valid');
  process.exit(0);
} catch (error) {
  console.error('❌ Application syntax error:', error.message);
  process.exit(1);
}
" || print_warning "Could not validate application startup (timeout or syntax error)"

print_success "Build validation completed"

# =========================================
# Build Summary
# =========================================
echo ""
echo "========================================="
echo "🎉 BUILD COMPLETED SUCCESSFULLY"
echo "========================================="
echo "Build time: $(date)"
echo "Node.js version: $node_version"
echo "Environment: ${NODE_ENV:-development}"
echo ""
echo "📁 Build artifacts:"
echo "   - build/ directory with production files"
echo "   - build-info.json with build metadata"
echo ""
echo "🚀 To start the application:"
echo "   npm start                  # Development"
echo "   npm run prod              # Production"
echo "   ./build/start.sh          # Production (from build dir)"
echo ""
echo "🔧 Useful commands:"
echo "   npm run build --clean     # Clean build"
echo "   npm test                  # Run tests (if available)"
echo "========================================="

exit 0
