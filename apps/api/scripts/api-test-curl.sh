#!/bin/bash

# =============================================================================
# API Test Script with cURL
# =============================================================================
# This script tests the Image Generation API endpoints using cURL.
# Requires a valid JWT token for authenticated endpoints.
# =============================================================================

# Load test variables if available
if [ -f /tmp/test-image-gen-vars.sh ]; then
    source /tmp/test-image-gen-vars.sh
fi

API_BASE="${API_BASE:-http://localhost:8002}"
ORG_ID="${ORG_ID:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Helper function for API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    local curl_args=(-s -X "$method")

    if [ -n "$AUTH_TOKEN" ]; then
        curl_args+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
    fi

    curl_args+=(-H "Content-Type: application/json")

    if [ -n "$data" ]; then
        curl_args+=(-d "$data")
    fi

    curl "${curl_args[@]}" "${API_BASE}${endpoint}"
}

# =============================================================================
# Check if API is running
# =============================================================================
log_info "Checking API health..."
if curl -s "${API_BASE}/" > /dev/null 2>&1; then
    log_success "API is running at ${API_BASE}"
else
    log_error "API is not running at ${API_BASE}"
    exit 1
fi

# =============================================================================
# Menu
# =============================================================================
echo ""
echo "=============================================="
echo "Image Generation API Test Menu"
echo "=============================================="
echo ""
echo "Prerequisites:"
echo "  1. Run test-image-generation.sh first to seed data"
echo "  2. Set AUTH_TOKEN for authenticated endpoints"
echo ""
echo "Current settings:"
echo "  API_BASE: ${API_BASE}"
echo "  ORG_ID: ${ORG_ID:-'(not set)'}"
echo "  AUTH_TOKEN: ${AUTH_TOKEN:+(set)}${AUTH_TOKEN:-(not set)}"
echo ""
echo "Available tests:"
echo "  1. List agents (requires auth)"
echo "  2. Get agent details (requires auth)"
echo "  3. List generation requests (requires auth)"
echo "  4. Get request details (requires auth)"
echo "  5. Create new generation request (requires auth)"
echo "  6. Check request status (DB direct)"
echo "  7. View generated images (DB direct)"
echo "  8. Run all public tests"
echo "  0. Exit"
echo ""

read -p "Select test (0-8): " choice

case $choice in
    1)
        log_info "Listing agents..."
        if [ -z "$AUTH_TOKEN" ]; then
            log_warn "AUTH_TOKEN not set. This will likely fail."
        fi
        api_call GET "/organization/${ORG_ID}/agents" | jq .
        ;;

    2)
        read -p "Enter Agent ID: " agent_id
        log_info "Getting agent details..."
        api_call GET "/organization/${ORG_ID}/agents/${agent_id}" | jq .
        ;;

    3)
        log_info "Listing generation requests..."
        api_call GET "/organization/${ORG_ID}/image-generation/requests" | jq .
        ;;

    4)
        read -p "Enter Request ID: " request_id
        log_info "Getting request details..."
        api_call GET "/organization/${ORG_ID}/image-generation/requests/${request_id}" | jq .
        ;;

    5)
        log_info "Creating new generation request..."

        # Get agent IDs from DB
        AGENT_IDS=$(psql -U postgres -d vml_image_generation_tools -t -c "
            SELECT array_to_json(array_agg(id))
            FROM image_generation_agents
            WHERE \"organizationId\" = '${ORG_ID}'
            LIMIT 3;
        " | tr -d ' \n')

        if [ "$AGENT_IDS" = "null" ] || [ -z "$AGENT_IDS" ]; then
            log_error "No agents found. Run test-image-generation.sh first."
            exit 1
        fi

        read -p "Enter brief description: " brief
        brief="${brief:-A professional product photo of a modern laptop on a clean desk}"

        REQUEST_DATA=$(cat <<EOF
{
    "brief": "${brief}",
    "negativePrompts": "blurry, low quality, distorted",
    "judgeIds": ${AGENT_IDS},
    "imageParams": {
        "imagesPerGeneration": 1,
        "aspectRatio": "16:9"
    },
    "threshold": 75,
    "maxIterations": 3
}
EOF
)

        echo "Request payload:"
        echo "$REQUEST_DATA" | jq .
        echo ""

        api_call POST "/organization/${ORG_ID}/image-generation/requests" "$REQUEST_DATA" | jq .
        ;;

    6)
        log_info "Checking all request statuses (direct DB)..."
        psql -U postgres -d vml_image_generation_tools -c "
            SELECT
                id,
                status,
                COALESCE(jsonb_array_length(iterations::jsonb), 0) as iterations,
                threshold,
                \"completionReason\",
                \"createdAt\"
            FROM image_generation_requests
            WHERE \"organizationId\" = '${ORG_ID}'
            ORDER BY \"createdAt\" DESC
            LIMIT 10;
        "
        ;;

    7)
        log_info "Viewing generated images (direct DB)..."
        psql -U postgres -d vml_image_generation_tools -c "
            SELECT
                i.id,
                i.\"iterationNumber\",
                r.status as request_status,
                i.\"s3Url\",
                i.\"createdAt\"
            FROM image_generation_images i
            JOIN image_generation_requests r ON r.id = i.\"requestId\"
            WHERE r.\"organizationId\" = '${ORG_ID}'
            ORDER BY i.\"createdAt\" DESC
            LIMIT 10;
        "
        ;;

    8)
        log_info "Running all DB-based tests..."
        echo ""

        echo "=== Organizations ==="
        psql -U postgres -d vml_image_generation_tools -c "
            SELECT id, name, enabled FROM organizations LIMIT 5;
        "

        echo "=== Agents ==="
        psql -U postgres -d vml_image_generation_tools -c "
            SELECT id, name, \"scoringWeight\", \"optimizationWeight\"
            FROM image_generation_agents
            ORDER BY \"createdAt\" DESC
            LIMIT 10;
        "

        echo "=== Generation Requests ==="
        psql -U postgres -d vml_image_generation_tools -c "
            SELECT
                id,
                status,
                COALESCE(jsonb_array_length(iterations::jsonb), 0) as iterations,
                threshold,
                \"completionReason\"
            FROM image_generation_requests
            ORDER BY \"createdAt\" DESC
            LIMIT 10;
        "

        echo "=== Generated Images ==="
        psql -U postgres -d vml_image_generation_tools -c "
            SELECT
                id,
                \"requestId\",
                \"iterationNumber\",
                LEFT(\"s3Url\", 60) as s3_url_preview
            FROM image_generation_images
            ORDER BY \"createdAt\" DESC
            LIMIT 10;
        "

        echo "=== Prompt Optimizer Config ==="
        psql -U postgres -d vml_image_generation_tools -c "
            SELECT id, config FROM image_generation_prompt_optimizer;
        "
        ;;

    0)
        log_info "Exiting..."
        exit 0
        ;;

    *)
        log_error "Invalid option"
        exit 1
        ;;
esac
