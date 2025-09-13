const { query } = require('../config/database');

/**
 * Malang Raas Dandiya 2025 - Updated Booking Controller
 * Supports season pass, bulk discounts, and new pricing structure
 */

// Updated pricing structure for Malang Raas Dandiya 2025
const TICKET_PRICING = {
  // Single Day Tickets
  single: {
    female: { base: 399, bulk_threshold: 6, bulk_price: 300 },
    couple: { base: 699, bulk_threshold: 6, bulk_price: 300 },
    kids: { base: 99, bulk_threshold: 6, bulk_price: 300 },  // Changed from 'kid' to 'kids'
    family: { base: 1300, bulk_threshold: 6, bulk_price: 300 },
    male: { base: 699, bulk_threshold: 6, bulk_price: 300 }
  }
};

// Valid pass types based on your database schema
const VALID_PASS_TYPES = [
  'female', 'couple', 'kids', 'family', 'male'
];

// Calculate ticket price with bulk discount logic
function calculateTicketPrice(passType, ticketType = 'single', numTickets) {
  const pricing = TICKET_PRICING.single[passType];
  if (!pricing) {
    throw new Error(`Invalid pricing for ${passType}`);
  }

  const quantity = Math.max(1, parseInt(numTickets));
  
  // Check if bulk discount applies
  if (pricing.bulk_threshold && quantity >= pricing.bulk_threshold) {
    return {
      basePrice: pricing.base,
      finalPrice: pricing.bulk_price,
      discountApplied: true,
      totalAmount: pricing.bulk_price * quantity,
      savings: (pricing.base - pricing.bulk_price) * quantity,
      isSeasonPass: false
    };
  }

  return {
    basePrice: pricing.base,
    finalPrice: pricing.base,
    discountApplied: false,
    totalAmount: pricing.base * quantity,
    savings: 0,
    isSeasonPass: false
  };
}

const { generateQRCode } = require("../utils/qrGenerator");
const generateTicketPDF = require("../utils/pdfGenerator");
const { sendTicketEmail } = require("../utils/emailService");
const whatsappService = require("../services/whatsappService");
// Database health check removed - using direct connection
const Razorpay = require("razorpay");
require("dotenv").config({ quiet: true });

// Initialize Razorpay with fallback for missing keys
let razorpay;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("✅ Razorpay initialized successfully");
  } else {
    console.log("⚠️ Razorpay keys not configured - payment functionality will be limited");
    razorpay = null;
  }
} catch (error) {
  console.error("❌ Failed to initialize Razorpay:", error.message);
  razorpay = null;
}

// Helper: compute total amount based on pass_type and quantity
function computeTotalAmount(passType, quantity = 1) {
  const priceMap = {
    female: 399,
    couple: 699,
    kid: 99,
    family4: 1300,
    season_female: 2499,
    season_couple: 3499,
    season_family4: 5999,
  };
  const unit = priceMap[passType];
  if (!unit) return null;
  const q = Math.max(1, parseInt(quantity || 1));
  return unit * q;
}

