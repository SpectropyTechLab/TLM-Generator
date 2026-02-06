const supabase = require('../config/database');
const storageConfig = require('../config/storage');
const { getContentType } = require('../utils/helpers');

class StorageService {
  /**
   * Upload file to Supabase Storage
   * @param {string} bucket - Bucket name
   * @param {string} filePath - Path in storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileType - File extension
   * @returns {Promise<{path: string, url: string}>}
   */
  static async uploadFile(bucket, filePath, fileBuffer, fileType) {
    try {
      const contentType = getContentType(fileType);

      const { data, error } = await supabase
        .storage
        .from(bucket)
        .upload(filePath, fileBuffer, {
          contentType: contentType,
          upsert: true
        });

      if (error) {
        console.error('Storage upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase
        .storage
        .from(bucket)
        .getPublicUrl(filePath);

      return { 
        path: filePath, 
        url: publicUrl 
      };
    } catch (error) {
      console.error('StorageService.uploadFile error:', error);
      throw error;
    }
  }

  /**
   * Download file from Supabase Storage
   * @param {string} bucket - Bucket name
   * @param {string} filePath - Path in storage
   * @returns {Promise<Buffer>}
   */
  static async downloadFile(bucket, filePath) {
    try {
      const { data, error } = await supabase
        .storage
        .from(bucket)
        .download(filePath);

      if (error) {
        console.error('Storage download error:', error);
        throw new Error(`Download failed: ${error.message}`);
      }

      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('StorageService.downloadFile error:', error);
      throw error;
    }
  }

  /**
   * Get public URL for a file
   * @param {string} bucket - Bucket name
   * @param {string} filePath - Path in storage
   * @returns {string}
   */
  static getPublicUrl(bucket, filePath) {
    const { data: { publicUrl } } = supabase
      .storage
      .from(bucket)
      .getPublicUrl(filePath);
    
    return publicUrl;
  }

  /**
   * Delete file from storage
   * @param {string} bucket - Bucket name
   * @param {string} filePath - Path in storage
   * @returns {Promise<void>}
   */
  static async deleteFile(bucket, filePath) {
    try {
      const { error } = await supabase
        .storage
        .from(bucket)
        .remove([filePath]);

      if (error) {
        console.error('Storage delete error:', error);
        throw new Error(`Delete failed: ${error.message}`);
      }
    } catch (error) {
      console.error('StorageService.deleteFile error:', error);
      throw error;
    }
  }

  /**
   * Upload input file
   * @param {string} worksheetId - Worksheet ID
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} originalFilename - Original filename
   * @returns {Promise<{path: string, url: string}>}
   */
  static async uploadInputFile(worksheetId, fileBuffer, originalFilename) {
    const filePath = `worksheets/${worksheetId}/input.${getFileExtension(originalFilename)}`;
    
    return await this.uploadFile(
      storageConfig.inputBucket,
      filePath,
      fileBuffer,
      getFileExtension(originalFilename)
    );
  }

  /**
   * Upload output PDF
   * @param {string} worksheetId - Worksheet ID
   * @param {Buffer} pdfBuffer - PDF buffer
   * @returns {Promise<{path: string, url: string}>}
   */
  static async uploadOutputPdf(worksheetId, pdfBuffer) {
    const filePath = `worksheets/${worksheetId}/manual.pdf`;
    
    return await this.uploadFile(
      storageConfig.outputBucket,
      filePath,
      pdfBuffer,
      'pdf'
    );
  }

  /**
   * Upload output DOCX
   * @param {string} worksheetId - Worksheet ID
   * @param {Buffer} docxBuffer - DOCX buffer
   * @returns {Promise<{path: string, url: string}>}
   */
  static async uploadOutputDocx(worksheetId, docxBuffer) {
    const filePath = `worksheets/${worksheetId}/manual.docx`;
    
    return await this.uploadFile(
      storageConfig.outputBucket,
      filePath,
      docxBuffer,
      'docx'
    );
  }
}

function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

module.exports = StorageService;
