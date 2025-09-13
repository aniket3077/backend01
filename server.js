const express = require("express");
const cors = require("cors");
const { testConnection } = require('./config/database');
require("dotenv").config({ quiet: true });

// Global BigInt JSON serialization fix
BigInt.prototype.toJSON = function() { return this.toString(); };

console.log("🚀 Starting Dandiya Platform Backend on Vercel...");

const app = express();

// Enhanced CORS configuration for Vercel
// Allow configuring allowed origins via env (comma-separated)
const defaultOrigins = [
  'https://malangevents.com',
  'https://www.malangevents.com',
  'http://localhost:3000', // for local development
  'http://localhost:5173'  // for Vite dev server
];
const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (like curl/postman with no Origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Enhanced JSON parsing with error handling
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid JSON format',
      message: 'Please check your request body format'
    });
  }
  
  if (!res.headersSent) {
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
});

console.log("✅ Basic Express setup complete");

// Import controllers
const bookingController = require("./controllers/bookingController");

// Import routes
try {
  const configRoutes = require("./routes/configRoutes");
  app.use("/api/config", configRoutes);
  console.log("✅ Config routes loaded");
} catch (err) {
  console.log("⚠️ Config routes not found, skipping...");
}

// Admin routes
try {
  const adminRoutes = require("./routes/adminRoutes");
  app.use("/api/admin", adminRoutes);
  console.log("✅ Admin routes loaded");
} catch (err) {
  console.log("⚠️ Admin routes not found, skipping...");
}

// Auth routes
try {
  const authRoutes = require("./routes/authRoutes");
  app.use("/api/auth", authRoutes);
  console.log("✅ Auth routes loaded");
} catch (err) {
  console.log("⚠️ Auth routes not found, skipping...");
}

// QR routes
try {
  const qrRoutes = require("./routes/qrRoutes");
  app.use("/api/qr", qrRoutes);
  console.log("✅ QR routes loaded");
} catch (err) {
  console.log("⚠️ QR routes not found, skipping...");
}

// Booking routes
const bookingRoutes = express.Router();

// Test endpoint to debug booking requests
bookingRoutes.post("/test", (req, res) => {
  res.json({
    success: true,
    message: "Booking test endpoint working",
    received_body: req.body,
    content_type: req.headers['content-type'],
    timestamp: new Date().toISOString()
  });
});

bookingRoutes.post("/create", bookingController.createBooking);
bookingRoutes.post("/add-users", bookingController.addUserDetails);
bookingRoutes.post("/create-payment", bookingController.createPayment);
bookingRoutes.post("/confirm-payment", bookingController.confirmPayment);
bookingRoutes.post("/qr-details", bookingController.getQRDetails);
bookingRoutes.post("/mark-used", bookingController.markTicketUsed);
bookingRoutes.post("/resend-notifications", bookingController.resendNotifications);

app.use("/api/bookings", bookingRoutes);
console.log("✅ Booking routes loaded");

