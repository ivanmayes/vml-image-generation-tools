#!/bin/bash

# =============================================================================
# Image Generation API Test Script
# =============================================================================
# This script tests the complete image generation flow:
# 1. Seeds test data (organization, agents)
# 2. Creates a generation request
# 3. Monitors the job execution via logs
# =============================================================================

set -e

API_BASE="http://localhost:8002"
DB_NAME="vml_image_generation_tools"
DB_USER="postgres"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Step 1: Check Prerequisites
# =============================================================================
log_info "Checking prerequisites..."

# Check if API is running
if ! curl -s "${API_BASE}/" > /dev/null 2>&1; then
    log_error "API server is not running at ${API_BASE}"
    log_info "Start the server with: npm run start:dev"
    exit 1
fi
log_success "API server is running"

# Check database connection
if ! psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT 1" > /dev/null 2>&1; then
    log_error "Cannot connect to database ${DB_NAME}"
    exit 1
fi
log_success "Database connection OK"

# =============================================================================
# Step 2: Seed Test Data
# =============================================================================
log_info "Seeding test data..."

# Generate UUIDs for test data
ORG_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
AGENT1_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
AGENT2_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
AGENT3_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

log_info "Test IDs:"
log_info "  Organization: ${ORG_ID}"
log_info "  Agent 1 (Brand): ${AGENT1_ID}"
log_info "  Agent 2 (Technical): ${AGENT2_ID}"
log_info "  Agent 3 (Creative): ${AGENT3_ID}"

