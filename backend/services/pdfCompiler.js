const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class PDFCompiler {
  /**
   * Render manual content to PDF using pdflatex.
   * @param {string} content - Generated manual content
   * @param {string} worksheetId - Worksheet ID
   * @param {string} program - Program name
   * @param {string} subject - Subject name
   * @returns {Promise<Buffer>}
   */
  static async compile(content, worksheetId, program, subject) {
    return await this.renderPdf(content, worksheetId, program, subject);
  }

  /**
   * Render PDF from LaTeX using pdflatex
   * @private
   */
  static async renderPdf(content, worksheetId, program, subject) {
    const headerText = this.buildHeaderText(program, subject);
    const tex = this.buildLatexDocument(content, headerText, worksheetId);
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'paper2manual-'));
    const texPath = path.join(tmpDir, 'manual.tex');
    const pdfPath = path.join(tmpDir, 'manual.pdf');
    const logPath = path.join(tmpDir, 'manual.log');

    try {
      await fs.promises.writeFile(texPath, tex, 'utf8');

      const pdflatexCmd = process.env.PDFLATEX_BIN
        ? process.env.PDFLATEX_BIN
        : (process.platform === 'win32' ? 'pdflatex.exe' : 'pdflatex');
      const args = [
        '-interaction=nonstopmode',
        '-halt-on-error',
        '-file-line-error',
        '-output-directory',
        tmpDir,
        texPath
      ];

      const { stdout, stderr } = await execFileAsync(pdflatexCmd, args, {
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          MIKTEX_UI: process.env.MIKTEX_UI || 'none',
          MIKTEX_INSTALL: process.env.MIKTEX_INSTALL || '1'
        }
      });

      if (!fs.existsSync(pdfPath)) {
        const details = [stdout, stderr].filter(Boolean).join('\n');
        throw new Error(`pdflatex did not produce a PDF. ${details}`);
      }

      return await fs.promises.readFile(pdfPath);
    } catch (error) {
      const message = error?.message || String(error);
      let logTail = '';
      try {
        if (fs.existsSync(logPath)) {
          const logContent = await fs.promises.readFile(logPath, 'utf8');
          const lines = logContent.split(/\r?\n/);
          logTail = lines.slice(-40).join('\n').trim();
        }
      } catch {
        // Ignore log read errors.
      }
      const details = logTail ? `\n--- pdflatex log (tail) ---\n${logTail}` : '';
      throw new Error(`Failed to compile LaTeX to PDF: ${message}\nTemp dir: ${tmpDir}${details}`);
    } finally {
      const keepTemp = process.env.LATEX_KEEP_TEMP === 'true';
      if (!keepTemp) {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Failed to cleanup LaTeX temp dir:', cleanupError?.message || cleanupError);
        }
      }
    }
  }

  /**
   * Build a full LaTeX document with light formatting.
   * @private
   */
  static buildLatexDocument(content, headerText, worksheetId) {
    const safeHeader = this.escapeLatexText(String(headerText || '').trim());
    const title = this.escapeLatexText(`Worksheet Manual ${worksheetId}`);
    const body = this.convertTextToLatex(content);

    return `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{fancyhdr}
\\usepackage{amsmath,amssymb}
\\usepackage{enumitem}
\\usepackage{newtxtext,newtxmath}
\\geometry{a4paper, margin=1in}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{}
\\chead{\\small ${safeHeader}}
\\rhead{}
\\cfoot{\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\setlist[itemize]{label=\\textbullet,leftmargin=1.2em,topsep=2pt,itemsep=2pt}
\\title{${title}}
\\date{}
\\begin{document}
${body}
\\end{document}
`;
  }

  /**
   * Convert plain text content into LaTeX with simple formatting.
   * Preserves inline/display math where possible.
   * @private
   */
  static convertTextToLatex(content) {
    const text = (content || '').trim();
    if (!text) {
      return `\\begin{center}\\Large\\textbf{SPECTROPY-IIT FOUNDATION MENTOR'S MANUAL}\\end{center}\n\nNo content was generated.`;
    }

    const lines = text.split(/\r?\n/);
    const output = [];
    let inList = false;

    for (const raw of lines) {
      const line = raw.trimEnd();
      const trimmed = line.trim();

      if (!trimmed) {
        if (inList) {
          output.push('\\end{itemize}');
          inList = false;
        }
        output.push('');
        continue;
      }

      if (trimmed === "SPECTROPY-IIT FOUNDATION MENTOR'S MANUAL") {
        if (inList) {
          output.push('\\end{itemize}');
          inList = false;
        }
        output.push(`\\begin{center}\\Large\\textbf{${this.escapeLatexText(trimmed)}}\\end{center}`);
        continue;
      }

      if (trimmed.startsWith('Worksheet:')) {
        if (inList) {
          output.push('\\end{itemize}');
          inList = false;
        }
        const value = trimmed.replace(/^Worksheet:\s*/, '');
        output.push(`\\textbf{Worksheet:} ${this.escapeLatexTextPreservingMath(value)}`);
        continue;
      }

      if (trimmed.startsWith('Syllabus Topics Covered:')) {
        if (inList) {
          output.push('\\end{itemize}');
          inList = false;
        }
        const value = trimmed.replace(/^Syllabus Topics Covered:\s*/, '');
        output.push(`\\textbf{Syllabus Topics Covered:} ${this.escapeLatexTextPreservingMath(value)}`);
        continue;
      }

      if (trimmed === 'Answer Key and Detailed Solutions') {
        if (inList) {
          output.push('\\end{itemize}');
          inList = false;
        }
        output.push(`\\vspace{0.5em}\\textbf{${this.escapeLatexText(trimmed)}}`);
        continue;
      }

      if (/^(Q\d+\.|Question\s*\d+[:.]|\d+\.)/i.test(trimmed)) {
        if (inList) {
          output.push('\\end{itemize}');
          inList = false;
        }
        output.push(`\\textbf{${this.escapeLatexTextPreservingMath(trimmed)}}`);
        continue;
      }

      if (/^•\s*-?\s*/.test(trimmed)) {
        if (!inList) {
          output.push('\\begin{itemize}[leftmargin=1.2em]');
          inList = true;
        }
        const item = trimmed.replace(/^•\s*-?\s*/, '');
        output.push(`\\item ${this.escapeLatexTextPreservingMath(item)}`);
        continue;
      }

      if (trimmed.startsWith('- ')) {
        if (!inList) {
          output.push('\\begin{itemize}[leftmargin=1.2em]');
          inList = true;
        }
        const item = trimmed.replace(/^-\\s*/, '');
        output.push(`\\item ${this.escapeLatexTextPreservingMath(item)}`);
        continue;
      }

      if (inList) {
        output.push('\\end{itemize}');
        inList = false;
      }

      output.push(this.escapeLatexTextPreservingMath(trimmed));
    }

    if (inList) {
      output.push('\\end{itemize}');
    }

    return output.join('\n\n');
  }

  /**
   * Build a safe header string that won't trigger wrapping/page breaks.
   * @private
   */
  static buildHeaderText(program, subject) {
    const safeProgram = String(program || '').trim();
    const safeSubject = String(subject || '').trim();
    const raw = `SPECTROPY-${safeProgram} program-${safeSubject}`;
    const safe = raw.replace(/\s+/g, ' ').trim();
    return safe.length > 70 ? `${safe.slice(0, 67)}...` : safe;
  }

  /**
   * Escape LaTeX special characters in plain text.
   * @private
   */
  static escapeLatexText(text) {
    const normalized = this.replaceUnicodeTextSymbols(String(text || ''));
    return normalized
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }

  /**
   * Escape text but preserve LaTeX math segments.
   * @private
   */
  static escapeLatexTextPreservingMath(text) {
    const source = String(text || '');
    const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
    const isMath = /^(\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))$/;
    const parts = source.split(mathRegex);
    return parts
      .map((part) => {
        if (!part) return '';
        if (isMath.test(part)) return this.replaceUnicodeMathSymbols(part);
        return this.escapeLatexText(part);
      })
      .join('');
  }

  /**
   * Replace Unicode math symbols in plain text with ASCII-friendly forms.
   * @private
   */
  static replaceUnicodeTextSymbols(text) {
    return String(text || '')
      .replace(/≤/g, '<=')
      .replace(/≥/g, '>=')
      .replace(/≠/g, '!=')
      .replace(/≈/g, '~=')
      .replace(/±/g, '+/-')
      .replace(/×/g, 'x')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi')
      .replace(/∞/g, 'infinity');
  }

  /**
   * Replace Unicode math symbols inside math segments with LaTeX commands.
   * @private
   */
  static replaceUnicodeMathSymbols(text) {
    return String(text || '')
      .replace(/≤/g, '\\leq ')
      .replace(/≥/g, '\\geq ')
      .replace(/≠/g, '\\neq ')
      .replace(/≈/g, '\\approx ')
      .replace(/±/g, '\\pm ')
      .replace(/×/g, '\\times ')
      .replace(/÷/g, '\\div ')
      .replace(/π/g, '\\pi ')
      .replace(/∞/g, '\\infty ');
  }
}

module.exports = PDFCompiler;
