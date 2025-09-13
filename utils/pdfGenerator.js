const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { generateQRCodeBuffer } = require("./qrGenerator");

// New: generate ticket PDF and return Buffer without writing to disk
const generateTicketPDFBuffer = async (ticketData) => {
   return new Promise(async (resolve, reject) => {
      const { name, date, pass_type, qrCode, booking_id, ticket_number } = ticketData || {};

      // Safe defaults
      const safeName = (name ?? "Guest").toString();
      const safePassType = (pass_type ?? "Standard").toString();
      const safeDate = date ?? new Date().toISOString();

      const doc = new PDFDocument({ size: [400, 600], margin: 30 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('error', (e) => reject(e));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // White background
      doc.rect(0, 0, 400, 600).fillColor('#ffffff').fill();
      // Decorative border
      doc.roundedRect(15, 15, 370, 570, 10).lineWidth(3).strokeColor('#ff6b35').stroke();
      // Header background
      doc.rect(25, 25, 350, 80).fillColor('#ff6b35').fill();
      // Event title
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold').text('🎭 MALANG RAS DANDIYA 2025 🎭', 35, 50, { align: 'center', width: 330 });
      doc.fontSize(12).text('✨ Official Entry Ticket ✨', 35, 75, { align: 'center', width: 330 });

      // Guest details
      let yPos = 130;
      doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text('👤 GUEST NAME', 40, yPos);
      doc.font('Helvetica').fontSize(16).fillColor('#ff6b35').text(safeName.toUpperCase(), 40, yPos + 20);

      yPos += 60;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#333333').text('📅 EVENT DATE', 40, yPos);
      doc.font('Helvetica').fontSize(14).text(new Date(safeDate).toLocaleDateString('en-IN'), 40, yPos + 20);

      yPos += 60;
      doc.font('Helvetica-Bold').fontSize(12).text('🎟️ PASS TYPE', 40, yPos);
      doc.font('Helvetica').fontSize(16).fillColor('#ff6b35').text(safePassType.toUpperCase(), 40, yPos + 20);

      yPos += 60;
      doc.font('Helvetica').fontSize(10).fillColor('#666666').text(`Booking: #${booking_id || 'N/A'} | Ticket: ${ticket_number || '1'}`, 40, yPos);

      // QR section
      yPos += 40;
      doc.fontSize(12).fillColor('#333333').font('Helvetica-Bold').text('📱 SCAN FOR ENTRY', 40, yPos, { align: 'center', width: 320 });
      
      // QR Code section - Enhanced handling
      yPos += 40;
      doc.fontSize(12)
         .fillColor('#333333')
         .font('Helvetica-Bold')
         .text('📱 SCAN FOR ENTRY', 40, yPos, { align: 'center', width: 320 });
      
      // Handle QR code with improved error handling
      try {
        let qrBuffer;
        
        if (qrCode) {
          if (qrCode.startsWith('http')) {
            // It's a URL - download the image
            console.log('📱 Downloading QR code from URL:', qrCode);
            try {
              const response = await axios.get(qrCode, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
              qrBuffer = Buffer.from(response.data, 'binary');
              
              // Add QR code border and image
              doc.rect(150, yPos + 20, 100, 100)
                .lineWidth(2)
                .strokeColor('#ff6b35')
                .stroke();
              doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
              
            } catch (downloadErr) {
              console.warn('Failed to download QR code, generating new one:', downloadErr.message);
              
              // Try to extract ticket number from URL or use fallback data
              const ticketNumber = booking_id || ticket_number || 'TICKET-' + Date.now();
              qrBuffer = await generateQRCodeBuffer(ticketNumber);
              
              doc.rect(150, yPos + 20, 100, 100)
                .lineWidth(2)
                .strokeColor('#ff6b35')
                .stroke();
              doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
            }
            
          } else if (qrCode.startsWith('data:image')) {
            // It's base64 data
            const base64Data = qrCode.split('base64,').pop();
            qrBuffer = Buffer.from(base64Data, 'base64');
            
            doc.rect(150, yPos + 20, 100, 100)
              .lineWidth(2)
              .strokeColor('#ff6b35')
              .stroke();
            doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
            
          } else {
            // It's raw base64 or other format
            const base64Data = qrCode.replace(/^data:image\/png;base64,/i, '');
            
            if (base64Data && base64Data.length > 0) {
              try {
                qrBuffer = Buffer.from(base64Data, 'base64');
                doc.rect(150, yPos + 20, 100, 100)
                  .lineWidth(2)
                  .strokeColor('#ff6b35')
                  .stroke();
                doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
              } catch (imgErr) {
                console.warn('Invalid base64 QR data, generating new one:', imgErr.message);
                // Generate a new QR code
                const ticketNumber = booking_id || ticket_number || 'TICKET-' + Date.now();
                qrBuffer = await generateQRCodeBuffer(ticketNumber);
                
                doc.rect(150, yPos + 20, 100, 100)
                  .lineWidth(2)
                  .strokeColor('#ff6b35')
                  .stroke();
                doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
              }
            } else {
              throw new Error('Empty QR code data');
            }
          }
        } else {
          // No QR code provided, generate one
          console.log('📱 No QR code provided, generating new one');
          const ticketNumber = booking_id || ticket_number || 'TICKET-' + Date.now();
          qrBuffer = await generateQRCodeBuffer(ticketNumber);
          
          doc.rect(150, yPos + 20, 100, 100)
            .lineWidth(2)
            .strokeColor('#ff6b35')
            .stroke();
          doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
        }
        
      } catch (qrError) {
        console.warn('QR code generation failed, using text fallback:', qrError.message);
        // Fallback to text display
        doc.fontSize(10)
           .fillColor('#666666')
           .text('QR Code: Check your ticket email', 40, yPos + 30, { align: 'center', width: 320 });
        
        // Add booking ID as text for manual verification
        doc.fontSize(8)
           .fillColor('#999999')
           .text(`Booking ID: ${booking_id || 'N/A'}`, 40, yPos + 50, { align: 'center', width: 320 });
      }

      // Footer
      doc.fontSize(9).fillColor('#999999').text('🎪 Venue: Event Ground | 🕖 Time: 7:00 PM', 40, yPos + 140, { align: 'center', width: 320 });
      doc.text('⚠️ Single entry only - Keep this ticket safe', 40, yPos + 160, { align: 'center', width: 320 });
      doc.end();
   });
};

const generateTicketPDF = async (ticketData) => {
  return new Promise(async (resolve, reject) => {
      const { name, date, pass_type, qrCode, booking_id, ticket_number } = ticketData || {};

      // Ensure output directory exists
      const ticketsDir = path.join(__dirname, "..", "tickets");
      try {
         if (!fs.existsSync(ticketsDir)) {
            fs.mkdirSync(ticketsDir, { recursive: true });
         }
      } catch (dirErr) {
         return reject(dirErr);
      }

      // Safe defaults
      const safeName = (name ?? "Guest").toString();
      const safePassType = (pass_type ?? "Standard").toString();
      const safeDate = date ?? new Date().toISOString();

    const doc = new PDFDocument({
      size: [400, 600],
      margin: 30,
    });

    const fileName = `ticket-${Date.now()}.pdf`;
      const filePath = path.join(ticketsDir, fileName);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // White background
    doc.rect(0, 0, 400, 600).fillColor('#ffffff').fill();

    // Decorative border
    doc.roundedRect(15, 15, 370, 570, 10)
       .lineWidth(3)
       .strokeColor('#ff6b35')
       .stroke();

    // Header background
    doc.rect(25, 25, 350, 80)
       .fillColor('#ff6b35')
       .fill();

    // Event title
    doc.fontSize(18)
       .fillColor('#ffffff')
       .font('Helvetica-Bold')
       .text('🎭 MALANG RAS DANDIYA 2025 🎭', 35, 50, {
         align: 'center',
         width: 330
       });

    doc.fontSize(12)
       .text('✨ Official Entry Ticket ✨', 35, 75, {
         align: 'center',
         width: 330
       });

    // Guest details
    let yPos = 130;
    doc.fillColor('#333333')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('👤 GUEST NAME', 40, yPos);
    
   doc.font('Helvetica')
      .fontSize(16)
      .fillColor('#ff6b35')
      .text(safeName.toUpperCase(), 40, yPos + 20);

    yPos += 60;
    doc.font('Helvetica-Bold')
       .fontSize(12)
       .fillColor('#333333')
       .text('📅 EVENT DATE', 40, yPos);
    
   doc.font('Helvetica')
      .fontSize(14)
      .text(new Date(safeDate).toLocaleDateString('en-IN'), 40, yPos + 20);

    yPos += 60;
    doc.font('Helvetica-Bold')
       .fontSize(12)
       .text('🎟️ PASS TYPE', 40, yPos);
    
   doc.font('Helvetica')
      .fontSize(16)
      .fillColor('#ff6b35')
      .text(safePassType.toUpperCase(), 40, yPos + 20);

    yPos += 60;
    doc.font('Helvetica')
       .fontSize(10)
       .fillColor('#666666')
       .text(`Booking: #${booking_id || 'N/A'} | Ticket: ${ticket_number || '1'}`, 40, yPos);

    // QR Code section
    yPos += 40;
    doc.fontSize(12)
       .fillColor('#333333')
       .font('Helvetica-Bold')
       .text('📱 SCAN FOR ENTRY', 40, yPos, { align: 'center', width: 320 });

      // QR Code section - Enhanced handling
      yPos += 40;
      doc.fontSize(12)
         .fillColor('#333333')
         .font('Helvetica-Bold')
         .text('📱 SCAN FOR ENTRY', 40, yPos, { align: 'center', width: 320 });
      
      // Handle QR code with improved error handling
      try {
        let qrBuffer;
        
        if (qrCode) {
          if (qrCode.startsWith('http')) {
            // It's a URL - download the image
            console.log('📱 Downloading QR code from URL:', qrCode);
            try {
              const response = await axios.get(qrCode, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
              qrBuffer = Buffer.from(response.data, 'binary');
              
              // Add QR code border and image
              doc.rect(150, yPos + 20, 100, 100)
                .lineWidth(2)
                .strokeColor('#ff6b35')
                .stroke();
              doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
              
            } catch (downloadErr) {
              console.warn('Failed to download QR code, generating new one:', downloadErr.message);
              
              // Try to extract ticket number from URL or use fallback data
              const ticketNumber = booking_id || ticket_number || 'TICKET-' + Date.now();
              qrBuffer = await generateQRCodeBuffer(ticketNumber);
              
              doc.rect(150, yPos + 20, 100, 100)
                .lineWidth(2)
                .strokeColor('#ff6b35')
                .stroke();
              doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
            }
            
          } else if (qrCode.startsWith('data:image')) {
            // It's base64 data
            const base64Data = qrCode.split('base64,').pop();
            qrBuffer = Buffer.from(base64Data, 'base64');
            
            doc.rect(150, yPos + 20, 100, 100)
              .lineWidth(2)
              .strokeColor('#ff6b35')
              .stroke();
            doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
            
          } else {
            // It's raw base64 or other format
            const base64Data = qrCode.replace(/^data:image\/png;base64,/i, '');
            
            if (base64Data && base64Data.length > 0) {
              try {
                qrBuffer = Buffer.from(base64Data, 'base64');
                doc.rect(150, yPos + 20, 100, 100)
                  .lineWidth(2)
                  .strokeColor('#ff6b35')
                  .stroke();
                doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
              } catch (imgErr) {
                console.warn('Invalid base64 QR data, generating new one:', imgErr.message);
                // Generate a new QR code
                const ticketNumber = booking_id || ticket_number || 'TICKET-' + Date.now();
                qrBuffer = await generateQRCodeBuffer(ticketNumber);
                
                doc.rect(150, yPos + 20, 100, 100)
                  .lineWidth(2)
                  .strokeColor('#ff6b35')
                  .stroke();
                doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
              }
            } else {
              throw new Error('Empty QR code data');
            }
          }
        } else {
          // No QR code provided, generate one
          console.log('📱 No QR code provided, generating new one');
          const ticketNumber = booking_id || ticket_number || 'TICKET-' + Date.now();
          qrBuffer = await generateQRCodeBuffer(ticketNumber);
          
          doc.rect(150, yPos + 20, 100, 100)
            .lineWidth(2)
            .strokeColor('#ff6b35')
            .stroke();
          doc.image(qrBuffer, 155, yPos + 25, { fit: [90, 90] });
        }
        
      } catch (qrError) {
        console.warn('QR code generation failed, using text fallback:', qrError.message);
        // Fallback to text display
        doc.fontSize(10)
           .fillColor('#666666')
           .text('QR Code: Check your ticket email', 40, yPos + 30, { align: 'center', width: 320 });
        
        // Add booking ID as text for manual verification
        doc.fontSize(8)
           .fillColor('#999999')
           .text(`Booking ID: ${booking_id || 'N/A'}`, 40, yPos + 50, { align: 'center', width: 320 });
      }

    // Footer
    doc.fontSize(9)
       .fillColor('#999999')
       .text('🎪 Venue: Event Ground | 🕖 Time: 7:00 PM', 40, yPos + 140, {
         align: 'center',
         width: 320
       });
    
    doc.text('⚠️ Single entry only - Keep this ticket safe', 40, yPos + 160, {
       align: 'center',
       width: 320
    });

    doc.end();

         stream.on("finish", () => {
            resolve(filePath);
         });

    stream.on("error", (err) => {
      reject(err);
    });
  });
};

module.exports = generateTicketPDF;
module.exports.generateTicketPDF = generateTicketPDF;
module.exports.generateTicketPDFBuffer = generateTicketPDFBuffer;