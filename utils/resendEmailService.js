const { Resend } = require('resend');
require('dotenv').config({ quiet: true });

// Initialize Resend client with better error handling
let resend = null;
try {
  console.log('🔍 Checking Resend API key:', process.env.RESEND_API_KEY ? 'Present' : 'Missing');
  
  if (process.env.RESEND_API_KEY && 
      process.env.RESEND_API_KEY !== 'your_resend_api_key_here' && 
      process.env.RESEND_API_KEY.startsWith('re_')) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend email service initialized with API key');
  } else {
    console.log('⚠️ Resend API key not configured or invalid - using mock email service');
  }
} catch (error) {
  console.error('❌ Failed to initialize Resend:', error.message);
  resend = null;
}

function isResendConfigured() {
  return resend !== null;
}

async function sendTicketEmail(toEmail, subject, userName, attachments = []) {
  // If Resend is not configured, use mock email service for development
  if (!resend) {
    console.log('📧 Using mock email service (Resend not configured)');
    console.log(`   To: ${toEmail}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   User: ${userName}`);
    console.log(`   Attachments: ${attachments ? attachments.length : 0}`);
    
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      service: 'mock',
      message: 'Email sent via mock service - configure RESEND_API_KEY for real emails'
    };
  }

  try {
    console.log(`📧 Sending email to: ${toEmail}`);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; color: #d4af37; margin-bottom: 30px; }
          .content { color: #333; line-height: 1.6; }
          .ticket-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Malang Raas Dandiya 2025</h1>
          </div>
          <div class="content">
            <p>Dear ${userName},</p>
            <p>Thank you for booking your tickets for Malang Raas Dandiya 2025! Your booking has been confirmed.</p>
            
            <div class="ticket-info">
              <h3>📅 Event Details:</h3>
              <p><strong>Event:</strong> Malang Raas Dandiya 2025</p>
              <p><strong>Venue:</strong> Regal Lawns, Near Deolai Chowk, Beed Bypass</p>
              <p><strong>Location:</strong> Chhatrapati Sambhajinagar</p>
              <p><strong>Time:</strong> 7:00 PM onwards</p>
            </div>
            
            <p>🎫 Your e-ticket is attached to this email. Please present the QR code at the entrance for quick entry.</p>
            
            <p><strong>Important Notes:</strong></p>
            <ul>
              <li>Keep your ticket safe and bring it to the event</li>
              <li>Entry is subject to QR code verification</li>
              <li>Gates open at 7:00 PM</li>
            </ul>
            
            <p>We look forward to seeing you at the event!</p>
          </div>
          
          <div class="footer">
            <p>For any queries, contact us at admin@malangdandiya.com</p>
            <p>© 2025 Malang Raas Dandiya. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Use Resend's default domain for testing (no verification needed)
    const fromName = process.env.EMAIL_FROM_NAME || 'Malang Dandiya';
    const fromEmail = 'onboarding@resend.dev'; // Resend's default verified domain

    const emailData = {
      from: `${fromName} <${fromEmail}>`,
      to: [toEmail],
      subject: subject,
      html: htmlContent,
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      emailData.attachments = attachments;
    }

    const result = await resend.emails.send(emailData);
    
    console.log('📧 Resend API Response:', JSON.stringify(result, null, 2));
    console.log('✅ Email sent successfully via Resend:', result.data?.id || result.id || 'Email ID not available');
    return {
      success: true,
      messageId: result.data?.id || result.id,
      service: 'resend'
    };

  } catch (error) {
    console.error('❌ Resend email failed:', error);
    throw new Error(`Resend email service failed: ${error.message}`);
  }
}

module.exports = {
  sendTicketEmail,
  isResendConfigured
};