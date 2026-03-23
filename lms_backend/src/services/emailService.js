require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendOTPEmail(toEmail, otp, purpose) {
  const subjects = {
    reset: 'Your Password Reset OTP - Acadeno LMS',
    mfa: 'Your Login Verification Code - Acadeno LMS',
  };

  const messages = {
    reset: `Your password reset OTP is: ${otp}\n\nThis code is valid for 10 minutes.\nIf you did not request this, ignore this email.`,
    mfa: `Your login verification code is: ${otp}\n\nThis code is valid for 10 minutes.\nIf you did not attempt to login, secure your account immediately.`,
  };

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: subjects[purpose],
    text: messages[purpose],
  });
}

async function sendLockoutEmail(toEmail, lockedUntil) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Your Account Has Been Locked - Acadeno LMS',
    text: `Your account has been locked due to 5 consecutive failed login attempts.\n\nYour account will be automatically unlocked at: ${lockedUntil}\n\nIf this was not you, please contact support immediately.`,
  });
}

// ---------------------------------------------------------------------------
// EPIC-03: Registration Emails
// ---------------------------------------------------------------------------

async function sendPaymentLinkEmail(toEmail, studentName, paymentUrl, registrationNumber) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `Complete Your Registration Payment - Acadeno LMS (${registrationNumber})`,
    text: `Dear ${studentName},\n\nYour registration (${registrationNumber}) has been submitted successfully!\n\nPlease complete your payment using the link below:\n${paymentUrl}\n\nIf you have any questions, please contact our support team.\n\nBest regards,\nAcadeno LMS Team`,
  });
  // TODO: SMS (Twilio/MSG91) — Send payment link via SMS alongside email
}

async function sendRegistrationConfirmationEmail(toEmail, studentName, registrationNumber) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `Registration Confirmed - Acadeno LMS (${registrationNumber})`,
    text: `Dear ${studentName},\n\nYour registration (${registrationNumber}) has been confirmed and your enrollment is now active.\n\nYou can log in to the Acadeno LMS portal to access your courses.\n\nBest regards,\nAcadeno LMS Team`,
  });
}

module.exports = { sendOTPEmail, sendLockoutEmail, sendPaymentLinkEmail, sendRegistrationConfirmationEmail };