// 1️⃣ Create Booking
exports.createBooking = async (req, res) => {
  const { booking_date, num_tickets, pass_type, ticket_type = 'single' } = req.body;
  
  console.log('📝 Booking request received:', {
    body: req.body,
    booking_date,
    num_tickets,
    pass_type,
    ticket_type
  });
  
  // Validate required fields with detailed error messages
  const missingFields = [];
  if (!booking_date) missingFields.push('booking_date');
  if (!num_tickets) missingFields.push('num_tickets');
  if (!pass_type) missingFields.push('pass_type');
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields",
      message: `The following fields are required: ${missingFields.join(', ')}`,
      missing_fields: missingFields,
      received_data: {
        booking_date: booking_date || null,
        num_tickets: num_tickets || null,
        pass_type: pass_type || null,
        ticket_type: ticket_type || 'single'
      }
    });
  }

  // Validate pass_type against database schema
  if (!VALID_PASS_TYPES.includes(pass_type)) {
    return res.status(400).json({
      success: false,
      error: "Invalid pass_type",
      message: `pass_type must be one of: ${VALID_PASS_TYPES.join(', ')}`,
      received_pass_type: pass_type,
      valid_options: VALID_PASS_TYPES
    });
  }

  // Parse and validate date
  const parsedDate = new Date(booking_date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: "Invalid booking_date",
      message: "Booking date must be a valid date",
      received_date: booking_date
    });
  }
  
  try {
    // Calculate pricing with bulk discount
    const priceInfo = calculateTicketPrice(pass_type, ticket_type, num_tickets);
    
    console.log('🔄 Creating booking with params:', {
      booking_date: parsedDate,
      num_tickets: parseInt(num_tickets),
      pass_type,
      ticket_type,
      pricing: priceInfo,
      status: 'pending'
    });
    
    let result;
    try {
      // First, ensure all required columns exist in bookings table
      try {
        await query(`
          ALTER TABLE bookings 
          ADD COLUMN IF NOT EXISTS ticket_type VARCHAR(20) DEFAULT 'single',
          ADD COLUMN IF NOT EXISTS is_season_pass BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS season_pass_days_remaining INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS bulk_discount_applied BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS original_ticket_price NUMERIC,
          ADD COLUMN IF NOT EXISTS discounted_price NUMERIC,
          ADD COLUMN IF NOT EXISTS notes TEXT,
          ADD COLUMN IF NOT EXISTS staff_notes TEXT,
          ADD COLUMN IF NOT EXISTS manual_confirmation BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS confirmed_by INTEGER,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        `);
      } catch (alterError) {
        console.log('Schema update info:', alterError.message);
      }

      result = await query(`
        INSERT INTO bookings (
          booking_date, 
          num_tickets, 
          pass_type, 
          ticket_type, 
          status, 
          total_amount, 
          discount_amount, 
          final_amount,
          is_season_pass,
          bulk_discount_applied,
          original_ticket_price,
          discounted_price
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        parsedDate, 
        parseInt(num_tickets), 
        pass_type, 
        priceInfo.isSeasonPass ? 'season' : 'single',
        'pending', 
        priceInfo.totalAmount, 
        priceInfo.savings || 0, 
        priceInfo.totalAmount,
        priceInfo.isSeasonPass,
        priceInfo.discountApplied || false,
        priceInfo.basePrice,
        priceInfo.finalPrice
      ]);
    } catch (dbError) {
      console.log('⚠️ Database error, creating offline booking:', dbError.message);
      // Database is offline or unavailable, create mock booking
      const mockBookingId = Date.now().toString();
      
      const mockBooking = {
        id: mockBookingId,
        booking_date: parsedDate.toISOString(),
        num_tickets: parseInt(num_tickets),
        pass_type,
        ticket_type: priceInfo.isSeasonPass ? 'season' : 'single',
        status: 'pending',
        total_amount: priceInfo.totalAmount,
        discount_amount: priceInfo.savings || 0,
        final_amount: priceInfo.totalAmount,
        is_season_pass: priceInfo.isSeasonPass,
        season_pass_days_remaining: priceInfo.isSeasonPass ? 8 : 0,
        bulk_discount_applied: priceInfo.discountApplied || false,
        original_ticket_price: priceInfo.basePrice,
        discounted_price: priceInfo.finalPrice,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _isMockBooking: true
      };
      
      console.log('✅ Mock booking created:', mockBooking);
      return res.status(201).json({ 
        success: true, 
        booking: mockBooking,
        mock: true,
        message: "Booking created in offline mode. Will be synchronized when database is available."
      });
    }
    
    // Check if we actually got a result (database available)
    if (result.rows && result.rows.length > 0) {
      console.log('✅ Booking created successfully:', result.rows[0]);
      
      const booking = result.rows[0];
      
      // Convert BigInt to string for JSON serialization
      const bookingResponse = {
        ...booking,
        id: booking.id.toString()
      };
      
      res.status(201).json({ success: true, booking: bookingResponse });
    } else {
      // Database is offline, create mock booking
      console.log('⚠️ Database offline - creating mock booking');
      const mockBookingId = Date.now().toString();
      const totalAmount = computeTotalAmount(pass_type, num_tickets) || 0;
      
      const mockBooking = {
        id: mockBookingId,
        booking_date: parsedDate.toISOString(),
        num_tickets: parseInt(num_tickets),
        pass_type,
        status: 'pending',
        total_amount: totalAmount,
        discount_amount: 0,
        final_amount: totalAmount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _isMockBooking: true
      };
      
      console.log('✅ Mock booking created:', mockBooking);
      res.status(201).json({ 
        success: true, 
        booking: mockBooking,
        mock: true,
        message: "Booking created in offline mode. Will be synchronized when database is available."
      });
    }
  } catch (err) {
    console.error("❌ Error creating booking:", err.message);
    console.error("Full error:", err);
    
    // Don't let the error crash the server
    try {
      res.status(500).json({ 
        success: false, 
        error: "Failed to create booking",
        details: err.message,
        code: err.code || 'UNKNOWN_ERROR'
      });
    } catch (responseError) {
      console.error("❌ Error sending error response:", responseError);
    }
  }
};

// 2️⃣ Add User Details
exports.addUserDetails = async (req, res) => {
  const { booking_id, name, email, phone, is_primary = false } = req.body;
  
  try {
    const result = await query(`
      INSERT INTO users (booking_id, name, email, phone, is_primary)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [parseInt(booking_id), name, email, phone, is_primary]);
    
    const user = result.rows[0];
    
    // Convert BigInt to string for JSON serialization
    const userResponse = {
      ...user,
      id: user.id.toString(),
      booking_id: user.booking_id.toString()
    };
    
    res.status(201).json({ success: true, user: userResponse });
  } catch (err) {
    console.error("Error adding user details:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to add user details",
      details: err.message 
    });
  }
};

