import nodemailer from 'nodemailer';
import { addNotification } from './db.js';

const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpFrom = process.env.SMTP_FROM || smtpUser;

const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
    })
  : null;

export async function sendNotification({ userId, email, subject, text }) {
  addNotification(userId, `${subject} - ${text}`);
  if (!transporter) {
    console.warn('SMTP not configured, skipping email send.');
    return;
  }
  await transporter.sendMail({
    from: smtpFrom,
    to: email,
    subject,
    text
  });
}
