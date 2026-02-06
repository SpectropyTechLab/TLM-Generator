const axios = require('axios');
require('dotenv').config();

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192);
const CHUNK_SIZE = Number(process.env.WORKSHEET_CHUNK_SIZE || 4);
const MAX_CHUNK_DEPTH = Number(process.env.WORKSHEET_MAX_CHUNK_DEPTH || 2);
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

class LatexGenerator {
  /**
   * Generate LaTeX code from extracted text
   * @param {string} text - Extracted text content
   * @param {string} program - Program name
   * @param {string} subject - Subject name
   * @param {string} chapterName - Chapter name
   * @returns {Promise<string>}
   */
  static async generate(text, program, subject, chapterName) {
    try {
      if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing. Set it in backend/.env.');
      }

      const chunks = this.chunkWorksheet(text);
      if (chunks.length === 0) {
        throw new Error('No worksheet content found to process.');
      }

      const outputs = [];
      for (let i = 0; i < chunks.length; i += 1) {
        const chunkText = await this.generateChunkWithRetries(
          DEFAULT_MODEL,
          chunks[i],
          program,
          subject,
          chapterName,
          i === 0,
          0
        );
        if (!chunkText.trim()) {
          throw new Error('Gemini returned empty content.');
        }
        outputs.push(this.cleanGeneratedText(chunkText));
      }

      const merged = this.mergeChunkOutputs(outputs);
      if (!merged.trim()) {
        throw new Error('Gemini returned empty content after merge.');
      }

      return merged;
    } catch (error) {
      console.error('LaTeX generation error:', error);
      if (error?.response?.status === 404 && FALLBACK_MODELS.length > 0) {
        console.warn(`Model "${DEFAULT_MODEL}" not found. Trying fallbacks: ${FALLBACK_MODELS.join(', ')}`);
        for (const model of FALLBACK_MODELS) {
          try {
            const chunks = this.chunkWorksheet(text);
            const outputs = [];
            for (let i = 0; i < chunks.length; i += 1) {
              const chunkText = await this.generateChunkWithRetries(
                model,
                chunks[i],
                program,
                subject,
                chapterName,
                i === 0,
                0
              );
              if (chunkText.trim()) {
                outputs.push(this.cleanGeneratedText(chunkText));
              }
            }
            const merged = this.mergeChunkOutputs(outputs);
            if (merged.trim()) {
              return merged;
            }
          } catch (fallbackError) {
            console.warn(`Fallback model "${model}" failed: ${fallbackError?.message || fallbackError}`);
          }
        }
      }
      if (error?.response?.status === 429) {
        if (process.env.GEMINI_FALLBACK === 'true') {
          console.warn('Gemini quota exceeded. Using fallback LaTeX.');
          return this.buildFallbackLatex(text, program, subject, chapterName);
        }
        throw new Error('Gemini quota exceeded. Check your AI Studio plan/billing.');
      }
      throw new Error(`Failed to generate LaTeX: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Call Gemini generateContent for a specific model.
   * @private
   */
  static async generateWithModel(modelName, prompt) {
    const normalizedModel = modelName.startsWith('models/')
      ? modelName
      : `models/${modelName}`;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS
        }
      },
      {
        headers: {
          'x-goog-api-key': GEMINI_API_KEY,
          'content-type': 'application/json'
        },
        timeout: 60000
      }
    );

    return (
      response?.data?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text || '')
        .join('') || ''
    );
  }

  /**
   * Build prompt for Gemini
   * @private
   */
  static buildPrompt(text, program, subject, chapterName, includeHeader) {
    const worksheetTitle = this.resolveWorksheetTitle(program, subject, chapterName);
    const headerBlock = includeHeader
      ? `SPECTROPY-IIT FOUNDATION MENTOR'S MANUAL
Worksheet: ${worksheetTitle}
Syllabus Topics Covered: <comma-separated topics inferred from the worksheet>
Answer Key and Detailed Solutions

`
      : '';

    return `You are an educational worksheet expert.
Read ALL questions from the worksheet and generate full solutions for every question.
Return ONLY plain text. No markdown fences, no bullet markdown.
Preserve LaTeX math exactly as provided in the input, including delimiters ($...$, $$...$$, \\( ... \\), \\[ ... \\]).
Do NOT rewrite, simplify, or remove any LaTeX.
Use only ASCII characters (LaTeX backslashes are allowed).
STRICT RULES (must follow):
1. Do NOT change question order.
2. Do NOT skip any question.
3. Do NOT merge questions.
4. Do NOT renumber questions.
5. Output must follow the exact format.
6. Keep all mathematical expressions exactly as in the input (do not rewrite or simplify).
7. Preserve numbers, symbols, and equation formatting verbatim.

FORMAT (follow exactly):
${headerBlock}1. <question text>
(a) ...
(b) ...
(c) ...
(d) ...
Key: (<correct option letter>) <answer text if available>
Solution:
 <explanation line 1>
 <explanation line 2>
 <explanation line 3>
 <explanation line 4>
 <explanation line 5>

If "Syllabus Topics Covered:" is present, fill it with concise comma-separated topics (do not leave it empty).

RULES:
1. Keep every question from the worksheet, do NOT skip any.
2. Do NOT renumber existing questions if numbers are provided.
3. Keep options on their own lines exactly as shown above.
4. Provide a Key and Solution for each question.
5. Solution must be 5 to 6 short lines, each starting with "- ".
6. If any question text is unclear, still output a best-effort key and solution.

Convert the following worksheet content into the format above.

PROGRAM: ${String(program || '').toUpperCase()}
SUBJECT: ${String(subject || '').toUpperCase()}

CONTENT:
${text}

Return ONLY the plain text. No explanations.`;
  }

  /**
   * Clean and validate generated text
   * @private
   */
  static cleanGeneratedText(text) {
    const cleaned = (text || '')
      .replace(/^```[\s\S]*?\n?/gm, '')
      .replace(/^```\s*\n?/gm, '')
      .trim();
    return this.removeDuplicateLines(cleaned);
  }

  /**
   * Remove consecutive duplicate lines to reduce repetition.
   * @private
   */
  static removeDuplicateLines(text) {
    const lines = (text || '').split(/\r?\n/);
    const output = [];
    let last = '';
    for (const line of lines) {
      const normalized = line.trim().replace(/\s+/g, ' ');
      if (normalized && normalized === last) {
        continue;
      }
      output.push(line);
      last = normalized;
    }
    return output.join('\n').trim();
  }

  /**
   * Fallback plain text when Gemini quota is unavailable
   * @private
   */
  static buildFallbackLatex(text, program, subject, chapterName) {
    const safeText = (text || '')
      .slice(0, 4000);
    const worksheetTitle = this.resolveWorksheetTitle(program, subject, chapterName);

    return `SPECTROPY-IIT FOUNDATION MENTOR'S MANUAL
Worksheet: ${worksheetTitle}
Syllabus Topics Covered: 
Answer Key and Detailed Solutions

1. ${safeText}
(a)
(b)
(c)
(d)
Key:
Solution:
- 
- 
- 
- 
-`;
  }

  /**
   * Generate a chunk and ensure all questions are answered; split if needed.
   * @private
   */
  static async generateChunkWithRetries(model, chunkText, program, subject, chapterName, includeHeader, depth) {
    const prompt = this.buildPrompt(chunkText, program, subject, chapterName, includeHeader);
    const output = await this.generateWithModel(model, prompt);
    const cleaned = this.cleanGeneratedText(output);

    const expected = this.countQuestions(chunkText);
    const actual = this.countQuestions(cleaned);

    if (expected > 0 && actual > 0 && actual < expected && depth < MAX_CHUNK_DEPTH) {
      const subChunks = this.splitChunkInHalf(chunkText);
      const results = [];
      for (let i = 0; i < subChunks.length; i += 1) {
        const subText = await this.generateChunkWithRetries(
          model,
          subChunks[i],
          program,
          subject,
          chapterName,
          includeHeader && i === 0,
          depth + 1
        );
        results.push(subText);
      }
      return this.mergeChunkOutputs(results);
    }

    return cleaned;
  }

  /**
   * Count questions by number markers.
   * @private
   */
  static countQuestions(text) {
    if (!text) return 0;
    const matches = text.match(/(^|\n)\s*(?:Q\s*)?(\d+)[\.\)]\s+/gi);
    return matches ? matches.length : 0;
  }

  /**
   * Split a chunk into two halves by question blocks.
   * @private
   */
  static splitChunkInHalf(text) {
    const source = (text || '').trim();
    if (!source) return [];
    const parts = source.split(/\n(?=\s*(?:Q\s*)?\d+[\.\)]\s+)/i);
    if (parts.length <= 1) return [source];
    const mid = Math.ceil(parts.length / 2);
    return [
      parts.slice(0, mid).join('\n').trim(),
      parts.slice(mid).join('\n').trim()
    ].filter(Boolean);
  }

  /**
   * Split worksheet into question-based chunks for reliable completion.
   * @private
   */
  static chunkWorksheet(text) {
    const source = (text || '').trim();
    if (!source) return [];

    const matches = [];
    const regex = /(^|\n)\s*(?:Q\s*)?(\d+)[\.\)]\s+/gi;
    let match;
    while ((match = regex.exec(source)) !== null) {
      matches.push({ index: match.index, number: match[2] });
    }

    if (matches.length === 0) {
      return [source];
    }

    const questions = [];
    for (let i = 0; i < matches.length; i += 1) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
      const block = source.slice(start, end).trim();
      if (block) questions.push(block);
    }

    if (questions.length <= CHUNK_SIZE) {
      return [questions.join('\n\n')];
    }

    const chunks = [];
    for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
      chunks.push(questions.slice(i, i + CHUNK_SIZE).join('\n\n'));
    }
    return chunks;
  }

  /**
   * Merge chunk outputs, keeping the header only once.
   * @private
   */
  static mergeChunkOutputs(outputs) {
    if (outputs.length === 0) return '';
    const [first, ...rest] = outputs;
    const cleanedRest = rest.map((text) => this.stripHeader(text)).filter(Boolean);
    return [first, ...cleanedRest].join('\n\n').trim();
  }

  /**
   * Remove repeated header lines from chunk output.
   * @private
   */
  static stripHeader(text) {
    const lines = (text || '').split(/\r?\n/);
    const headerLine = "SPECTROPY-IIT FOUNDATION MENTOR'S MANUAL";
    const removePrefixes = new Set([
      headerLine,
      'Answer Key and Detailed Solutions'
    ]);

    const result = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (removePrefixes.has(line)) continue;
      if (line.startsWith('Worksheet:')) continue;
      if (line.startsWith('Syllabus Topics Covered:')) continue;
      result.push(lines[i]);
    }
    return result.join('\n').trim();
  }

  /**
   * Resolve the worksheet title for the header.
   * @private
   */
  static resolveWorksheetTitle(program, subject, chapterName) {
    const safeChapter = String(chapterName || '').trim();
    if (safeChapter) {
      return safeChapter.toUpperCase();
    }
    const safeProgram = String(program || '').trim();
    const safeSubject = String(subject || '').trim();
    const fallback = [safeProgram, safeSubject].filter(Boolean).join(' - ');
    return fallback || 'WORKSHEET';
  }
}

module.exports = LatexGenerator;