# Create organization
log_info "Creating test organization..."
SLUG="test-image-gen-$(echo ${ORG_ID} | cut -c1-8)"
psql -U ${DB_USER} -d ${DB_NAME} -c "
INSERT INTO organizations (id, name, slug, \"redirectToSpace\", enabled, settings, created)
VALUES (
    '${ORG_ID}',
    'Test Image Gen Org',
    '${SLUG}',
    false,
    true,
    '{}',
    NOW()
) ON CONFLICT (id) DO NOTHING;
"

# Create Brand Consistency Judge Agent
log_info "Creating Brand Consistency Judge Agent..."
psql -U ${DB_USER} -d ${DB_NAME} -c "
INSERT INTO image_generation_agents (
    id, \"organizationId\", name, \"systemPrompt\",
    \"evaluationCategories\", \"optimizationWeight\", \"scoringWeight\",
    \"ragConfig\", \"createdAt\"
)
VALUES (
    '${AGENT1_ID}',
    '${ORG_ID}',
    'Brand Consistency Judge',
    'You are an expert brand consistency evaluator for AI-generated images.
Your role is to assess how well images align with brand guidelines and visual identity.

When evaluating images, consider:
- Color palette adherence
- Typography style consistency
- Logo placement and usage
- Overall brand aesthetic
- Target audience appropriateness

Provide specific, actionable feedback for improvement.',
    'Color Consistency, Brand Voice, Visual Identity, Logo Usage',
    40,
    35,
    '{\"topK\": 5, \"similarityThreshold\": 0.7}',
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    \"systemPrompt\" = EXCLUDED.\"systemPrompt\";
"

# Create Technical Quality Judge Agent
log_info "Creating Technical Quality Judge Agent..."
psql -U ${DB_USER} -d ${DB_NAME} -c "
INSERT INTO image_generation_agents (
    id, \"organizationId\", name, \"systemPrompt\",
    \"evaluationCategories\", \"optimizationWeight\", \"scoringWeight\",
    \"ragConfig\", \"createdAt\"
)
VALUES (
    '${AGENT2_ID}',
    '${ORG_ID}',
    'Technical Quality Judge',
    'You are an expert technical quality evaluator for AI-generated images.
Your role is to assess the technical aspects of image generation.

When evaluating images, consider:
- Resolution and sharpness
- Artifact presence (blur, noise, distortion)
- Anatomical correctness (for people/animals)
- Perspective and proportions
- Lighting consistency
- Detail preservation

Provide specific, actionable feedback for improvement.',
    'Sharpness, Artifacts, Anatomy, Composition, Lighting',
    30,
    40,
    '{\"topK\": 5, \"similarityThreshold\": 0.7}',
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    \"systemPrompt\" = EXCLUDED.\"systemPrompt\";
"

# Create Creative Director Judge Agent
log_info "Creating Creative Director Judge Agent..."
psql -U ${DB_USER} -d ${DB_NAME} -c "
INSERT INTO image_generation_agents (
    id, \"organizationId\", name, \"systemPrompt\",
    \"evaluationCategories\", \"optimizationWeight\", \"scoringWeight\",
    \"ragConfig\", \"createdAt\"
)
VALUES (
    '${AGENT3_ID}',
    '${ORG_ID}',
    'Creative Director Judge',
    'You are an experienced creative director evaluating AI-generated images.
Your role is to assess the creative and artistic merit of images.

When evaluating images, consider:
- Emotional impact and storytelling
- Originality and creativity
- Aesthetic appeal
- Message clarity
- Visual hierarchy
- Overall impression

Provide specific, actionable feedback for improvement.',
    'Impact, Originality, Aesthetics, Message Clarity, Visual Flow',
    30,
    25,
    '{\"topK\": 5, \"similarityThreshold\": 0.7}',
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    \"systemPrompt\" = EXCLUDED.\"systemPrompt\";
"

log_success "Test data seeded successfully"

# =============================================================================
# Step 3: Create Generation Request (Direct DB Insert)
# =============================================================================
log_info "Creating generation request..."

REQUEST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

psql -U ${DB_USER} -d ${DB_NAME} -c "
INSERT INTO image_generation_requests (
    id, \"organizationId\", brief, \"negativePrompts\",
    \"judgeIds\", \"imageParams\", threshold, \"maxIterations\",
    status, \"currentIteration\", iterations, costs,
    \"createdAt\"
)
VALUES (
    '${REQUEST_ID}',
    '${ORG_ID}',
    'Create a professional product photography image of a sleek, modern smartwatch on a minimalist white marble surface. The watch should have a dark metallic band and a glowing blue digital display showing the time 10:10. Soft, diffused lighting from the upper left creates subtle shadows. The background should be clean and uncluttered with a slight gradient.',
    'blurry, low quality, distorted, cartoon, anime, watermark, text overlay, cluttered background, harsh shadows',
    ARRAY['${AGENT1_ID}', '${AGENT2_ID}', '${AGENT3_ID}']::uuid[],
    '{\"imagesPerGeneration\": 1, \"aspectRatio\": \"16:9\", \"quality\": \"high\"}',
    75,
    3,
    'pending',
    0,
    '[]',
    '{\"llmTokens\": 0, \"embeddingTokens\": 0, \"imageGenerations\": 0, \"totalEstimatedCost\": 0}',
    NOW()
);
"

log_success "Generation request created: ${REQUEST_ID}"

# =============================================================================
# Step 4: Verify Data
# =============================================================================
log_info "Verifying seeded data..."

echo ""
echo "=== Organizations ==="
psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT id, name FROM organizations WHERE id = '${ORG_ID}';"

echo ""
echo "=== Agents ==="
psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT id, name, \"scoringWeight\" FROM image_generation_agents WHERE \"organizationId\" = '${ORG_ID}';"

echo ""
echo "=== Generation Request ==="
psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT id, status, LEFT(brief, 80) as brief_preview FROM image_generation_requests WHERE id = '${REQUEST_ID}';"

# =============================================================================
# Step 5: Output test variables for manual testing
# =============================================================================
echo ""
echo "=============================================="
echo "TEST DATA CREATED SUCCESSFULLY"
echo "=============================================="
echo ""
echo "To test the orchestration manually, run:"
echo ""
echo "  # Start the server (if not running)"
echo "  npm run start:dev"
echo ""
echo "  # Watch the logs for verbose output"
echo "  # Look for tags like [ORCHESTRATION_START], [PHASE_OPTIMIZING], etc."
echo ""
echo "Environment variables for testing:"
echo "  export ORG_ID=${ORG_ID}"
echo "  export REQUEST_ID=${REQUEST_ID}"
echo "  export AGENT1_ID=${AGENT1_ID}"
echo "  export AGENT2_ID=${AGENT2_ID}"
echo "  export AGENT3_ID=${AGENT3_ID}"
echo ""
echo "To trigger the orchestration, run:"
echo "  ./scripts/trigger-orchestration.sh"
echo ""
echo "=============================================="

# Save variables to a file for later use
cat > /tmp/test-image-gen-vars.sh << EOF
export ORG_ID=${ORG_ID}
export REQUEST_ID=${REQUEST_ID}
export AGENT1_ID=${AGENT1_ID}
export AGENT2_ID=${AGENT2_ID}
export AGENT3_ID=${AGENT3_ID}
export API_BASE=${API_BASE}
export DB_NAME=${DB_NAME}
EOF

log_success "Variables saved to /tmp/test-image-gen-vars.sh"
log_info "Source them with: source /tmp/test-image-gen-vars.sh"
