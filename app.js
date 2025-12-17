import { spawn } from 'node:child_process';
import nodefs from 'node:fs';
import nodepath from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = nodepath.dirname(__filename);

function getFontsProfilerJson() {
  return new Promise((resolve, reject) => {
    const p = spawn('system_profiler', ['-json', 'SPFontsDataType'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');

    p.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    p.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    p.on('error', reject);

    p.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`system_profiler exited with ${code}\n${stderr}`)
        );
      }

      try {
        const json = JSON.parse(stdout);
        resolve(json);
      } catch (e) {
        reject(
          new Error(
            'Failed to parse system_profiler output as JSON\n' + e.message
          )
        );
      }
    });
  });
}

function safe(s, dash = false, fallback = 'Unknown') {
  return (
    String(s ?? fallback)
      .normalize('NFC')
      .replace(/^\.+/, '')
      .replace(/[\/\\:\0\r\n\t]+/g, '_')
      .replace(/\s+/g, dash ? '-' : ' ')
      .trim()
      .slice(0, 120) || fallback
  );
}

(async () => {
  console.log('Scanning system fonts...');

  const data = await getFontsProfilerJson();

  console.log('Organize scanned fonts...');

  const fonts = {};

  for (const font of data.SPFontsDataType) {
    const path = font.path;
    const _name = font._name;

    for (const type of font.typefaces) {
      const family = type.family;
      const style = type.style;
      const name = type._name;
      const fullname = type.fullname;

      if (!fonts[family]) {
        fonts[family] = {
          styles: {},
        };
      }
      fonts[family].styles[style] = {
        name: name,
        fullname: fullname,
        path: path,
      };
    }
  }

  console.log('Backup fonts...');

  const backuped = new Set();

  const backupDir = nodepath.resolve(
    __dirname,
    `backup/font-backup-${Date.now()}`
  );
  nodefs.mkdirSync(backupDir, { recursive: true });

  for (const family in fonts) {
    const f = fonts[family];
    s: for (const style in f.styles) {
      const s = f.styles[style];

      const path = s.path;
      if (backuped.has(path)) {
        continue s;
      }

      const familyName = safe(family);

      const ext = nodepath.extname(path).toLowerCase();
      let fileName = safe(nodepath.basename(path));
      fileName = fileName.substring(0, fileName.length - ext.length);

      const familyDir = nodepath.resolve(backupDir, familyName);
      nodefs.mkdirSync(familyDir, { recursive: true });

      let backupName = safe(ext === '.ttc' ? fileName : s.name, true);
      const fontFile = nodepath.resolve(familyDir, backupName + ext);
      console.log(`  Backup: ${backupName}`);
      nodefs.copyFileSync(path, fontFile);

      backuped.add(path);
    }
  }

  console.log('');
  console.log(
    `Task complete. ${Object.keys(fonts).length} families, ${
      backuped.size
    } files backed up to`
  );
  console.log(' ', backupDir);
})();
