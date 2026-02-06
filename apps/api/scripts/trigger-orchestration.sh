#!/bin/bash

# =============================================================================
# Trigger Orchestration Script
# =============================================================================
# This script triggers the orchestration service for a pending request
# and monitors the job progress through the database.
# =============================================================================

set -e

# Load test variables if available
if [ -f /tmp/test-image-gen-vars.sh ]; then
    source /tmp/test-image-gen-vars.sh
fi

DB_NAME="${DB_NAME:-vml_image_generation_tools}"
DB_USER="${DB_USER:-postgres}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_status() { echo -e "${CYAN}[STATUS]${NC} $1"; }

# =============================================================================
# Get or create a request
# =============================================================================
if [ -z "$REQUEST_ID" ]; then
    log_info "No REQUEST_ID set. Looking for pending requests..."

    REQUEST_ID=$(psql -U ${DB_USER} -d ${DB_NAME} -t -c "
        SELECT id FROM image_generation_requests
        WHERE status = 'pending'
        ORDER BY \"createdAt\" DESC
        LIMIT 1;
    " | tr -d ' ')

    if [ -z "$REQUEST_ID" ]; then
        log_error "No pending requests found. Run test-image-generation.sh first."
        exit 1
    fi
fi

log_info "Using Request ID: ${REQUEST_ID}"

# =============================================================================
# Show current request status
# =============================================================================
log_info "Current request status:"
psql -U ${DB_USER} -d ${DB_NAME} -c "
SELECT
    id,
    status,
    COALESCE(jsonb_array_length(iterations::jsonb), 0) as iteration_count,
    threshold,
    \"maxIterations\",
    \"finalImageId\",
    \"completionReason\"
FROM image_generation_requests
WHERE id = '${REQUEST_ID}';
"

# =============================================================================
# Queue the job via pg-boss (insert directly)
# =============================================================================
log_info "Queueing job via pg-boss..."

JOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

# Get organization ID from request
ORG_ID=$(psql -U ${DB_USER} -d ${DB_NAME} -t -c "
    SELECT \"organizationId\" FROM image_generation_requests WHERE id = '${REQUEST_ID}';
" | tr -d ' ')

# Insert job into pg-boss queue
psql -U ${DB_USER} -d ${DB_NAME} -c "
INSERT INTO pgboss.job (
    id, name, data, state, priority,
    start_after, expire_seconds, retry_limit,
    created_on
)
VALUES (
    '${JOB_ID}',
    'image-generation:process-request',
    '{\"requestId\": \"${REQUEST_ID}\", \"organizationId\": \"${ORG_ID}\"}',
    'created',
    0,
    NOW(),
    900,
    3,
    NOW()
);
"

log_success "Job queued: ${JOB_ID}"
log_info "The pg-boss worker should pick this up automatically."

# =============================================================================
# Monitor job status
# =============================================================================
log_info "Monitoring request status (Ctrl+C to stop)..."
echo ""
echo "=============================================="
echo "Watch the API server logs for detailed output:"
echo "  - [ORCHESTRATION_START] - Job started"
echo "  - [PHASE_OPTIMIZING]    - Prompt optimization"
echo "  - [PHASE_GENERATING]    - Image generation"
echo "  - [PHASE_EVALUATING]    - Judge evaluations"
echo "  - [ITERATION_COMPLETE]  - Iteration finished"
echo "  - [ORCHESTRATION_SUCCESS/COMPLETE] - Done"
echo "=============================================="
echo ""

# Poll for status changes
PREV_STATUS=""
POLL_COUNT=0
MAX_POLLS=120  # 10 minutes at 5-second intervals

while [ $POLL_COUNT -lt $MAX_POLLS ]; do
    # Get current status
    STATUS_ROW=$(psql -U ${DB_USER} -d ${DB_NAME} -t -c "
        SELECT
            status,
            COALESCE(jsonb_array_length(iterations::jsonb), 0) as iter_count,
            \"finalImageId\",
            \"completionReason\",
            \"errorMessage\"
        FROM image_generation_requests
        WHERE id = '${REQUEST_ID}';
    " | tr -d '\n')

    CURRENT_STATUS=$(echo "$STATUS_ROW" | awk -F'|' '{print $1}' | tr -d ' ')
    ITER_COUNT=$(echo "$STATUS_ROW" | awk -F'|' '{print $2}' | tr -d ' ')
    SELECTED_IMAGE=$(echo "$STATUS_ROW" | awk -F'|' '{print $3}' | tr -d ' ')
    COMPLETION_REASON=$(echo "$STATUS_ROW" | awk -F'|' '{print $4}' | tr -d ' ')
    ERROR_MSG=$(echo "$STATUS_ROW" | awk -F'|' '{print $5}' | tr -d ' ')

    # Only log if status changed
    if [ "$CURRENT_STATUS" != "$PREV_STATUS" ]; then
        TIMESTAMP=$(date '+%H:%M:%S')
        log_status "[${TIMESTAMP}] Status: ${CURRENT_STATUS} | Iterations: ${ITER_COUNT}"
        PREV_STATUS="$CURRENT_STATUS"
    fi

    # Check if completed
    case "$CURRENT_STATUS" in
        "completed")
            echo ""
            log_success "Request completed!"
            log_info "Completion Reason: ${COMPLETION_REASON}"
            log_info "Selected Image: ${SELECTED_IMAGE}"

            # Show final iteration scores
            echo ""
            log_info "Iteration scores:"
            psql -U ${DB_USER} -d ${DB_NAME} -c "
                SELECT
                    i->>'iterationNumber' as iteration,
                    (i->>'aggregateScore')::numeric(5,2) as score,
                    i->>'finalImageId' as image_id
                FROM image_generation_requests,
                     jsonb_array_elements(iterations::jsonb) as i
                WHERE id = '${REQUEST_ID}'
                ORDER BY (i->>'iterationNumber')::int;
            "

            # Show generated images
            echo ""
            log_info "Generated images:"
            psql -U ${DB_USER} -d ${DB_NAME} -c "
                SELECT
                    id,
                    \"iterationNumber\",
                    \"s3Url\"
                FROM image_generation_images
                WHERE \"requestId\" = '${REQUEST_ID}'
                ORDER BY \"iterationNumber\", \"createdAt\";
            "
            exit 0
            ;;
        "failed")
            echo ""
            log_error "Request failed!"
            log_error "Error: ${ERROR_MSG}"
            exit 1
            ;;
        "cancelled")
            echo ""
            log_warn "Request was cancelled"
            exit 0
            ;;
    esac

    # Show a dot every poll to indicate activity
    echo -n "."

    sleep 5
    POLL_COUNT=$((POLL_COUNT + 1))
done

log_warn "Monitoring timed out after 10 minutes"
log_info "The job may still be running. Check the API logs for details."
