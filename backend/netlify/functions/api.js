const express = require("express");
const serverless = require("serverless-http");
const bodyParser = require("body-parser");
const { testConnection } = require('../../config/database');
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// Global BigInt JSON serialization fix
BigInt.prototype.toJSON = function() { return this.toString(); };

const app = express();

// Enhanced CORS configuration for frontend development and production
app.use(cors({
  origin: [
    // Production frontend
    'https://malangrasdandiya.netlify.app',
    // Add your actual frontend domain here when you deploy it
    // 'https://your-frontend-domain.netlify.app',
    // Local development
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:5173',
    'http://localhost:19006',
    'exp://192.168.39.39:8081',
    'exp://10.0.2.2:8081',
    'http://10.0.2.2:8081',
    'http://192.168.39.39:8081',
    'exp://192.168.6.70:19000',
    'exp://192.168.73.189:19000',
    'exp://192.168.162.189:19000',
    'exp://192.168.197.189:8081',
    'http://192.168.197.189:8081'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Enhanced JSON parsing with error handling
app.use(express.json({ 
  limit: '50mb'
}));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global error handler for JSON parsing and other errors
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid JSON format',
      message: 'Please check your request body format'
    });
  }
  
  // Don't crash the server on errors
  if (!res.headersSent) {
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
});

// Import controllers
const bookingController = require("../../controllers/bookingController");

// Import routes
try {
  const configRoutes = require("../../routes/configRoutes");
  app.use("/api/config", configRoutes);
  console.log("✅ Config routes loaded");
} catch (err) {
  console.log("⚠️ Config routes not found, skipping...");
}

// Admin routes
try {
  const adminRoutes = require("../../routes/adminRoutes");
  app.use("/api/admin", adminRoutes);
  console.log("✅ Admin routes loaded");
} catch (err) {
  console.log("⚠️ Admin routes not found, skipping...");
}

// Auth routes
try {
  const authRoutes = require("../../routes/authRoutes");
  app.use("/api/auth", authRoutes);
  console.log("✅ Auth routes loaded");
} catch (err) {
  console.log("⚠️ Auth routes not found, skipping...");
}

// QR routes
try {
  const qrRoutes = require("../../routes/qrRoutes");
  app.use("/api/qr", qrRoutes);
  console.log("✅ QR routes loaded");
} catch (err) {
  console.log("⚠️ QR routes not found, skipping...");
}

// Booking routes (inline definition since bookingRoutes.js might not exist)
const bookingRoutes = express.Router();

// Booking endpoints
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
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    message: "Dandiya Platform Backend is running on Netlify Functions",
    timestamp: new Date().toISOString(),
    node_env: process.env.NODE_ENV || 'development',
    platform: 'netlify-functions',
    qr_pdf_fixed: true
  });
});

// Root health check
app.get("/", (req, res) => {
  res.json({ 
    status: "healthy", 
    message: "Dandiya Platform Backend is running on Netlify Functions",
    timestamp: new Date().toISOString(),
    platform: 'netlify-functions'
  });
});

// Handle favicon requests
app.get("/favicon.ico", (req, res) => {
  res.status(204).send(); // No Content
});

// Test endpoint for QR PDF generation
app.post("/api/test-qr-pdf", async (req, res) => {
  try {
    console.log("🧪 Testing QR PDF generation...");
    
    const { generateTicketPDFBuffer } = require("../../utils/pdfGenerator");
    
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

// Export the serverless function
module.exports.handler = serverless(app);