require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

/**
 * US-NOT-02: Robust retry mechanism for transactional emails.
 * Retries up to 3 times with a 10s delay.
 */
async function sendWithRetry(mailOptions, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            return info;
        } catch (err) {
            console.error(`[EMAIL RETRY] Attempt ${attempt} failed:`, err.message);
            if (attempt === retries) {
                // Final failure: notify ops team
                await notifyOpsOfEmailFailure(err, mailOptions);
                throw err;
            }
            // Delay before next attempt
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

/**
 * US-NOT-02: Alert operations team on final failure.
 */
async function notifyOpsOfEmailFailure(error, mailOptions) {
    const opsEmail = process.env.EMAIL_USER; // Fallback to system email
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: opsEmail,
            subject: 'CRITICAL: Transactional Email Delivery Failure',
            text: `A critical transactional email failed all 3 delivery attempts.\n\nError: ${error.message}\nTarget: ${mailOptions.to}\nSubject: ${mailOptions.subject}\n\nPlease check the system logs immediately.`,
        });
    } catch (opsErr) {
        console.error('[OPS ALERT FAILED] Total communication breakdown:', opsErr.message);
    }
}

async function sendOTPEmail(toEmail, otp, purpose) {
  const subjects = {
    reset: 'Your Password Reset OTP - Acadeno LMS',
    mfa: 'Your Login Verification Code - Acadeno LMS',
  };

  const messages = {
    reset: `Your password reset OTP is: ${otp}\n\nThis code is valid for 10 minutes.\nIf you did not request this, ignore this email.`,
    mfa: `Your login verification code is: ${otp}\n\nThis code is valid for 10 minutes.\nIf you did not attempt to login, secure your account immediately.`,
  };

  await sendWithRetry({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: subjects[purpose],
    text: messages[purpose],
  });
}

