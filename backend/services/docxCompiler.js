const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

function execFileAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(stderr || stdout || error.message);
        err.cause = error;
        return reject(err);
      }
      return resolve({ stdout, stderr });
    });
  });
}

class DocxCompiler {
  static async compile(latexContent, worksheetId) {
    const pandocBin = process.env.PANDOC_BIN || 'pandoc';
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `p2m-docx-${worksheetId}-`));
    const inputPath = path.join(workDir, 'manual.tex');
    const outputPath = path.join(workDir, 'manual.docx');

    try {
      await fs.writeFile(inputPath, latexContent, 'utf8');
      await execFileAsync(pandocBin, ['--from=latex', '--to=docx', inputPath, '-o', outputPath], {
        timeout: 120000,
        windowsHide: true
      });
      const docxBuffer = await fs.readFile(outputPath);
      return docxBuffer;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}

module.exports = DocxCompiler;
