// ==========================================================================
// ACADENO LMS — India Post PIN Code Lookup Service
// ==========================================================================
// Wraps the India Post public API for auto-populating city and state
// from a 6-digit PIN code. On timeout/error, returns a fallback object
// so the frontend can show a manual-entry warning.
// ==========================================================================

const https = require('https');

const API_TIMEOUT_MS = 5000; // 5 second timeout

// ---------------------------------------------------------------------------
// lookupPinCode(pin) → { city, state, fallback }
// ---------------------------------------------------------------------------
async function lookupPinCode(pin) {
  // Validate 6-digit format before calling API
  if (!/^\d{6}$/.test(pin)) {
    return { city: null, state: null, fallback: true, error: 'Invalid PIN code format' };
  }

  return new Promise((resolve) => {
    const url = `https://api.postalpincode.in/pincode/${pin}`;

    const req = https.get(url, { timeout: API_TIMEOUT_MS }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (
            Array.isArray(parsed) &&
            parsed[0]?.Status === 'Success' &&
            Array.isArray(parsed[0]?.PostOffice) &&
            parsed[0].PostOffice.length > 0
          ) {
            const postOffice = parsed[0].PostOffice[0];
            resolve({
              city:     postOffice.District || postOffice.Name,
              state:    postOffice.State,
              fallback: false,
            });
          } else {
            resolve({
              city:     null,
              state:    null,
              fallback: true,
              error:    'PIN code not found',
            });
          }
        } catch (parseErr) {
          console.error('PIN API parse error:', parseErr.message);
          resolve({ city: null, state: null, fallback: true, error: 'API response error' });
        }
      });
    });

    req.on('error', (err) => {
      console.error('PIN API request error:', err.message);
      resolve({ city: null, state: null, fallback: true, error: 'API unavailable' });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('PIN API timeout');
      resolve({ city: null, state: null, fallback: true, error: 'API timeout' });
    });
  });
}

module.exports = { lookupPinCode };