async function sendLockoutEmail(toEmail, lockedUntil) {
  await sendWithRetry({
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

/**
 * US-NOT-04: BDA Lead Follow-Up Reminder Email
 */
async function sendFollowUpReminderEmail(toEmail, bdaName, leadInfo) {
    const { leadName, lastNote, daysSinceContact, leadLink, isEscalation } = leadInfo;
    const strSubject = isEscalation 
        ? `🚨 SECOND REMINDER: Follow-up required for ${leadName}`
        : `📅 Follow-up Reminder: ${leadName}`;

    await sendWithRetry({
        from:    process.env.EMAIL_FROM,
        to:      toEmail,
        subject: strSubject,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #2563eb;border-radius:12px">
                <h2 style="color:#1e3a5f">Lead Follow-Up Reminder</h2>
                <p>Hi <strong>${bdaName}</strong>,</p>
                <p>This is an automated reminder to follow up with <strong>${leadName}</strong>.</p>
                
                <div style="background:#f8fafc;padding:20px;border-radius:8px;margin:24px 0;border-left:4px solid #2563eb">
                    <p style="margin:4px 0;color:#475569"><strong>Last Interaction Note:</strong><br>
                    <span style="font-style:italic">"${lastNote || 'No notes yet'}"</span></p>
                    <p style="margin:12px 0 0 0;color:#475569"><strong>Days since last contact:</strong> ${daysSinceContact || 'N/A'}</p>
                </div>

                <div style="text-align:center;margin:32px 0">
                    <a href="${leadLink}" style="padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">
                        View Lead Details
                    </a>
                </div>

                ${isEscalation ? `
                <div style="background:#fef2f2;padding:12px;border-radius:6px;border:1px solid #fee2e2;color:#991b1b;font-size:13px">
                    <strong>Note:</strong> This is a secondary reminder. No action was detected since the initial follow-up date 3 days ago.
                </div>
                ` : ''}

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
                <p style="color:#94a3b8;font-size:12px">Acadeno CRM — BDA Support Service</p>
            </div>`
    });
}

// ---------------------------------------------------------------------------
// sendWelcomeCredentialsEmail
// ---------------------------------------------------------------------------
// Sent after the registration wizard is submitted successfully.
// Delivers the student's login email and the system-generated plain-text password.
// ---------------------------------------------------------------------------
async function sendWelcomeCredentialsEmail(toEmail, studentName, plainPassword, loginUrl) {
  await sendWithRetry({
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
  await sendWithRetry({
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
  await sendWithRetry({
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
  await sendWithRetry({
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
  await sendWithRetry({
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

  await sendWithRetry({
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
  await sendWithRetry({
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
  await sendWithRetry({
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
  await sendWithRetry({
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

// ---------------------------------------------------------------------------
// sendBatchAssignmentEmail (US-TR-08)
// ---------------------------------------------------------------------------
// Business intent: Notify a trainer when they are assigned to a new batch.
// Includes critical dates, schedules, and a direct dashboard link.
// ---------------------------------------------------------------------------
async function sendBatchAssignmentEmail({ toEmail, trainerName, batchName, courseName, startDate, schedule, studentCount, dashboardUrl }) {
  await sendWithRetry({
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: `New Batch Assigned: ${batchName} — Acadeno LMS`,
    text: `Hi ${trainerName},\n\nYou have been assigned to a new batch: "${batchName}" for "${courseName}".\n\nStart Date: ${startDate}\nSchedule: ${schedule}\nEnrolled Students: ${studentCount}\n\nYou can access the batch dashboard here:\n${dashboardUrl}\n\nGood luck with your new sessions!\nThe Acadeno Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #2563eb;border-radius:12px">
        <h2 style="color:#2563eb;margin-bottom:8px">New Batch Assignment</h2>
        <p style="color:#475569">Hi <strong>${trainerName}</strong>,</p>
        <p style="color:#475569">You have been assigned to a new responsibilty as a trainer for the following batch:</p>
        
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;overflow:hidden">
          <tr><td style="padding:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Batch Name</td><td style="padding:12px;font-weight:700;color:#1e293b;border-bottom:1px solid #e2e8f0">${batchName}</td></tr>
          <tr><td style="padding:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Course</td><td style="padding:12px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">${courseName}</td></tr>
          <tr><td style="padding:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Start Date</td><td style="padding:12px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">${startDate}</td></tr>
          <tr><td style="padding:12px;color:#64748b;border-bottom:1px solid #e2e8f0">Schedule</td><td style="padding:12px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">${schedule}</td></tr>
          <tr><td style="padding:12px;color:#64748b">Students</td><td style="padding:12px;font-weight:600;color:#1e293b">${studentCount}</td></tr>
        </table>

        <div style="text-align:center;margin:24px 0">
           <a href="${dashboardUrl}" style="padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">
             Open Batch Dashboard
           </a>
        </div>
        
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
  // US-TR-08
  sendBatchAssignmentEmail,
  // US-NOT-02
  sendInvoiceEmail,
  sendStudentBatchAssignmentEmail,
  sendAtRiskStudentEmail,
  sendAtRiskTrainerSummaryEmail,
  sendBatchStartReminderEmail
};


/**
 * US-NOT-03: At-Risk Student Encouragement Email
 */
async function sendAtRiskStudentEmail(toEmail, studentName, courseName, stats) {
    const { completionPct, overdueCount } = stats;
    await sendWithRetry({
        from:    process.env.EMAIL_FROM,
        to:      toEmail,
        subject: `Checking In: Your Progress in ${courseName} — Acadeno LMS`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #f59e0b;border-radius:12px">
                <h2 style="color:#1e3a5f">Hi ${studentName},</h2>
                <p style="color:#475569;font-size:16px;line-height:1.5">We noticed you've been having a bit of trouble keeping up with <strong>${courseName}</strong> lately. Don't worry, we're here to help you get back on track!</p>
                
                <div style="background:#fff7ed;padding:20px;border-radius:8px;margin:24px 0;border-left:4px solid #f59e0b">
                    <h3 style="margin:0 0 12px 0;color:#9a3412;font-size:14px;text-transform:uppercase;letter-spacing:1px">Current Status</h3>
                    <p style="margin:4px 0;color:#475569"><strong>Completion:</strong> ${completionPct}%</p>
                    <p style="margin:4px 0;color:#475569"><strong>Overdue Tasks:</strong> ${overdueCount}</p>
                </div>

                <p style="color:#475569">Consistency is key to mastering new skills. If you're finding the material challenging or need more time, please reach out to your trainer. They're happy to support you!</p>
                
                <div style="text-align:center;margin:32px 0">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">
                        Continue Learning
                    </a>
                </div>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
                <p style="color:#94a3b8;font-size:12px">Keep going! Every small step counts towards your goal.<br>Acadeno Learning Management System</p>
            </div>`
    });
}

/**
 * US-NOT-03: Trainer Summary of At-Risk Students
 */
async function sendAtRiskTrainerSummaryEmail(toEmail, trainerName, batchName, atRiskStudents) {
    const studentRows = atRiskStudents.map(s => `
        <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:12px;color:#1e293b;font-weight:500">${s.name}</td>
            <td style="padding:12px;color:#475569">${s.completionPct}%</td>
            <td style="padding:12px;color:#ef4444;font-weight:600">${s.overdueCount}</td>
        </tr>
    `).join('');

    await sendWithRetry({
        from:    process.env.EMAIL_FROM,
        to:      toEmail,
        subject: `Action Required: At-Risk Students in Batch ${batchName} — Acadeno LMS`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;border:1px solid #ef4444;border-radius:12px">
                <h2 style="color:#1e3a5f">At-Risk Student Alert</h2>
                <p>Hi <strong>${trainerName}</strong>,</p>
                <p>The following students in your batch <strong>${batchName}</strong> have fallen below the progress threshold (< 40% completion or 3+ overdue tasks) as of today.</p>
                
                <table style="width:100%;border-collapse:collapse;margin:24px 0">
                    <thead>
                        <tr style="background:#fef2f2;text-align:left">
                            <th style="padding:12px;color:#991b1b;font-size:13px">Student Name</th>
                            <th style="padding:12px;color:#991b1b;font-size:13px">Completion</th>
                            <th style="padding:12px;color:#991b1b;font-size:13px">Overdue Tasks</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${studentRows}
                    </tbody>
                </table>

                <p style="color:#475569">We recommend reaching out to these students individually to offer support and ensure they don't fall further behind.</p>
                
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
                <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System — Trainer Reporting Service</p>
            </div>`
    });
}

/**
 * US-NOT-02: Payment Invoice Email
 */
async function sendInvoiceEmail(toEmail, studentName, amount, courseName, invoiceId) {
    await sendWithRetry({
        from:    process.env.EMAIL_FROM,
        to:      toEmail,
        subject: `Payment Invoice — #${invoiceId} — Acadeno LMS`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
                <h2 style="color:#1e3a5f">Payment Invoice</h2>
                <p>Hi <strong>${studentName}</strong>,</p>
                <p>Thank you for your payment. Here is your transaction summary:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0">
                    <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:10px;color:#64748b">Invoice ID</td><td style="padding:10px;font-weight:600">#${invoiceId}</td></tr>
                    <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:10px;color:#64748b">Course</td><td style="padding:10px;font-weight:600">${courseName}</td></tr>
                    <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:10px;color:#64748b">Amount Paid</td><td style="padding:10px;font-weight:600;color:#16a34a">₹${amount}</td></tr>
                    <tr><td style="padding:10px;color:#64748b">Date</td><td style="padding:10px;font-weight:600">${new Date().toLocaleDateString()}</td></tr>
                </table>
                <p style="color:#64748b;font-size:13px">This is a system-generated invoice for your records.</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
                <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
            </div>`
    });
}

/**
 * US-NOT-02: Student Batch Assignment Alert
 */
async function sendStudentBatchAssignmentEmail(toEmail, studentName, batchName, courseName, trainerName) {
    await sendWithRetry({
        from:    process.env.EMAIL_FROM,
        to:      toEmail,
        subject: `Success: Trainer Assigned to Your Batch — Acadeno LMS`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #2563eb;border-radius:12px">
                <h2 style="color:#2563eb">Trainer Assigned!</h2>
                <p>Hi <strong>${studentName}</strong>,</p>
                <p>We are excited to announce that a trainer has been assigned to your batch at Acadeno.</p>
                <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0">
                    <p style="margin:4px 0"><strong>Batch:</strong> ${batchName}</p>
                    <p style="margin:4px 0"><strong>Course:</strong> ${courseName}</p>
                    <p style="margin:4px 0"><strong>Trainer:</strong> ${trainerName}</p>
                </div>
                <p>You can now view your schedule and session links in your student dashboard.</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
                <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System</p>
            </div>`
    });
}

/**
 * US-NOT-05: Batch Start Reminder Email
 */
async function sendBatchStartReminderEmail(toEmail, userName, batchInfo) {
    const { batchName, courseName, startDate, startTime, schedule, meetingUrl } = batchInfo;
    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

    await sendWithRetry({
        from:    process.env.EMAIL_FROM,
        to:      toEmail,
        subject: `Reminder: Your Batch "${batchName}" Starts in 48 Hours!`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #16a34a;border-radius:12px">
                <h2 style="color:#1e3a5f">Get Ready to Start!</h2>
                <p>Hi <strong>${userName}</strong>,</p>
                <p>This is a friendly reminder that your batch <strong>${batchName}</strong> for <strong>${courseName}</strong> is scheduled to begin in 48 hours.</p>
                
                <div style="background:#f0fdf4;padding:20px;border-radius:8px;margin:24px 0;border-left:4px solid #16a34a">
                    <p style="margin:4px 0;color:#166534"><strong>Start Date:</strong> ${startDate}</p>
                    <p style="margin:4px 0;color:#166534"><strong>Time:</strong> ${startTime || 'To be announced'}</p>
                    <p style="margin:4px 0;color:#166534"><strong>Schedule:</strong> ${schedule}</p>
                </div>

                ${meetingUrl ? `
                <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #e2e8f0;text-align:center">
                    <p style="margin:0 0 12px 0;font-size:14px;color:#64748b">Session Link:</p>
                    <a href="${meetingUrl}" style="color:#2563eb;font-weight:700;word-break:break-all">${meetingUrl}</a>
                </div>
                ` : `
                <p style="color:#64748b;font-size:13px;font-style:italic">The meeting link will be shared via your dashboard before the session begins.</p>
                `}

                <div style="text-align:center;margin:32px 0">
                    <a href="${dashboardUrl}" style="padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">
                        Go to Dashboard
                    </a>
                </div>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
                <p style="color:#94a3b8;font-size:12px">Acadeno Learning Management System — Student Success Service</p>
            </div>`
    });
}
