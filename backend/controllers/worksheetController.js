const supabase = require('../config/database');
const StorageService = require('../services/storageService');
const FileExtractor = require('../services/fileExtractor');
const LatexGenerator = require('../services/latexGenerator');
const PDFCompiler = require('../services/pdfCompiler');
const DocxCompiler = require('../services/docxCompiler');
const { 
  generateWorksheetId, 
  getFileExtension,
  formatStoragePath 
} = require('../utils/helpers');
const { WORKSHEET_STATUS } = require('../utils/constants');

class WorksheetController {
  /**
   * Create a new worksheet (upload + initiate processing)
   */
  static async createWorksheet(req, res) {
    try {
      const missingEnv = [];
      if (!process.env.SUPABASE_URL) missingEnv.push('SUPABASE_URL');
      if (!process.env.SUPABASE_SERVICE_KEY) missingEnv.push('SUPABASE_SERVICE_KEY');
      if (!process.env.INPUT_BUCKET) missingEnv.push('INPUT_BUCKET');
      if (!process.env.OUTPUT_BUCKET) missingEnv.push('OUTPUT_BUCKET');
      if (!process.env.OPENAI_API_KEY) missingEnv.push('OPENAI_API_KEY');

      if (missingEnv.length > 0) {
        return res.status(500).json({
          error: 'Server is not configured. Missing environment variables.',
          missing: missingEnv
        });
      }

      const { program, subject, chapterName } = req.body;
      const file = req.file;

      // Validation
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!program || !subject) {
        return res.status(400).json({ error: 'Program and subject are required' });
      }

      if (!chapterName || !String(chapterName).trim()) {
        return res.status(400).json({ error: 'Chapter name is required' });
      }

      const fileType = getFileExtension(file.originalname);
      if (!['docx', 'pdf'].includes(fileType)) {
        return res.status(400).json({ error: 'Only DOCX and PDF files are allowed' });
      }

      // Generate unique worksheet ID
      const worksheetId = generateWorksheetId();

      // Upload input file to storage
      const inputResult = await StorageService.uploadInputFile(
        worksheetId,
        file.buffer,
        file.originalname
      );

      // Save to database
      const { data, error } = await supabase
        .from('worksheets')
        .insert([
          {
            id: worksheetId,
            program: program,
            subject: subject,
            chapter_name: String(chapterName).trim(),
            original_filename: file.originalname,
            file_type: fileType,
            input_storage_path: inputResult.path,
            status: WORKSHEET_STATUS.EXTRACTING
          }
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Start background processing
      WorksheetController.processWorksheet(worksheetId, file.buffer, fileType, program, subject, String(chapterName).trim())
        .catch(err => {
          console.error(`Background processing failed for ${worksheetId}:`, err);
        });

      res.status(201).json({
        success: true,
        worksheetId: worksheetId,
        message: 'Worksheet uploaded successfully. Processing started.'
      });

    } catch (error) {
      console.error('Create worksheet error:', error);
      res.status(500).json({ 
        error: 'Failed to create worksheet',
        details: error.message 
      });
    }
  }

  /**
   * Get worksheet status
   */
  static async getWorksheetStatus(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('worksheets')
        .select('id, program, subject, status, created_at, updated_at, output_pdf_storage_path, output_docx_storage_path')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Worksheet not found' });
      }

      // Get PDF URL if ready
      let pdfUrl = null;
      let docxUrl = null;
      if (data.status === WORKSHEET_STATUS.READY) {
        if (data.output_pdf_storage_path) {
          pdfUrl = StorageService.getPublicUrl(
            process.env.OUTPUT_BUCKET,
            data.output_pdf_storage_path
          );
        }
        if (data.output_docx_storage_path) {
          docxUrl = StorageService.getPublicUrl(
            process.env.OUTPUT_BUCKET,
            data.output_docx_storage_path
          );
        }
      }

      res.json({
        ...data,
        pdfUrl: pdfUrl,
        docxUrl: docxUrl
      });

    } catch (error) {
      console.error('Get status error:', error);
      res.status(500).json({ 
        error: 'Failed to get worksheet status',
        details: error.message 
      });
    }
  }

  /**
   * Background processing workflow
   */
  static async processWorksheet(id, fileBuffer, fileType, program, subject, chapterName) {
    try {
      console.log(`Starting processing for worksheet: ${id}`);

      // Step 1: Extract text
      await this.updateStatus(id, WORKSHEET_STATUS.EXTRACTING);
      console.log(`[${id}] Extracting text...`);
      
      const extractedText = await FileExtractor.extractText(fileBuffer, fileType);
      console.log(`[${id}] Text extracted successfully`);

      // Step 2: Generate LaTeX
      await this.updateStatus(id, WORKSHEET_STATUS.GENERATING);
      console.log(`[${id}] Generating LaTeX...`);
      
      const latexCode = await LatexGenerator.generate(extractedText, program, subject, chapterName);
      console.log(`[${id}] LaTeX generated successfully`);

      // Step 3: Compile to PDF
      await this.updateStatus(id, WORKSHEET_STATUS.COMPILING, { latex_content: latexCode });
      console.log(`[${id}] Compiling PDF...`);
      
      const pdfBuffer = await PDFCompiler.compile(latexCode, id, program, subject);
      console.log(`[${id}] PDF compiled successfully`);

      // Upload PDF to storage
      const outputResult = await StorageService.uploadOutputPdf(id, pdfBuffer);
      console.log(`[${id}] PDF uploaded to storage`);

      // Step 4: Compile to DOCX
      console.log(`[${id}] Compiling DOCX...`);
      const docxBuffer = await DocxCompiler.compile(latexCode, id);
      console.log(`[${id}] DOCX compiled successfully`);

      const docxResult = await StorageService.uploadOutputDocx(id, docxBuffer);
      console.log(`[${id}] DOCX uploaded to storage`);

      // Step 5: Mark as ready
      await this.updateStatus(id, WORKSHEET_STATUS.READY, {
        output_pdf_storage_path: outputResult.path,
        output_docx_storage_path: docxResult.path,
        updated_at: new Date().toISOString()
      });

      console.log(`[${id}] Processing completed successfully`);

    } catch (error) {
      console.error(`[${id}] Processing failed:`, error);
      
      // Mark as failed
      await this.updateStatus(id, WORKSHEET_STATUS.FAILED, {
        updated_at: new Date().toISOString()
      });
    }
  }

  /**
   * Update worksheet status in database
   * @private
   */
  static async updateStatus(id, status, additionalData = {}) {
    const { error } = await supabase
      .from('worksheets')
      .update({ 
        status: status,
        ...additionalData 
      })
      .eq('id', id);

    if (error) {
      console.error(`Failed to update status for ${id}:`, error);
      throw error;
    }
  }
}

module.exports = WorksheetController;
