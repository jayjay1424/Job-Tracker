const nodemailer = require('nodemailer');

/**
 * Creates an SMTP or Gmail transporter if environment variables are provided.
 */
function createTransporter() {
  if (process.env.GMAIL_USER && (process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD)) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD
      }
    });
  }

  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 587;
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || ''
      } : undefined
    });
  }

  return null;
}

/**
 * Sends an email via Resend REST API if RESEND_API_KEY is present.
 */
async function sendViaResend({ to, subject, html, text }) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;

  const from = process.env.EMAIL_FROM || 'Job Tracker <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    })
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${errorText}`);
  }

  return await res.json().catch(() => ({ id: 'ok' }));
}

/**
 * Dispatches a password reset email to the specified recipient.
 *
 * Checks in order:
 * 1. Resend API (RESEND_API_KEY)
 * 2. SMTP / Gmail (SMTP_HOST or GMAIL_USER)
 *
 * If neither is configured, returns { success: false, reason: 'NO_TRANSPORT' }.
 */
async function sendPasswordResetEmail({ to, resetLink }) {
  const subject = 'Reset your Job Tracker password';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reset your Job Tracker password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .brand { font-size: 20px; font-weight: 700; color: #4f46e5; margin-bottom: 24px; display: inline-block; text-decoration: none; }
    h1 { font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 18px 0; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-weight: 600; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2); }
    .btn:hover { background-color: #4338ca; }
    .fallback { font-size: 13px; color: #64748b; word-break: break-all; margin-top: 24px; padding-top: 20px; border-top: 1px solid #f1f5f9; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">🎯 Job Application Tracker</div>
    <h1>Reset your password</h1>
    <p>We received a request to reset the password for your Job Tracker account.</p>
    <p>Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.</p>
    
    <div class="btn-container">
      <a href="${resetLink}" class="btn" target="_blank" rel="noopener">Reset My Password</a>
    </div>

    <p style="font-size: 13px; color: #64748b;">If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.</p>

    <div class="fallback">
      <p style="margin-bottom: 6px;"><strong>Button not working?</strong> Copy and paste this link into your browser:</p>
      <a href="${resetLink}" style="color: #4f46e5;">${resetLink}</a>
    </div>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Job Tracker • All rights reserved.
  </div>
</body>
</html>
  `.trim();

  const text = `
Reset your Job Tracker password

We received a request to reset the password for your Job Tracker account.
Please visit the link below to choose a new password (valid for 1 hour):

${resetLink}

If you did not request this, you can safely ignore this email.
  `.trim();

  // 1. Try Resend if configured
  if (process.env.RESEND_API_KEY) {
    try {
      const result = await sendViaResend({ to, subject, html, text });
      console.log(`[mailer] Sent password reset email via Resend to ${to}`);
      return { success: true, provider: 'resend', result };
    } catch (err) {
      console.error('[mailer] Failed to send via Resend:', err.message);
    }
  }

  // 2. Try Nodemailer / SMTP / Gmail if configured
  const transporter = createTransporter();
  if (transporter) {
    try {
      const from = process.env.EMAIL_FROM || process.env.GMAIL_USER || process.env.SMTP_USER || 'no-reply@jobtracker.app';
      const info = await transporter.sendMail({
        from: `"Job Tracker" <${from}>`,
        to,
        subject,
        text,
        html
      });
      console.log(`[mailer] Sent password reset email via SMTP/Gmail to ${to} (id: ${info.messageId})`);
      return { success: true, provider: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error('[mailer] Failed to send via SMTP/Gmail:', err.message);
    }
  }

  console.warn('[mailer] No email transport configured (RESEND_API_KEY or SMTP_HOST/GMAIL_USER). Using direct fallback link.');
  return { success: false, reason: 'NO_TRANSPORT' };
}

module.exports = {
  sendPasswordResetEmail,
  createTransporter
};