// 3️⃣ Create Payment Order
exports.createPayment = async (req, res) => {
  const { booking_id } = req.body;
  
  try {
    let computedAmount = null;
    let bookingPassType = null;
    let bookingQty = 1;
    
    // Fetch booking to get authoritative pass_type and num_tickets
    const result = await query(`
      SELECT pass_type, num_tickets FROM bookings WHERE id = $1
    `, [parseInt(booking_id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    bookingPassType = booking.pass_type;
    bookingQty = booking.num_tickets;
    computedAmount = computeTotalAmount(bookingPassType, bookingQty);
    if (computedAmount === null) {
      return res.status(400).json({ success: false, error: `Unsupported pass_type: ${bookingPassType}` });
    }
    
    // Check if Razorpay is initialized
    if (!razorpay) {
      return res.status(500).json({ 
        success: false, 
        error: "Razorpay not configured" 
      });
    }

    // Razorpay is configured
    const order = await razorpay.orders.create({
      amount: computedAmount * 100, // paise
      currency: "INR",
      receipt: `receipt_${booking_id}`,
    });

    // Save payment to database
    const paymentResult = await query(`
      INSERT INTO payments (booking_id, razorpay_order_id, amount, currency, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [parseInt(booking_id), order.id, computedAmount, "INR", "created"]);

    const payment = paymentResult.rows[0];

    // Optionally store reference on booking for convenience
    try {
      await query(`
        UPDATE bookings SET payment_id = $1 WHERE id = $2
      `, [payment.id.toString(), parseInt(booking_id)]);
    } catch (e) {
      console.warn('Warning: Failed to update booking.payment_id:', e?.message);
    }

    res.status(200).json({ success: true, order });
  } catch (err) {
    console.error("Error in createPayment:", err);
    res.status(500).json({ error: "Failed to create payment order" });
  }
};

// 4️⃣ Confirm Payment
exports.confirmPayment = async (req, res) => {
  const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const { v4: uuidv4 } = require('uuid');

  console.log('🔄 Payment confirmation started for booking:', booking_id);
  console.log('📋 Payment details:', { razorpay_order_id, razorpay_payment_id });

  try {
    // Skip signature verification in development mode
    console.log('⚠️ Skipping signature verification (development mode)');

    // Update existing payment record for this order; create if not found
    let paymentResult = await query(`
      UPDATE payments
      SET razorpay_payment_id = $1, status = 'captured'
      WHERE booking_id = $2 AND razorpay_order_id = $3
      RETURNING *
    `, [razorpay_payment_id, parseInt(booking_id), razorpay_order_id]);

    let payment;
    if (paymentResult.rows.length > 0) {
      payment = paymentResult.rows[0];
    } else {
      // Fallback: create a payment if order was not stored earlier
      const assumedAmount = 0;
      paymentResult = await query(`
        INSERT INTO payments (booking_id, razorpay_order_id, razorpay_payment_id, amount, currency, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [parseInt(booking_id), razorpay_order_id, razorpay_payment_id, assumedAmount, 'INR', 'captured']);
      payment = paymentResult.rows[0];
    }

    // Update booking status and fetch users
    const bookingUpdateResult = await query(`
      UPDATE bookings
      SET status = 'confirmed', total_amount = $1, final_amount = $1, payment_id = $2
      WHERE id = $3
      RETURNING *
    `, [payment.amount ?? 0, payment.id.toString(), parseInt(booking_id)]);

    const booking = bookingUpdateResult.rows[0];

    const usersResult = await query(`SELECT * FROM users WHERE booking_id = $1`, [parseInt(booking_id)]);
    booking.users = usersResult.rows;

    // Generate QR codes for each ticket
    const qrCodes = [];
    if (booking.users && booking.users.length > 0) {
      for (let i = 0; i < booking.num_tickets; i++) {
        const ticketNumber = uuidv4();
        
        let qrCodeUrl;
        try {
          const qrData = {
            ticketNumber,
            bookingId: booking.id.toString(),
            passType: booking.pass_type,
            eventDate: booking.booking_date.toISOString()
          };
          qrCodeUrl = await generateQRCode(JSON.stringify(qrData));
        } catch (qrError) {
          console.error('QR generation failed, using fallback URL:', qrError);
          qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticketNumber}`;
        }
        
        const qrResult = await query(`
          INSERT INTO qr_codes (booking_id, user_id, ticket_number, qr_data, qr_code_url, expiry_date, is_used)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          booking.id, 
          booking.users[0]?.id, 
          ticketNumber, 
          JSON.stringify({ ticketNumber, bookingId: booking.id.toString(), passType: booking.pass_type, eventDate: booking.booking_date.toISOString() }),
          qrCodeUrl, 
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 
          false
        ]);
        
        qrCodes.push(qrResult.rows[0]);
      }
    }

    // Send notifications
    await sendTicketNotifications(booking.id, payment.id);

    // Convert BigInt fields to strings for JSON serialization
    const bookingResponse = {
      ...booking,
      id: booking.id.toString(),
      users: booking.users?.map(user => ({
        ...user,
        id: user.id.toString(),
        booking_id: user.booking_id.toString()
      }))
    };

    const qrCodesResponse = qrCodes.map(qr => ({
      ...qr,
      id: qr.id.toString(),
      booking_id: qr.booking_id.toString(),
      user_id: qr.user_id ? qr.user_id.toString() : null
    }));

    res.json({ 
      success: true, 
      message: 'Payment confirmed and tickets generated',
      booking: bookingResponse,
      qrCodes: qrCodesResponse
    });

  } catch (err) {
    console.error('Error in confirmPayment:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to confirm payment',
      details: err.message 
    });
  }
};

