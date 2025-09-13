const express = require("express");
const cors = require("cors");
const { testConnection } = require('./config/database');
require("dotenv").config();

// Global BigInt JSON serialization fix
BigInt.prototype.toJSON = function() { return this.toString(); };

console.log("🚀 Starting Dandiya Platform Backend on Vercel...");

const app = express();

// Enhanced CORS configuration for Vercel
app.use(cors({
  origin: [
    'https://malangevents.com',
    'https://www.malangevents.com',
    'http://localhost:3000',  // for local development
    'http://localhost:5173'   // for Vite dev server
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Handle preflight requests explicitly
app.options("*", cors());

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

bookingRoutes.post("/create", bookingController.createBooking);
bookingRoutes.post("/add-users", bookingController.addUserDetails);
bookingRoutes.post("/create-payment", bookingController.createPayment);
bookingRoutes.post("/confirm-payment", bookingController.confirmPayment);
bookingRoutes.post("/qr-details", bookingController.getQRDetails);
bookingRoutes.post("/mark-used", bookingController.markTicketUsed);
bookingRoutes.post("/resend-notifications", bookingController.resendNotifications);

app.use("/api/bookings", bookingRoutes);
console.log("✅ Booking routes loaded");

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    
    // Check AI Sensy configuration
    const whatsappService = require("./services/whatsappService");
    const aiSensyConfigured = !!(process.env.AISENSY_API_KEY && process.env.AISENSY_API_KEY !== 'your_aisensy_api_key_here');
    
    res.json({ 
      status: "healthy", 
      message: "Dandiya Platform Backend is running on Vercel",
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV || 'development',
      platform: 'vercel',
      services: {
        database: {
          connected: dbConnected,
          status: dbConnected ? 'operational' : 'error'
        },
        whatsapp_aisensy: {
          configured: aiSensyConfigured,
          api_key_present: !!process.env.AISENSY_API_KEY,
          status: aiSensyConfigured ? 'operational' : 'not_configured'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Health check failed",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

// For Vercel, we export the app
module.exports = app;