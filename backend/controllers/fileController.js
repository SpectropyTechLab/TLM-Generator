const supabase = require('../config/database');
const StorageService = require('../services/storageService');
const { WORKSHEET_STATUS } = require('../utils/constants');

class FileController {
  /**
   * Get PDF for preview (inline display)
   */
  static async getPdfPreview(req, res) {
    try {
      const { id } = req.params;

      // Verify worksheet exists and is ready
      const { data: worksheet, error: worksheetError } = await supabase
        .from('worksheets')
        .select('output_pdf_storage_path, original_filename')
        .eq('id', id)
        .eq('status', WORKSHEET_STATUS.READY)
        .single();

      if (worksheetError || !worksheet || !worksheet.output_pdf_storage_path) {
        return res.status(404).json({ error: 'PDF not ready or not found' });
      }

      // Download PDF from storage
      const pdfBuffer = await StorageService.downloadFile(
        process.env.OUTPUT_BUCKET,
        worksheet.output_pdf_storage_path
      );

      // Set filename
      const filename = worksheet.original_filename.replace(/\.[^/.]+$/, '_manual.pdf');

      // Send PDF for inline viewing
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.send(pdfBuffer);

    } catch (error) {
      console.error('PDF preview error:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve PDF',
        details: error.message 
      });
    }
  }

  /**
   * Download PDF (attachment)
   */
  static async downloadPdf(req, res) {
    try {
      const { id } = req.params;

      // Verify worksheet exists and is ready
      const { data: worksheet, error: worksheetError } = await supabase
        .from('worksheets')
        .select('output_pdf_storage_path, original_filename')
        .eq('id', id)
        .eq('status', WORKSHEET_STATUS.READY)
        .single();

      if (worksheetError || !worksheet || !worksheet.output_pdf_storage_path) {
        return res.status(404).json({ error: 'PDF not ready or not found' });
      }

      // Download PDF from storage
      const pdfBuffer = await StorageService.downloadFile(
        process.env.OUTPUT_BUCKET,
        worksheet.output_pdf_storage_path
      );

      // Set filename
      const filename = worksheet.original_filename.replace(/\.[^/.]+$/, '_manual.pdf');

      // Send PDF as attachment
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('PDF download error:', error);
      res.status(500).json({ 
        error: 'Failed to download PDF',
        details: error.message 
      });
    }
  }

  /**
   * Get direct PDF URL
   */
  static async getPdfUrl(req, res) {
    try {
      const { id } = req.params;

      // Verify worksheet exists and is ready
      const { data: worksheet, error: worksheetError } = await supabase
        .from('worksheets')
        .select('output_pdf_storage_path')
        .eq('id', id)
        .eq('status', WORKSHEET_STATUS.READY)
        .single();

      if (worksheetError || !worksheet || !worksheet.output_pdf_storage_path) {
        return res.status(404).json({ error: 'PDF not ready or not found' });
      }

      // Get public URL
      const pdfUrl = StorageService.getPublicUrl(
        process.env.OUTPUT_BUCKET,
        worksheet.output_pdf_storage_path
      );

      res.json({ 
        success: true,
        pdfUrl: pdfUrl 
      });

    } catch (error) {
      console.error('PDF URL error:', error);
      res.status(500).json({ 
        error: 'Failed to get PDF URL',
        details: error.message 
      });
    }
  }

  /**
   * Download DOCX (attachment)
   */
  static async downloadDocx(req, res) {
    try {
      const { id } = req.params;

      // Verify worksheet exists and is ready
      const { data: worksheet, error: worksheetError } = await supabase
        .from('worksheets')
        .select('output_docx_storage_path, original_filename')
        .eq('id', id)
        .eq('status', WORKSHEET_STATUS.READY)
        .single();

      if (worksheetError || !worksheet || !worksheet.output_docx_storage_path) {
        return res.status(404).json({ error: 'DOCX not ready or not found' });
      }

      // Download DOCX from storage
      const docxBuffer = await StorageService.downloadFile(
        process.env.OUTPUT_BUCKET,
        worksheet.output_docx_storage_path
      );

      // Set filename
      const filename = worksheet.original_filename.replace(/\.[^/.]+$/, '_manual.docx');

      // Send DOCX as attachment
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', docxBuffer.length);
      res.send(docxBuffer);
    } catch (error) {
      console.error('DOCX download error:', error);
      res.status(500).json({
        error: 'Failed to download DOCX',
        details: error.message
      });
    }
  }

  /**
   * Delete worksheet and associated files
   */
  static async deleteWorksheet(req, res) {
    try {
      const { id } = req.params;

      // Get worksheet data
      const { data: worksheet, error: fetchError } = await supabase
        .from('worksheets')
        .select('input_storage_path, output_pdf_storage_path, output_docx_storage_path')
        .eq('id', id)
        .single();

      if (fetchError || !worksheet) {
        return res.status(404).json({ error: 'Worksheet not found' });
      }

      // Delete files from storage
      if (worksheet.input_storage_path) {
        await StorageService.deleteFile(
          process.env.INPUT_BUCKET,
          worksheet.input_storage_path
        );
      }

      if (worksheet.output_pdf_storage_path) {
        await StorageService.deleteFile(
          process.env.OUTPUT_BUCKET,
          worksheet.output_pdf_storage_path
        );
      }

      if (worksheet.output_docx_storage_path) {
        await StorageService.deleteFile(
          process.env.OUTPUT_BUCKET,
          worksheet.output_docx_storage_path
        );
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('worksheets')
        .delete()
        .eq('id', id);

      if (deleteError) {
        throw deleteError;
      }

      res.json({ 
        success: true,
        message: 'Worksheet deleted successfully' 
      });

    } catch (error) {
      console.error('Delete worksheet error:', error);
      res.status(500).json({ 
        error: 'Failed to delete worksheet',
        details: error.message 
      });
    }
  }
}

module.exports = FileController;