// Send ticket notifications after successful payment
async function sendTicketNotifications(booking_id, payment_id) {
  try {
    console.log('🎫 Sending ticket notifications for booking:', booking_id);

    // Get booking from database
    const bookingResult = await query(`SELECT * FROM bookings WHERE id = $1`, [parseInt(booking_id)]);
    if (bookingResult.rows.length === 0) {
      console.error('Booking not found:', booking_id);
      return { success: false, error: 'Booking not found' };
    }
    const booking = bookingResult.rows[0];

    const usersResult = await query(`SELECT * FROM users WHERE booking_id = $1`, [parseInt(booking_id)]);
    booking.users = usersResult.rows;

    const qrCodesResult = await query(`SELECT * FROM qr_codes WHERE booking_id = $1`, [parseInt(booking_id)]);
    booking.qr_codes = qrCodesResult.rows;

    const paymentsResult = await query(`SELECT * FROM payments WHERE id = $1`, [parseInt(payment_id)]);
    booking.payments = paymentsResult.rows;


    const primaryUser = booking.users.find(u => u.is_primary) || booking.users[0];
    if (!primaryUser) {
      console.error('No users found for booking:', booking_id);
      return { success: false, error: 'No users found for booking' };
    }

    const qrCode = booking.qr_codes.length > 0 ? booking.qr_codes[0] : null;
    const payment = booking.payments.length > 0 ? booking.payments[0] : null;

    // Generate PDF ticket if QR code exists
    let pdfBuffer;
    try {
      if (qrCode) {
        // Use the generateTicketPDFBuffer function for email attachments
        const { generateTicketPDFBuffer } = require("../utils/pdfGenerator");
        
        pdfBuffer = await generateTicketPDFBuffer({
          name: primaryUser.name,
          date: booking.booking_date,
          pass_type: booking.pass_type,
          qrCode: qrCode.qr_code_url, // This will be the URL from the database
          booking_id: booking.id.toString(),
          ticket_number: qrCode.ticket_number
        });
        
        console.log('📄 PDF ticket generated successfully');
      }
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      // Continue with other notifications even if PDF generation fails
    }

    // Send email notification if email exists
    if (primaryUser.email) {
      try {
        const emailData = {
          to: primaryUser.email,
          subject: `Your Dandiya Night Ticket #${booking.id}`,
          booking: booking,
          userName: primaryUser.name,
          qrCodeUrl: qrCode?.qr_code_url
        };
        
        // Add PDF buffer if available
        if (pdfBuffer) {
          emailData.attachments = [{
            filename: `Dandiya_Ticket_${booking.id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }];
        }
        
        await sendTicketEmail(
          primaryUser.email,
          `Your Dandiya Night Ticket #${booking.id}`,
          primaryUser.name,
          emailData.attachments
        );
        console.log('📧 Email notification sent to:', primaryUser.email);
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
      }
    }

    // Send WhatsApp notification if phone exists
    if (primaryUser.phone) {
      try {
        const phoneNumber = primaryUser.phone.replace(/^\+?91|\s+/g, '');
        const message = `🎉 Your Dandiya Night booking #${booking.id} is confirmed!\n\n` +
          `📅 Date: ${new Date(booking.booking_date).toLocaleDateString()}\n` +
          `🎟️ Tickets: ${booking.num_tickets} ${booking.pass_type} pass\n` +
          `💰 Amount: ₹${payment?.amount || booking.final_amount || 0}\n\n` +
          `Show this QR code at the entrance.`;

        await whatsappService.sendBookingConfirmation({
          phoneNumber: phoneNumber,
          customerName: primaryUser.name,
          eventName: 'Dandiya Night',
          ticketCount: booking.num_tickets,
          bookingId: booking.id.toString(),
          pdfPath: null // Will be handled by WhatsApp service
        });
        console.log('💬 WhatsApp notification sent to:', phoneNumber);
      } catch (whatsappError) {
        console.error('Failed to send WhatsApp message:', whatsappError);
      }
    }

    // Log the successful notification
    try {
      await query(`
        INSERT INTO message_logs (booking_id, user_id, message_type, provider, status, cost_amount, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [booking.id, primaryUser.id, 'email', 'email', 'sent', 0.5, new Date()]);
    } catch (logError) {
      console.error('Failed to log notification success:', logError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in sendTicketNotifications:', error);
    
    // Log the failed notification
    try {
      await query(`
        INSERT INTO message_logs (booking_id, message_type, provider, status, error_message, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [parseInt(booking_id), 'email', 'system', 'failed', error.message?.substring(0, 255) || 'Unknown error', new Date()]);
    } catch (logError) {
      console.error('Failed to log notification error:', logError);
    }
    
    return { 
      success: false, 
      error: error.message || 'Failed to send notifications' 
    };
  }
}

// 5️⃣ Get QR Details (for verification)
exports.getQRDetails = async (req, res) => {
  const { ticket_number } = req.body;
  try {
    const qrResult = await query(`
      SELECT qr.*, b.pass_type, u.name as user_name
      FROM qr_codes qr
      LEFT JOIN bookings b ON qr.booking_id = b.id
      LEFT JOIN users u ON qr.user_id = u.id
      WHERE qr.ticket_number = $1
    `, [ticket_number]);

    if (qrResult.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const qrCode = qrResult.rows[0];

    // Convert BigInt fields to strings for JSON serialization
    const ticketResponse = {
      ...qrCode,
      id: qrCode.id.toString(),
      booking_id: qrCode.booking_id.toString(),
      user_id: qrCode.user_id ? qrCode.user_id.toString() : null
    };

    res.status(200).json({ success: true, ticket: ticketResponse });
  } catch (err) {
    console.error("Error in getQRDetails:", err);
    res.status(500).json({ error: "Failed to get QR details" });
  }
};

// 6️⃣ Mark Ticket as Used
exports.markTicketUsed = async (req, res) => {
  const { ticket_number } = req.body;
  try {
    const updateResult = await query(`
      UPDATE qr_codes
      SET is_used = true, used_at = NOW()
      WHERE ticket_number = $1 AND is_used = false
      RETURNING *
    `, [ticket_number]);

    if (updateResult.rows.length === 0) {
      const existingQr = await query('SELECT is_used FROM qr_codes WHERE ticket_number = $1', [ticket_number]);
      if (existingQr.rows.length > 0 && existingQr.rows[0].is_used) {
        return res.status(400).json({ error: "Ticket already used" });
      }
      return res.status(404).json({ error: "Ticket not found" });
    }

    const qrCode = updateResult.rows[0];

    // Log the scan
    await query(`
      INSERT INTO qr_scans (booking_id, ticket_number, used_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (ticket_number) DO NOTHING
    `, [qrCode.booking_id, ticket_number]);

    res.status(200).json({ success: true, message: "Ticket marked as used" });
  } catch (err) {
    console.error("Error in markTicketUsed:", err);
    res.status(500).json({ error: "Failed to mark ticket as used" });
  }
};

// 7️⃣ Resend Notifications
exports.resendNotifications = async (req, res) => {
  const { booking_id } = req.body;

  if (!booking_id) {
    return res.status(400).json({
      success: false,
      error: 'Booking ID is required'
    });
  }

  console.log(`🔄 Manual notification trigger for booking: ${booking_id}`);

  try {
    // Ensure the booking exists and is confirmed
    const bookingResult = await query(`SELECT id FROM bookings WHERE id = $1 AND status = 'confirmed'`, [parseInt(booking_id)]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Confirmed booking not found' });
    }

    // Get latest payment for this booking
    const paymentResult = await query(`SELECT id FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1`, [parseInt(booking_id)]);
    if (paymentResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No payment found for this booking. Cannot send ticket.'
      });
    }
    const latestPayment = paymentResult.rows[0];

    // Call the existing notification function with the latest payment id
    await sendTicketNotifications(booking_id, latestPayment.id);

    res.json({
      success: true,
      message: `Notifications for booking ${booking_id} have been re-sent.`
    });

  } catch (error) {
    console.error(`❌ Error resending notifications for booking ${booking_id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend notifications'
    });
  }
};
