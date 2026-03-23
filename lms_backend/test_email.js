require('dotenv').config();
const { sendOTPEmail } = require('./src/services/emailService');

sendOTPEmail('anulalsn@gmail.com', '123456', 'reset')
  .then(() => console.log('Email sent successfully'))
  .catch((err) => console.error('Error:', err.message));


