import nodemailer from "nodemailer";

export function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM_ADDRESS
  );
}

export function getSmtpTransporter() {
  if (!hasSmtpConfig()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const transporter = getSmtpTransporter();
  if (!transporter) return { sent: false, reason: "SMTP not configured" };

  await transporter.sendMail({
    from: process.env.SMTP_FROM_ADDRESS!,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  return { sent: true as const };
}

