/**
 * PDF Extractor Utility
 * 
 * Handles PDF text extraction with error handling.
 * Separates file operations from route logic.
 */

const pdfParse = require('pdf-parse');
const fs = require('fs');

class PDFExtractor {
  /**
   * Extract text content from PDF file
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<string>} Extracted text content
   * @throws {Error} If extraction fails
   */
  async extractText(filePath) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error('PDF file not found');
      }

      // Read file buffer
      const dataBuffer = fs.readFileSync(filePath);
      
      if (dataBuffer.length === 0) {
        throw new Error('PDF file is empty');
      }

      // Parse PDF
      const data = await pdfParse(dataBuffer);
      
      if (!data || !data.text) {
        throw new Error('No text content found in PDF');
      }

      const text = data.text.trim();
      
      if (text.length === 0) {
        throw new Error('PDF appears to be empty or contains only images');
      }

      return text;
    } catch (error) {
      // Enhance error messages
      if (error.message.includes('Invalid PDF')) {
        throw new Error('Invalid PDF file format. Please ensure the file is a valid PDF.');
      }
      
      if (error.message.includes('password')) {
        throw new Error('PDF is password-protected. Please remove password protection.');
      }

      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  /**
   * Clean up temporary file
   * @param {string} filePath - Path to file to delete
   */
  cleanup(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Warning: Failed to cleanup file ${filePath}:`, error.message);
      // Don't throw - cleanup failures shouldn't break the app
    }
  }
}

module.exports = new PDFExtractor();

