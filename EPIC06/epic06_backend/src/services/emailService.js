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

// ===========================================================================
// EPIC-05: Course & Content Management Emails
// ===========================================================================

// ---------------------------------------------------------------------------
// sendTranscodeFailureEmail
// ---------------------------------------------------------------------------
// Business intent: Notify a trainer when video transcoding fails so they can
// re-upload the source MP4.
//
// Parameters:
//   toEmail      - Trainer's email address
//   trainerName  - Trainer's display name
//   contentTitle - Title of the affected content item
//   courseTitle  - Title of the parent course
// ---------------------------------------------------------------------------
async function sendTranscodeFailureEmail(toEmail, trainerName, contentTitle, courseTitle) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: `Video Transcoding Failed — ${contentTitle} — Acadeno LMS`,
    text: `Hi ${trainerName},\n\nUnfortunately, the video transcoding job for your content "${contentTitle}" in course "${courseTitle}" has failed.\n\nPlease log in to the LMS and re-upload the video file.\n\nIf the problem persists, please contact platform support.\n\nWarm regards,\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:2px solid #ef4444;border-radius:12px">
        <h2 style="color:#ef4444;margin-bottom:8px">Video Transcoding Failed</h2>
        <p style="color:#475569">Hi <strong>${trainerName}</strong>,</p>
        <p style="color:#475569">The video transcoding job for <strong>${contentTitle}</strong> in course <strong>${courseTitle}</strong> has failed.</p>
        <p style="color:#475569">Please log in to the LMS and re-upload the video file to resolve this issue.</p>
        <p style="color:#94a3b8;font-size:13px">If this keeps happening, contact platform support.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// sendTaskEvaluationEmail
// ---------------------------------------------------------------------------
// Business intent: Notify a student when their task submission has been
// evaluated by the trainer (pass/fail + optional feedback).
//
// Parameters:
//   toEmail      - Student's email address
//   studentName  - Student's display name
//   taskTitle    - Title of the evaluated task
//   grade        - 'pass' or 'fail'
//   score        - Numeric score (may be null if not set)
//   feedback     - Trainer's feedback text (may be null)
//   dashboardUrl - Link to the student's task page
// ---------------------------------------------------------------------------
async function sendTaskEvaluationEmail(toEmail, studentName, taskTitle, grade, score, feedback, dashboardUrl) {
  const strGradeLabel  = grade === 'pass' ? '✅ Pass' : '❌ Fail';
  const strGradeColor  = grade === 'pass' ? '#16a34a' : '#ef4444';
  const strScoreText   = score !== null && score !== undefined ? ` — Score: ${score}/100` : '';

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: `Task Evaluated: ${taskTitle} — ${strGradeLabel} — Acadeno LMS`,
    text: `Hi ${studentName},\n\nYour submission for "${taskTitle}" has been evaluated.\n\nResult: ${grade.toUpperCase()}${strScoreText}\n${feedback ? `\nFeedback: ${feedback}\n` : ''}\nLog in to view the full details:\n${dashboardUrl}\n\nKeep learning!\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:2px solid ${strGradeColor};border-radius:12px">
        <h2 style="color:${strGradeColor};margin-bottom:8px">Task Evaluated: ${strGradeLabel}</h2>
        <p style="color:#475569">Hi <strong>${studentName}</strong>,</p>
        <p style="color:#475569">Your submission for <strong>${taskTitle}</strong> has been reviewed.</p>
        ${score !== null && score !== undefined
          ? `<p style="color:#1e293b;font-size:20px;font-weight:700">Score: ${score}/100</p>`
          : ''}
        ${feedback
          ? `<div style="background:#f8fafc;border-left:4px solid ${strGradeColor};padding:12px 16px;margin:16px 0;border-radius:4px">
               <p style="color:#64748b;margin:0;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Trainer Feedback</p>
               <p style="color:#1e293b;margin:8px 0 0">${feedback}</p>
             </div>`
          : ''}
        <a href="${dashboardUrl}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          View Details
        </a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// sendLiveSessionReminderEmail
