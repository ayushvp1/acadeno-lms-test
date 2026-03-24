// ==========================================================================
// ACADENO LMS — S3 Storage Utility (Local Disk Stub)
// ==========================================================================
// Provides a clean interface for file storage operations.
// Currently stubbed to use local disk storage under uploads/ for development.
//
// WHY THIS EXISTS:
//   All controllers call these three functions exclusively.
//   When AWS S3 is ready, ONLY the implementations below change.
//   Zero changes needed in any controller or route.
//
// PRODUCTION MIGRATION:
//   1. npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//   2. Replace implementations below with PutObjectCommand, GetObjectCommand
//   3. Controllers stay 100% unchanged.
//
// STUB BEHAVIOUR:
//   - Files saved to: {project_root}/uploads/{key}
//   - URL returned:   http://localhost:3001/uploads/{key}
//   - Presigned URL:  same as above (no expiry for local files)
// ==========================================================================

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants — Zero Magic Values Rule
// ---------------------------------------------------------------------------
const STR_UPLOAD_ROOT   = path.join(__dirname, '..', '..', 'uploads');
const STR_BASE_URL      = process.env.APP_URL || 'http://localhost:3001';
const STR_UPLOADS_MOUNT = '/uploads';

// ---------------------------------------------------------------------------
// ensureDir(strDirPath)
// ---------------------------------------------------------------------------
// Business intent: Create directory tree if it does not exist.
// Side effect: Creates directories on disk.
// ---------------------------------------------------------------------------
function ensureDir(strDirPath) {
  if (!fs.existsSync(strDirPath)) {
    fs.mkdirSync(strDirPath, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// uploadFile(buffer, key, mimeType) → { url, key }
// ---------------------------------------------------------------------------
// Business intent: Persist an in-memory file buffer to storage and return
// a publicly accessible URL.
//
// Parameters:
//   buffer   - Buffer containing file data
//   key      - Storage key (acts as relative path, e.g. 'videos/raw/{uuid}.mp4')
//   mimeType - MIME type string (unused in stub; required for S3 ContentType)
//
// Returns: { url: string, key: string }
// Side effects: Writes file to local disk.
// ---------------------------------------------------------------------------
async function uploadFile(buffer, key, mimeType) {
  // Bouncer: validate all inputs
  if (!Buffer.isBuffer(buffer)) throw new Error('uploadFile: buffer must be a Buffer.');
  if (typeof key !== 'string' || key.trim() === '') throw new Error('uploadFile: key must be a non-empty string.');

  const strFilePath = path.join(STR_UPLOAD_ROOT, key);
  const strDirPath  = path.dirname(strFilePath);

  ensureDir(strDirPath);
  fs.writeFileSync(strFilePath, buffer);

  const strUrl = `${STR_BASE_URL}${STR_UPLOADS_MOUNT}/${key}`;

  return { url: strUrl, key };
}

// ---------------------------------------------------------------------------
// generatePresignedUrl(key) → url
// ---------------------------------------------------------------------------
// Business intent: Generate a time-limited URL granting temporary read access
// to a stored file (BR-C02 access control for student file viewing).
//
// In production: returns a 15-minute S3 pre-signed GetObject URL.
// In stub: returns the direct local URL (no expiry needed for local files).
//
// Parameters:
//   key - Storage key of the file
//
// Returns: string (URL)
// ---------------------------------------------------------------------------
function generatePresignedUrl(key) {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('generatePresignedUrl: key must be a non-empty string.');
  }

  return `${STR_BASE_URL}${STR_UPLOADS_MOUNT}/${key}`;
}

// ---------------------------------------------------------------------------
// deleteFile(key)
// ---------------------------------------------------------------------------
// Business intent: Remove a file from storage when content is deleted.
//
// Parameters:
//   key - Storage key of the file to delete
//
// Side effects: Deletes file from local disk. Silent if file does not exist.
// ---------------------------------------------------------------------------
async function deleteFile(key) {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('deleteFile: key must be a non-empty string.');
  }

  const strFilePath = path.join(STR_UPLOAD_ROOT, key);

  if (fs.existsSync(strFilePath)) {
    fs.unlinkSync(strFilePath);
  }
}

// ---------------------------------------------------------------------------
// generateUniqueKey(strPrefix, strOriginalName) → key
// ---------------------------------------------------------------------------
// Business intent: Create a collision-resistant storage key for a new upload.
// Combines prefix (folder path), a UUID, and the original file extension.
//
// Example: 'documents/courseId/subModId/a1b2c3d4-originalname.pdf'
// ---------------------------------------------------------------------------
function generateUniqueKey(strPrefix, strOriginalName) {
  if (typeof strPrefix      !== 'string') throw new Error('generateUniqueKey: strPrefix must be a string.');
  if (typeof strOriginalName !== 'string') throw new Error('generateUniqueKey: strOriginalName must be a string.');

  const strExt    = path.extname(strOriginalName) || '';
  const strUuid   = crypto.randomUUID();
  const strPrefix2 = strPrefix.endsWith('/') ? strPrefix : `${strPrefix}/`;

  return `${strPrefix2}${strUuid}${strExt}`;
}

module.exports = { uploadFile, generatePresignedUrl, deleteFile, generateUniqueKey };
