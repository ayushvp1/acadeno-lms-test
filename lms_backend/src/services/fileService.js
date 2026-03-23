// ==========================================================================
// ACADENO LMS — File Upload Service (Storage Adapter)
// ==========================================================================
// Wraps multer with a storage-adapter interface. Controllers call only
// fileService.uploadProfilePhoto and fileService.uploadMarksheet —
// never multer directly.
//
// To migrate to S3:
//   1. npm install multer-s3 @aws-sdk/client-s3
//   2. Replace `diskStorage` with `multerS3({ ... })`
//   3. Controllers stay unchanged.
// ==========================================================================

const multer = require('multer');
const path  = require('path');
const fs    = require('fs');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Ensure upload directories exist
// ---------------------------------------------------------------------------
const UPLOAD_ROOT   = path.join(__dirname, '..', '..', 'uploads');
const PHOTOS_DIR    = path.join(UPLOAD_ROOT, 'photos');
const MARKSHEETS_DIR = path.join(UPLOAD_ROOT, 'marksheets');

[UPLOAD_ROOT, PHOTOS_DIR, MARKSHEETS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Storage engine (swap this block for S3)
// ---------------------------------------------------------------------------
function createStorage(subDir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(UPLOAD_ROOT, subDir);
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      // Unique name: timestamp + random hex + original extension
      const ext = path.extname(file.originalname);
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    },
  });
}

// ---------------------------------------------------------------------------
// File filter factories
// ---------------------------------------------------------------------------
function imageFilter(req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, etc.) are allowed'), false);
  }
}

function pdfFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
}

// ---------------------------------------------------------------------------
// Configured multer instances (max 10 MB)
// ---------------------------------------------------------------------------
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const uploadProfilePhoto = multer({
  storage:    createStorage('photos'),
  fileFilter: imageFilter,
  limits:     { fileSize: MAX_FILE_SIZE },
}).single('profile_photo');

const uploadMarksheet = multer({
  storage:    createStorage('marksheets'),
  fileFilter: pdfFilter,
  limits:     { fileSize: MAX_FILE_SIZE },
}).single('marksheet');

// ---------------------------------------------------------------------------
// Middleware wrappers with error handling
// ---------------------------------------------------------------------------
function handleUpload(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File size exceeds 10 MB limit',
            code:  'FILE_TOO_LARGE',
          });
        }
        return res.status(400).json({
          error: err.message,
          code:  'UPLOAD_ERROR',
        });
      }
      if (err) {
        return res.status(400).json({
          error: err.message,
          code:  'UPLOAD_ERROR',
        });
      }
      next();
    });
  };
}

// ---------------------------------------------------------------------------
// Helper: get the relative path for DB storage
// ---------------------------------------------------------------------------
function getUploadedFilePath(file) {
  if (!file) return null;
  // Store relative path from project root for portability
  return path.relative(path.join(__dirname, '..', '..'), file.path).replace(/\\/g, '/');
}

module.exports = {
  uploadProfilePhoto: handleUpload(uploadProfilePhoto),
  uploadMarksheet:    handleUpload(uploadMarksheet),
  getUploadedFilePath,
  UPLOAD_ROOT,
};