// ---------------------------------------------------------------------------
// Business intent: Remind students of an upcoming live session 1 hour before
// it starts (triggered by liveSessionReminderJob.js cron).
//
// Parameters:
//   toEmail       - Student's email address
//   studentName   - Student's display name
//   sessionTitle  - Title of the live session
//   courseName    - Name of the parent course
//   startTime     - ISO string or human-readable start time
//   joinUrl       - Zoom/Meet/Teams URL for the session
// ---------------------------------------------------------------------------
async function sendLiveSessionReminderEmail(toEmail, studentName, sessionTitle, courseName, startTime, joinUrl) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: `Live Session Starting Soon: ${sessionTitle} — Acadeno LMS`,
    text: `Hi ${studentName},\n\nThis is a reminder that your live session "${sessionTitle}" for "${courseName}" starts in 1 hour.\n\nScheduled Time: ${startTime}\n\nJoin the session here:\n${joinUrl}\n\nSee you there!\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:2px solid #7c3aed;border-radius:12px">
        <h2 style="color:#7c3aed;margin-bottom:8px">Live Session Starting Soon!</h2>
        <p style="color:#475569">Hi <strong>${studentName}</strong>,</p>
        <p style="color:#475569">Your live session <strong>${sessionTitle}</strong> for <strong>${courseName}</strong> starts in <strong>1 hour</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr>
            <td style="padding:10px;background:#f5f3ff;color:#64748b;width:120px">Session</td>
            <td style="padding:10px;background:#f5f3ff;font-weight:600;color:#1e293b">${sessionTitle}</td>
          </tr>
          <tr>
            <td style="padding:10px;color:#64748b">Scheduled</td>
            <td style="padding:10px;font-weight:600;color:#1e293b">${startTime}</td>
          </tr>
        </table>
        <a href="${joinUrl}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Join Live Session
        </a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// sendCertificateEmail (EPIC-06, US-STU-07)
// ---------------------------------------------------------------------------
// Sent after a course completion certificate has been generated.
// Includes the verification URL so the student can share it with employers.
//
// Parameters:
//   toEmail         - Student's email address
//   studentName     - Student's display name
//   courseName      - Name of the completed course
//   completionDate  - Human-readable completion date string
//   verificationUrl - Public URL for employer verification
// ---------------------------------------------------------------------------
async function sendCertificateEmail(toEmail, studentName, courseName, completionDate, verificationUrl) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: `Congratulations! Your Certificate for ${courseName} is Ready — Acadeno LMS`,
    text: `Hi ${studentName},\n\nCongratulations on completing "${courseName}"! Your certificate of completion is now available.\n\nCompletion Date: ${completionDate}\n\nVerify your certificate (share this link with employers):\n${verificationUrl}\n\nWell done on your achievement!\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:2px solid #f59e0b;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="width:64px;height:64px;background:#fef3c7;color:#f59e0b;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px">🏆</div>
        </div>
        <h2 style="color:#1e3a5f;text-align:center">Certificate Ready!</h2>
        <p style="color:#475569">Hi <strong>${studentName}</strong>,</p>
        <p style="color:#475569">Congratulations on successfully completing <strong>${courseName}</strong>! Your certificate is now available.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:10px;background:#fef3c7;color:#64748b;width:130px">Course</td><td style="padding:10px;background:#fef3c7;font-weight:600;color:#1e293b">${courseName}</td></tr>
          <tr><td style="padding:10px;color:#64748b">Completed</td><td style="padding:10px;font-weight:600;color:#1e293b">${completionDate}</td></tr>
        </table>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin:16px 0">
          <p style="color:#64748b;font-size:13px;margin:0 0 8px">Share this verification link with employers:</p>
          <a href="${verificationUrl}" style="color:#2563eb;word-break:break-all;font-size:13px">${verificationUrl}</a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// sendDiscussionReplyEmail (EPIC-06, US-STU-09)
// ---------------------------------------------------------------------------
// Sent to a student when their discussion post receives a reply from a trainer.
//
// Parameters:
//   toEmail      - Post author's email address
//   studentName  - Post author's display name
//   postTitle    - Title of the discussion post
//   replyBody    - The trainer's reply text
// ---------------------------------------------------------------------------
async function sendDiscussionReplyEmail(toEmail, studentName, postTitle, replyBody) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: `Your Discussion Post Received a Reply — Acadeno LMS`,
    text: `Hi ${studentName},\n\nYour discussion post "${postTitle}" has received a reply from your trainer:\n\n"${replyBody}"\n\nLog in to view and continue the conversation.\n\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#1e3a5f;margin-bottom:8px">Trainer Reply on Your Post</h2>
        <p style="color:#475569">Hi <strong>${studentName}</strong>,</p>
        <p style="color:#475569">Your trainer has replied to your discussion post <strong>"${postTitle}"</strong>:</p>
        <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:12px 16px;margin:16px 0;border-radius:4px">
          <p style="color:#1e293b;margin:0">${replyBody}</p>
        </div>
        <p style="color:#475569">Log in to view the full thread and continue the conversation.</p>
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
  // EPIC-05
  sendTranscodeFailureEmail,
  sendTaskEvaluationEmail,
  sendLiveSessionReminderEmail,
  // EPIC-06
  sendCertificateEmail,
  sendDiscussionReplyEmail,
};
