const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generates a course completion certificate PDF using pdfkit.
 * Matches signature used by certificateJob.js
 */
async function generateCertificate({ studentName, courseName, trainerName = 'Acadeno Trainer', completedAt, verificationToken }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
      });

      const certsDir = path.join(process.cwd(), 'certificates');
      if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
      }

      // Use verificationToken as the filename to ensure uniqueness and match job logic
      const fileName = `certificate_${verificationToken}.pdf`;
      const filePath = path.join(certsDir, fileName);
      const writeStream = fs.createWriteStream(filePath);

      doc.pipe(writeStream);

      // Design
      doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
      
      doc.moveDown(4);
      doc.fontSize(40).font('Helvetica-Bold').text('Certificate of Completion', { align: 'center' });
      
      doc.moveDown(2);
      doc.fontSize(20).font('Helvetica').text('This is to certify that', { align: 'center' });
      
      doc.moveDown(1);
      doc.fontSize(30).font('Helvetica-Bold').text(studentName, { align: 'center', underline: true });
      
      doc.moveDown(1);
      doc.fontSize(20).font('Helvetica').text('has successfully completed the course', { align: 'center' });
      
      doc.moveDown(1);
      doc.fontSize(25).font('Helvetica-Bold').text(courseName, { align: 'center' });
      
      doc.moveDown(2);
      doc.fontSize(15).text(`Completed on: ${new Date(completedAt).toLocaleDateString()}`, { align: 'center' });
      doc.text(`Trainer: ${trainerName}`, { align: 'center' });
      
      doc.moveDown(2);
      const verificationUrl = `http://localhost:3002/api/student/certificates/verify/${verificationToken}`;
      doc.fontSize(10).fillColor('blue').text(`Verify at: ${verificationUrl}`, { align: 'center', link: verificationUrl });

      doc.end();

      writeStream.on('finish', () => {
        // Return the relative URL as a string to match job expectations (strCertUrl)
        resolve(`/certificates/${fileName}`);
      });

      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}


module.exports = { generateCertificate };

