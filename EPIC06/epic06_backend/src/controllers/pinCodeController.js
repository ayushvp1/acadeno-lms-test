// ==========================================================================
// ACADENO LMS — PIN Code Controller
// ==========================================================================
// Proxies the India Post API lookup for city/state auto-fill.
// ==========================================================================

const { lookupPinCode } = require('../services/pinCodeService');

// ---------------------------------------------------------------------------
// GET /api/pincode/:pin  (US-REG-02)
// ---------------------------------------------------------------------------
async function lookupPin(req, res) {
  try {
    const { pin } = req.params;

    const result = await lookupPinCode(pin);

    if (result.fallback) {
      return res.status(200).json({
        city:     result.city,
        state:    result.state,
        fallback: true,
        message:  result.error || 'PIN code lookup unavailable. Please enter city and state manually.',
      });
    }

    return res.status(200).json({
      city:     result.city,
      state:    result.state,
      fallback: false,
    });
  } catch (err) {
    console.error('PIN LOOKUP ERROR:', err.message);
    return res.status(200).json({
      city:     null,
      state:    null,
      fallback: true,
      message:  'PIN code lookup unavailable. Please enter city and state manually.',
    });
  }
}

module.exports = { lookupPin };
