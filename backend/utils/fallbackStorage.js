// In-memory storage for fallback data when database is unavailable
let fallbackData = {
  bookings: [],
  users: [],
  payments: [],
  qrCodes: []
};

// Store fallback booking
function storeFallbackBooking(booking) {
  // Remove any existing booking with the same ID
  fallbackData.bookings = fallbackData.bookings.filter(b => b.id !== booking.id);
  // Add the new booking
  fallbackData.bookings.push(booking);
  console.log(`📦 Stored fallback booking: ${booking.id}`);
}

// Store fallback user
function storeFallbackUser(user) {
  fallbackData.users = fallbackData.users.filter(u => u.id !== user.id);
  fallbackData.users.push(user);
  console.log(`👤 Stored fallback user: ${user.id}`);
}

// Store fallback payment
function storeFallbackPayment(payment) {
  fallbackData.payments = fallbackData.payments.filter(p => p.id !== payment.id);
  fallbackData.payments.push(payment);
  console.log(`💳 Stored fallback payment: ${payment.id}`);
}

// Store fallback QR code
function storeFallbackQRCode(qrCode) {
  fallbackData.qrCodes = fallbackData.qrCodes.filter(q => q.id !== qrCode.id);
  fallbackData.qrCodes.push(qrCode);
  console.log(`📱 Stored fallback QR code: ${qrCode.id}`);
}

// Get fallback bookings with related data
function getFallbackBookings() {
  return fallbackData.bookings.map(booking => ({
    ...booking,
    users: fallbackData.users.filter(u => u.booking_id == booking.id),
    payments: fallbackData.payments.filter(p => p.booking_id == booking.id),
    qr_codes: fallbackData.qrCodes.filter(q => q.booking_id == booking.id)
  }));
}

// Get all fallback data
function getAllFallbackData() {
  return {
    bookings: getFallbackBookings(),
    users: fallbackData.users,
    payments: fallbackData.payments,
    qrCodes: fallbackData.qrCodes,
    stats: {
      totalBookings: fallbackData.bookings.length,
      totalUsers: fallbackData.users.length,
      totalPayments: fallbackData.payments.length,
      totalQRCodes: fallbackData.qrCodes.length
    }
  };
}

// Clear all fallback data
function clearFallbackData() {
  fallbackData = {
    bookings: [],
    users: [],
    payments: [],
    qrCodes: []
  };
  console.log('🧹 Cleared all fallback data');
}

module.exports = {
  storeFallbackBooking,
  storeFallbackUser,
  storeFallbackPayment,
  storeFallbackQRCode,
  getFallbackBookings,
  getAllFallbackData,
  clearFallbackData
};
