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

async function sendLeadArchiveEmail(toEmail, leadName, lastActivityDate) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `Lead Auto-Archived: ${leadName}`,
    text: `The lead "${leadName}" has been automatically archived to "cold" status due to 90 days of inactivity.\n\nLast Activity Date: ${lastActivityDate}\nReason: 90 days of inactivity rule (BR-L03).`,
  });
}

async function sendFollowUpReminderEmail(toEmail, leadName, lastNote, followUpDate, leadLink) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `Follow-up Reminder: ${leadName}`,
    text: `Daily Reminder: You have a scheduled follow-up for the lead "${leadName}".\n\nFollow-up Date: ${followUpDate}\nLast Note from BDA: ${lastNote || 'No notes available.'}\n\nDirect Link to Lead: ${leadLink}`,
  });
}

// ---------------------------------------------------------------------------
// sendWelcomeCredentialsEmail
// ---------------------------------------------------------------------------
// Sent after the registration wizard is submitted successfully.
// Delivers the student's login email and the system-generated plain-text password.
// ---------------------------------------------------------------------------
async function sendWelcomeCredentialsEmail(toEmail, studentName, plainPassword, loginUrl) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: 'Your Acadeno LMS Login Credentials',
    text: `Hi ${studentName},\n\nYour registration has been submitted successfully!\n\nHere are your login credentials:\n  Email:    ${toEmail}\n  Password: ${plainPassword}\n\nLogin here: ${loginUrl}\n\nFor your security, please change your password after your first login.\n\nWarm regards,\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#1e3a5f;margin-bottom:8px">Registration Successful!</h2>
        <p style="color:#475569">Hi <strong>${studentName}</strong>,</p>
        <p style="color:#475569">Your enrollment has been submitted. Here are your platform login credentials:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:10px;background:#f8fafc;color:#64748b;width:100px">Email</td><td style="padding:10px;background:#f8fafc;font-weight:600;color:#1e293b">${toEmail}</td></tr>
          <tr><td style="padding:10px;color:#64748b">Password</td><td style="padding:10px;font-weight:600;font-family:monospace;color:#1e293b;letter-spacing:1px">${plainPassword}</td></tr>
        </table>
        <a href="${loginUrl}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Login to Acadeno
        </a>
        <p style="color:#ef4444;font-size:13px;margin-top:16px">⚠ For your security, please change your password after your first login.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// sendPaymentLinkEmail
// ---------------------------------------------------------------------------
// Sent after the registration wizard is submitted.
// Delivers the enrollment fee payment link to the student.
// ---------------------------------------------------------------------------
async function sendPaymentLinkEmail(toEmail, studentName, paymentUrl, registrationNumber) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: `Payment Required — ${registrationNumber} — Acadeno LMS`,
    text: `Hi ${studentName},\n\nYour registration (${registrationNumber}) is complete. To activate your enrollment, please complete the fee payment:\n\n${paymentUrl}\n\nIf you have any questions, please contact support.\n\nWarm regards,\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#1e3a5f;margin-bottom:8px">Fee Payment Required</h2>
        <p style="color:#475569">Hi <strong>${studentName}</strong>,</p>
        <p style="color:#475569">Your registration <strong>${registrationNumber}</strong> is complete. Please complete your fee payment to activate your enrollment.</p>
        <a href="${paymentUrl}" style="display:inline-block;margin:24px 0;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Pay Now
        </a>
        <p style="color:#94a3b8;font-size:13px">If you have already made the payment, please ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// sendRegistrationInviteEmail
// ---------------------------------------------------------------------------
// Sent when a BDA converts a walk-in lead to the enrollment pipeline.
// The wizardUrl contains a one-time secure token (?token=...).
// ---------------------------------------------------------------------------
async function sendRegistrationInviteEmail(toEmail, leadName, wizardUrl) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: 'Complete Your Enrollment — Acadeno LMS',
    text: `Hi ${leadName},\n\nGreat news! You have been selected to enroll at Acadeno.\n\nPlease complete your registration by clicking the link below. This link is valid for 7 days.\n\n${wizardUrl}\n\nIf you did not expect this email, please ignore it or contact support.\n\nWarm regards,\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#1e3a5f;margin-bottom:8px">Welcome to Acadeno LMS</h2>
        <p style="color:#475569">Hi <strong>${leadName}</strong>,</p>
        <p style="color:#475569">You have been selected to enroll. Please complete your registration using the button below.</p>
        <a href="${wizardUrl}" style="display:inline-block;margin:24px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Complete Registration
        </a>
        <p style="color:#94a3b8;font-size:13px">This link expires in 7 days. If you did not expect this email, please ignore it.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// sendEnrollmentSuccessEmail
// ---------------------------------------------------------------------------
// Sent after payment is confirmed - includes login credentials
// ---------------------------------------------------------------------------
async function sendEnrollmentSuccessEmail(toEmail, studentName, courseName, loginUrl, plainPassword) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: 'Welcome to the Course! — Enrollment Confirmed',
    text: `Hi ${studentName},\n\nWoohoo! Your payment has been confirmed and your enrollment in "${courseName}" is now active.\n\nHere are your login credentials:\n  Email:    ${toEmail}\n  Password: ${plainPassword}\n\nYou can now log in to the student dashboard and start your learning journey:\n\n${loginUrl}\n\nFor your security, please change your password after your first login.\n\nSee you there!\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:2px solid #16a34a;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
           <div style="width:64px;height:64px;background:#dcfce7;color:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px">✓</div>
        </div>
        <h2 style="color:#1e3a5f;text-align:center">Enrollment Confirmed!</h2>
        <p style="color:#475569">Hi <strong>${studentName}</strong>,</p>
        <p style="color:#475569">Congratulations! Your payment for <strong>${courseName}</strong> was successful. Your account is now fully active.</p>
        <h3 style="color:#1e3a5f;margin-top:24px;margin-bottom:12px">Your Login Credentials</h3>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:10px;background:#f8fafc;color:#64748b;width:100px">Email</td><td style="padding:10px;background:#f8fafc;font-weight:600;color:#1e293b">${toEmail}</td></tr>
          <tr><td style="padding:10px;color:#64748b">Password</td><td style="padding:10px;font-weight:600;font-family:monospace;color:#1e293b;letter-spacing:1px">${plainPassword}</td></tr>
        </table>
        <div style="text-align:center;margin:32px 0">
           <a href="${loginUrl}" style="padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)">
             Access Your Dashboard
           </a>
        </div>
        <p style="color:#ef4444;font-size:13px;margin-top:16px">⚠ For your security, please change your password after your first login.</p>
        <p style="color:#64748b;font-size:14px">We're excited to have you on board! If you have any questions, simply reply to this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

module.exports = {
  sendOTPEmail,
  sendLockoutEmail,
  sendLeadArchiveEmail,
  sendFollowUpReminderEmail,
  sendWelcomeCredentialsEmail,
  sendPaymentLinkEmail,
  sendRegistrationInviteEmail,
  sendEnrollmentSuccessEmail,
};
