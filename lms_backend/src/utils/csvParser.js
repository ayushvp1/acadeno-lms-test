const csv = require('csv-parser');
const { Readable } = require('stream');

/**
 * Parses CSV buffer into JSON array mapping headers case-insensitively.
 * @param {Buffer} buffer - Multer file buffer
 * @returns {Promise<Array>} - Parsed rows
 */
async function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    // Convert buffer to string and create a readable stream
    const stream = Readable.from(buffer.toString());

    stream
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim().toLowerCase()
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

module.exports = { parseCSV };