// Database connectivity test endpoint
app.get("/api/db-test", async (req, res) => {
  try {
    const { testConnection, query } = require('./config/database');
    
    console.log('🔍 Testing database connectivity...');
    
    // Test basic connection
    const dbConnected = await testConnection();
    
    let detailedStatus = {
      basic_connection: dbConnected,
      timestamp: new Date().toISOString(),
      database_url_present: !!process.env.DATABASE_URL,
      database_url_host: null,
      query_test: null,
      error_details: null
    };
    
    if (process.env.DATABASE_URL) {
      try {
        const url = new URL(process.env.DATABASE_URL);
        detailedStatus.database_url_host = url.hostname;
        detailedStatus.database_port = url.port || '5432';
      } catch (urlError) {
        detailedStatus.database_url_error = 'Invalid DATABASE_URL format';
      }
    }
    
    // Test a simple query
    try {
      const result = await query('SELECT NOW() as current_time, version() as pg_version');
      if (result.rows && result.rows.length > 0) {
        detailedStatus.query_test = 'success';
        detailedStatus.server_time = result.rows[0].current_time;
        detailedStatus.postgres_version = result.rows[0].pg_version?.substring(0, 50) + '...';
      } else {
        detailedStatus.query_test = 'no_results';
      }
    } catch (queryError) {
      detailedStatus.query_test = 'failed';
      detailedStatus.error_details = {
        message: queryError.message,
        code: queryError.code,
        errno: queryError.errno,
        syscall: queryError.syscall,
        hostname: queryError.hostname,
        address: queryError.address
      };
    }
    
    res.json({
      database_status: dbConnected ? 'online' : 'offline',
      details: detailedStatus
    });
    
  } catch (error) {
    res.status(500).json({
      database_status: 'error',
      error: error.message,
      details: {
        timestamp: new Date().toISOString(),
        error_type: error.constructor.name
      }
    });
  }
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const { testConnection } = require('./config/database');
    const dbConnected = await testConnection();
    
    res.json({
      status: "healthy",
      message: "Dandiya Platform Backend is running on Vercel",
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV,
      platform: 'vercel',
      services: {
        database: {
          connected: dbConnected,
          status: dbConnected ? 'operational' : 'offline'
        },
        whatsapp_aisensy: {
          configured: !!process.env.AISENSY_API_KEY,
          api_key_present: !!process.env.AISENSY_API_KEY
        },
        email_resend: {
          configured: !!process.env.RESEND_API_KEY,
          api_key_present: !!process.env.RESEND_API_KEY
        },
        payment_razorpay: {
          configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
          test_mode: process.env.RAZORPAY_KEY_ID?.includes('test') || false
        },
        cloudinary: {
          configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)
        }
      },
      endpoints: [
        "GET /",
        "GET /api/health",
        "POST /api/debug-request",
        "POST /api/test-qr-pdf",
        "POST /api/bookings/create",
        "POST /api/bookings/add-users",
        "POST /api/bookings/create-payment",
        "POST /api/bookings/confirm-payment",
        "POST /api/bookings/qr-details",
        "POST /api/bookings/mark-used",
        "POST /api/bookings/resend-notifications",
        "GET /api/admin/dashboard/stats",
        "GET /api/admin/dashboard/recent-scans",
        "GET /api/admin/dashboard/recent-bookings",
        "GET /api/admin/dashboard/daily-stats",
        "POST /api/admin/bulk-operations",
        "POST /api/admin/manual-booking",
        "POST /api/qr/scan",
        "POST /api/qr/validate",
        "POST /api/qr/bulk-scan"
      ]
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

// Debug endpoint to inspect what frontend sends
app.post("/api/debug-request", (req, res) => {
  console.log('🔍 DEBUG: Frontend Request Analysis');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Content-Type:', req.get('Content-Type'));
  console.log('Raw body keys:', Object.keys(req.body || {}));
  
  res.json({
    success: true,
    debug_info: {
      content_type: req.get('Content-Type'),
      body_received: req.body,
      body_type: typeof req.body,
      body_keys: Object.keys(req.body || {}),
      is_empty: Object.keys(req.body || {}).length === 0,
      field_analysis: {
        booking_date: {
          present: !!req.body?.booking_date,
          value: req.body?.booking_date || null,
          type: typeof req.body?.booking_date
        },
        num_tickets: {
          present: !!req.body?.num_tickets,
          value: req.body?.num_tickets || null,
          type: typeof req.body?.num_tickets
        },
        pass_type: {
          present: !!req.body?.pass_type,
          value: req.body?.pass_type || null,
          type: typeof req.body?.pass_type
        }
      },
      headers_analysis: {
        content_type: req.get('Content-Type'),
        user_agent: req.get('User-Agent'),
        origin: req.get('Origin'),
        referer: req.get('Referer')
      }
    }
  });
});

// Root health check
app.get("/", (req, res) => {
  res.json({ 
    status: "healthy", 
    message: "Dandiya Platform Backend is running on Vercel",
    timestamp: new Date().toISOString(),
    platform: 'vercel'
  });
});

// Handle favicon requests
app.get("/favicon.ico", (req, res) => {
  res.status(204).send();
});

// Test endpoint for AI Sensy WhatsApp service
app.post("/api/test-aisensy", async (req, res) => {
  try {
    console.log("🧪 Testing AI Sensy WhatsApp service...");
    
    const whatsappService = require("./services/whatsappService");
    
    // Check configuration
    const isConfigured = !!(process.env.AISENSY_API_KEY && process.env.AISENSY_API_KEY !== 'your_aisensy_api_key_here');
    
    if (!isConfigured) {
      return res.json({
        success: false,
        configured: false,
        message: "AI Sensy not configured - set AISENSY_API_KEY environment variable",
        mock_response: "Would send WhatsApp message in production",
        status: "not_configured"
      });
    }
    
    // Test with a sample phone number (or use from request body)
    const { phoneNumber = "919999999999", message = "Test message from Dandiya Platform backend" } = req.body;
    
    const result = await whatsappService.sendTextMessage(phoneNumber, message);
    
    res.json({
      success: result.success,
      configured: true,
      test_result: result,
      api_endpoint: "https://backend.aisensy.com/campaign/t1/api/v2",
      timestamp: new Date().toISOString(),
      status: result.success ? "operational" : "error"
    });
    
    console.log("✅ AI Sensy test completed:", result.success ? "SUCCESS" : "FAILED");
    
  } catch (error) {
    console.error("❌ AI Sensy test failed:", error);
    res.status(500).json({ 
      success: false,
      configured: !!process.env.AISENSY_API_KEY,
      error: "AI Sensy test failed", 
      details: error.message,
      status: "error"
    });
  }
});
app.post("/api/test-qr-pdf", async (req, res) => {
  try {
    console.log("🧪 Testing QR PDF generation...");
    
    const { generateTicketPDFBuffer } = require("./utils/pdfGenerator");
    
    const testData = {
      name: "Test User",
      date: new Date().toISOString(),
      pass_type: "couple",
      qrCode: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TEST123",
      booking_id: "12345",
      ticket_number: "TEST-TICKET-001"
    };
    
    const pdfBuffer = await generateTicketPDFBuffer(testData);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=test-ticket.pdf');
    res.send(pdfBuffer);
    
    console.log("✅ QR PDF generation test successful");
    
  } catch (error) {
    console.error("❌ QR PDF generation test failed:", error);
    res.status(500).json({ 
      success: false, 
      error: "PDF generation failed", 
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack);
  res.status(500).json({ 
    success: false, 
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: "Endpoint not found",
    path: req.path,
    available_endpoints: [
      'GET /',
      'GET /api/health',
      'POST /api/test-qr-pdf',
      'POST /api/bookings/create',
      'POST /api/bookings/add-users',
      'POST /api/bookings/create-payment',
      'POST /api/bookings/confirm-payment',
      'POST /api/bookings/qr-details',
      'POST /api/bookings/mark-used',
      'POST /api/bookings/resend-notifications',
      'GET /api/admin/dashboard/stats',
      'GET /api/admin/dashboard/recent-scans',
      'GET /api/admin/dashboard/chart-data',
      'GET /api/admin/bookings',
      'GET /api/admin/scans'
    ]
  });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 Available endpoints listed at http://localhost:${PORT}/api/health`);
  });
}

// For Vercel, we export the app
module.exports = app;