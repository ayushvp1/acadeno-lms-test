// ==========================================================================
// ACADENO LMS — AWS MediaConvert Utility (Stub)
// ==========================================================================
// Wraps the AWS MediaConvert HLS transcoding workflow.
// Currently stubbed — simulates a 2-second transcoding delay and
// immediately marks the content_item as 'complete'.
//
// WHY THIS EXISTS:
//   Controllers call createTranscodeJob() exclusively.
//   When AWS MediaConvert is ready, ONLY this file changes.
//   Zero changes needed in courseController.js.
//
// PRODUCTION MIGRATION:
//   1. npm install @aws-sdk/client-mediaconvert
//   2. Replace createTranscodeJob() with real MediaConvertClient call.
//   3. Set up SNS/SQS webhook → call updateTranscodeStatus() on completion.
//
// STUB BEHAVIOUR:
//   - Returns a mock jobId immediately (format: mock-job-{uuid})
//   - After INT_STUB_DELAY_MS, updates content_items in Postgres:
//       transcode_status = 'complete', hls_url = the original upload URL
// ==========================================================================

const crypto = require('crypto');
const { pool } = require('../db/index');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const INT_STUB_DELAY_MS     = 2000;    // Simulate 2-second transcoding lag
const STR_MOCK_JOB_PREFIX   = 'mock-job-';
const STR_STATUS_COMPLETE   = 'complete';
const STR_STATUS_FAILED     = 'failed';
const STR_BASE_URL          = process.env.APP_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// createTranscodeJob(strRawS3Key, strContentId) → { jobId }
// ---------------------------------------------------------------------------
// Business intent: Trigger HLS transcoding of an uploaded MP4 file.
// Creates 360p/720p/1080p renditions for adaptive bitrate streaming (US-CRS-02).
//
// In production: submits a job to AWS MediaConvert using the configured queue
// and IAM role. Returns the real AWS job ID for status polling.
//
// In stub: schedules a setTimeout that updates the DB record to 'complete'
// after INT_STUB_DELAY_MS milliseconds.
//
// Parameters:
//   strRawS3Key  - S3 key of the raw MP4 upload (e.g. 'videos/raw/{uuid}.mp4')
//   strContentId - UUID of the content_items row to update on completion
//
// Returns: { jobId: string }
// Side effects (async): Updates content_items.transcode_status in Postgres.
// ---------------------------------------------------------------------------
async function createTranscodeJob(strRawS3Key, strContentId) {
  // Bouncer: validate inputs
  if (typeof strRawS3Key !== 'string' || strRawS3Key.trim() === '') {
    throw new Error('createTranscodeJob: strRawS3Key must be a non-empty string.');
  }
  if (typeof strContentId !== 'string' || strContentId.trim() === '') {
    throw new Error('createTranscodeJob: strContentId must be a non-empty string.');
  }

  const strJobId   = `${STR_MOCK_JOB_PREFIX}${crypto.randomUUID()}`;
  const strHlsUrl  = `${STR_BASE_URL}/uploads/${strRawS3Key}`;

  // Fire-and-forget: simulate transcoding with 2-second delay
  setTimeout(async () => {
    await _markTranscodeComplete(strContentId, strHlsUrl, strJobId);
  }, INT_STUB_DELAY_MS);

  return { jobId: strJobId };
}

// ---------------------------------------------------------------------------
// _markTranscodeComplete(strContentId, strHlsUrl, strJobId)
// ---------------------------------------------------------------------------
// Business intent: Update content_items record after transcoding finishes.
// Called internally by the stub timer and can be called by SNS webhook handler
// in production.
//
// Side effects: Issues Postgres UPDATE on content_items.
// ---------------------------------------------------------------------------
async function _markTranscodeComplete(strContentId, strHlsUrl, strJobId) {
  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    await client.query(
      `UPDATE content_items
          SET transcode_status = $1,
              hls_url          = $2,
              updated_at       = NOW()
        WHERE id = $3`,
      [STR_STATUS_COMPLETE, strHlsUrl, strContentId]
    );
  } catch (err) {
    console.error(`[MediaConvert Stub] Failed to update content item ${strContentId}:`, err.message);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// markTranscodeFailed(strContentId)
// ---------------------------------------------------------------------------
// Business intent: Update content_items record when transcoding fails.
// Called by SNS webhook in production when MediaConvert reports ERROR status.
//
// Side effects: Issues Postgres UPDATE on content_items.
// ---------------------------------------------------------------------------
async function markTranscodeFailed(strContentId) {
  if (typeof strContentId !== 'string' || strContentId.trim() === '') {
    throw new Error('markTranscodeFailed: strContentId must be a non-empty string.');
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    await client.query(
      `UPDATE content_items
          SET transcode_status = $1,
              updated_at       = NOW()
        WHERE id = $2`,
      [STR_STATUS_FAILED, strContentId]
    );
  } catch (err) {
    console.error(`[MediaConvert] Failed to mark item ${strContentId} as failed:`, err.message);
  } finally {
    client.release();
  }
}

module.exports = { createTranscodeJob, markTranscodeFailed };
