const { sendTicketEmail: sendResend, isResendConfigured } = require('./resendEmailService');
const nodemailer = require('nodemailer');
require('dotenv').config({ quiet: true });

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendTicketEmail(toEmail, subject, userName, attachments) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isResendConfigured()) {
    try {
      console.log('📧 Sending via Resend...');
      return await sendResend(toEmail, subject, userName, attachments);
    } catch (error) {
      console.warn('⚠️ Resend failed, error:', error.message);
      
      // In production, throw error if email fails
      if (isProduction) {
        throw new Error(`Email service failed in production: ${error.message}`);
      }
      
      // If SMTP is not configured either, just log and return mock success for development
      if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('📧 SMTP not configured either. Returning mock success for development.');
        return { 
          success: true, 
          mock: true, 
          message: 'Email sending failed but mock success returned for development',
          originalError: error.message 
        };
      }
      
      console.log('📧 Falling back to Nodemailer...');
    }
  } else {
    console.log('📧 Resend not configured, checking SMTP...');
    
    // If neither Resend nor SMTP is configured, return mock success
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('📧 No email service configured. Returning mock success for development.');
      return { 
        success: true, 
        mock: true, 
        message: 'No email service configured but mock success returned for development' 
      };
    }
  }
  
  console.log('📧 Sending via Nodemailer...');
  const htmlContent = `<div><h2>Malang Ras Dandiya Night</h2><p>Hi ${userName}</p><p>Email sent successfully!</p></div>`;
  
  return await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: subject,
    html: htmlContent,
    attachments: attachments
  });
}

module.exports = { sendTicketEmail };
