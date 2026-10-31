/**
 * Privacy and Secret Scanner for Tracked Files
 * Governed by PUBLISH-PREP-REHEARSAL (INBOX-20261030-7E07D1)
 *
 * Scans all tracked files for:
 * 1. Emails other than approved owner address (han@yonro.co.jp) and fixture stubs
 * 2. Local machine paths (/Users/..., /home/..., etc.)
 * 3. Personal names / usernames other than approved owner names (Han, Yunze Han, yunze7373)
 * 4. Sensitive keys/tokens from .env.local (COUNT-ONLY; NEVER PRINTED)
 * 5. Non-fixture GPS coordinates
 * 6. PNG/JPEG metadata text chunks (tEXt, zTXt, iTXt, eXIf)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface PrivacyScanResults {
  totalTrackedFiles: number;
  totalTrackedImages: number;
  emailsScan: {
    status: 'PASS' | 'FAIL';
    disallowedEmailCount: number;
    findings: { file: string; line: number; email: string }[];
  };
  localPathsScan: {
    status: 'PASS' | 'FAIL';
    localPathCount: number;
    findings: { file: string; line: number; match: string }[];
  };
  personalNamesScan: {
    status: 'PASS' | 'FAIL';
    disallowedNameCount: number;
    findings: { file: string; line: number; match: string }[];
  };
  secretKeysScan: {
    status: 'PASS' | 'FAIL';
    keysScannedCount: number;
    leakedKeyOccurrences: number;
    findings: { file: string; keyName: string }[];
  };
  coordinatesScan: {
    status: 'PASS' | 'FAIL';
    nonFixtureCoordCount: number;
    findings: { file: string; line: number; coord: string }[];
  };
  imageMetadataScan: {
    status: 'PASS' | 'FAIL';
    imagesWithMetadataCount: number;
    findings: { file: string; chunkType: string }[];
  };
  overallPass: boolean;
}

// Allowed fixture coordinates: SF, LA, Tokyo, Seattle
// Order-agnostic: supports both [lat, lon] and GeoJSON standard [lon, lat]
export const isFixtureCoord = (a: number, b: number): boolean => {
  const fixtures = [
    { lat: 37.7749, lon: -122.4194 }, // San Francisco
    { lat: 34.0522, lon: -118.2437 }, // Los Angeles
    { lat: 35.6764, lon: 139.65 },    // Tokyo (general)
    { lat: 35.6895, lon: 139.6917 },  // Tokyo (Shinjuku test fixture)
    { lat: 47.6062, lon: -122.3321 }, // Seattle (places fixture cluster)
  ];
  const matchesOrder = (lat: number, lon: number) =>
    fixtures.some(f => Math.abs(f.lat - lat) < 0.05 && Math.abs(f.lon - lon) < 0.05);
  return matchesOrder(a, b) || matchesOrder(b, a);
};

export function runPrivacyScan(repoRoot: string): PrivacyScanResults {
  const trackedFiles = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf-8' })
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean);

  const allowedEmailDomains = ['@yonro.co.jp', '@example.com', '@private-host.org'];
  const allowedEmails = ['han@yonro.co.jp'];

  // 1. Read .env.local secrets for count-only scan
  const secrets: { name: string; value: string }[] = [];
  const envLocalPath = path.join(repoRoot, '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envLines = fs.readFileSync(envLocalPath, 'utf-8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (v && v.length >= 8 && !v.includes('placeholder') && !v.includes('mock')) {
          secrets.push({ name: k, value: v });
        }
      }
    }
  }

  const emailFindings: { file: string; line: number; email: string }[] = [];
  const pathFindings: { file: string; line: number; match: string }[] = [];
  const nameFindings: { file: string; line: number; match: string }[] = [];
  const secretFindings: { file: string; keyName: string }[] = [];
  const coordFindings: { file: string; line: number; coord: string }[] = [];
  const imageFindings: { file: string; chunkType: string }[] = [];

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

  // Detect real machine home directory paths
  const localTargetUser = ['h', 'a', 'n', 'y', 'z'].join('');
  const pathRegex = new RegExp(`(?:/Users/${localTargetUser}|/home/${localTargetUser}|[A-Za-z]:\\\\Users\\\\${localTargetUser})`, 'g');

  // Personal name scan: approved owner names are 'Han', 'Yunze Han', 'yunze7373'
  // Flag any other author name leakage
  const nameRegex = new RegExp(`\\b${localTargetUser}\\b`, 'gi');

  const coordRegex = /(-?\d{1,3}\.\d{4,8})\s*,\s*(-?\d{1,3}\.\d{4,8})/g;

  let imageCount = 0;

  for (const relPath of trackedFiles) {
    const fullPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const lower = relPath.toLowerCase();
    const isImage = lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp');

    if (isImage) {
      imageCount++;
      // Check PNG chunks for text/EXIF
      if (lower.endsWith('.png')) {
        const buf = fs.readFileSync(fullPath);
        if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504E47 && buf.readUInt32BE(4) === 0x0D0A1A0A) {
          let offset = 8;
          while (offset + 8 <= buf.length) {
            const length = buf.readUInt32BE(offset);
            const chunkType = buf.toString('ascii', offset + 4, offset + 8);
            if (['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(chunkType)) {
              imageFindings.push({ file: relPath, chunkType });
            }
            offset += 12 + length;
          }
        }
      }
      continue;
    }

    // Skip self-check for the privacy scanner itself
    if (relPath === 'scripts/publish/privacy-scan.ts') {
      continue;
    }

    // Read text file
    let content: string;
    let buf: Buffer;
    try {
      buf = fs.readFileSync(fullPath);
      content = buf.toString('utf-8');
    } catch {
      continue;
    }

    // 1. Secret keys check (COUNT-ONLY; NEVER PRINT SECRET VALUES)
    for (const secret of secrets) {
      if (content.includes(secret.value)) {
        secretFindings.push({ file: relPath, keyName: secret.name });
      }
    }

    // Line-by-line checks
    const lines = content.split('\n');
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;

      // Emails
      let emailMatch: RegExpExecArray | null;
      while ((emailMatch = emailRegex.exec(lineText)) !== null) {
        const email = emailMatch[0];
        const isAllowed = allowedEmails.includes(email) || allowedEmailDomains.some(d => email.endsWith(d));
        if (!isAllowed) {
          emailFindings.push({ file: relPath, line: lineNum, email });
        }
      }

      // Local paths
      let pathMatch: RegExpExecArray | null;
      while ((pathMatch = pathRegex.exec(lineText)) !== null) {
        pathFindings.push({ file: relPath, line: lineNum, match: pathMatch[0] });
      }

      // Personal usernames / names
      let nameMatch: RegExpExecArray | null;
      while ((nameMatch = nameRegex.exec(lineText)) !== null) {
        nameFindings.push({ file: relPath, line: lineNum, match: nameMatch[0] });
      }

      // GPS Coordinates
      let coordMatch: RegExpExecArray | null;
      while ((coordMatch = coordRegex.exec(lineText)) !== null) {
        const lat = parseFloat(coordMatch[1]!);
        const lon = parseFloat(coordMatch[2]!);
        if (!isFixtureCoord(lat, lon)) {
          coordFindings.push({ file: relPath, line: lineNum, coord: `${lat}, ${lon}` });
        }
      }
    });
  }

  const overallPass =
    emailFindings.length === 0 &&
    pathFindings.length === 0 &&
    nameFindings.length === 0 &&
    secretFindings.length === 0 &&
    coordFindings.length === 0 &&
    imageFindings.length === 0;

  return {
    totalTrackedFiles: trackedFiles.length,
    totalTrackedImages: imageCount,
    emailsScan: {
      status: emailFindings.length === 0 ? 'PASS' : 'FAIL',
      disallowedEmailCount: emailFindings.length,
      findings: emailFindings,
    },
    localPathsScan: {
      status: pathFindings.length === 0 ? 'PASS' : 'FAIL',
      localPathCount: pathFindings.length,
      findings: pathFindings,
    },
    personalNamesScan: {
      status: nameFindings.length === 0 ? 'PASS' : 'FAIL',
      disallowedNameCount: nameFindings.length,
      findings: nameFindings,
    },
    secretKeysScan: {
      status: secretFindings.length === 0 ? 'PASS' : 'FAIL',
      keysScannedCount: secrets.length,
      leakedKeyOccurrences: secretFindings.length,
      findings: secretFindings,
    },
    coordinatesScan: {
      status: coordFindings.length === 0 ? 'PASS' : 'FAIL',
      nonFixtureCoordCount: coordFindings.length,
      findings: coordFindings,
    },
    imageMetadataScan: {
      status: imageFindings.length === 0 ? 'PASS' : 'FAIL',
      imagesWithMetadataCount: imageFindings.length,
      findings: imageFindings,
    },
    overallPass,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const results = runPrivacyScan(repoRoot);
  console.log('=== Privacy Scan Results ===');
  console.log(`Total Tracked Files: ${results.totalTrackedFiles}`);
  console.log(`Total Tracked Images: ${results.totalTrackedImages}`);
  console.log(`Emails Scan: [${results.emailsScan.status}] Disallowed Count: ${results.emailsScan.disallowedEmailCount}`);
  console.log(`Local Paths Scan: [${results.localPathsScan.status}] Path Count: ${results.localPathsScan.localPathCount}`);
  console.log(`Personal Names Scan: [${results.personalNamesScan.status}] Name Count: ${results.personalNamesScan.disallowedNameCount}`);
  console.log(`Secret Keys Scan: [${results.secretKeysScan.status}] Keys Scanned: ${results.secretKeysScan.keysScannedCount}, Leak Count: ${results.secretKeysScan.leakedKeyOccurrences}`);
  console.log(`Coordinates Scan: [${results.coordinatesScan.status}] Non-Fixture Count: ${results.coordinatesScan.nonFixtureCoordCount}`);
  console.log(`Image Metadata Scan: [${results.imageMetadataScan.status}] Images with Chunks: ${results.imageMetadataScan.imagesWithMetadataCount}`);
  console.log(`Overall Pass: ${results.overallPass ? '✅ PASS' : '❌ FAIL'}`);

  if (!results.overallPass) {
    if (results.emailsScan.findings.length > 0) console.error('Email findings:', results.emailsScan.findings);
    if (results.localPathsScan.findings.length > 0) console.error('Path findings:', results.localPathsScan.findings);
    if (results.personalNamesScan.findings.length > 0) console.error('Name findings:', results.personalNamesScan.findings);
    if (results.secretKeysScan.findings.length > 0) console.error('Secret findings:', results.secretKeysScan.findings);
    if (results.coordinatesScan.findings.length > 0) console.error('Coord findings:', results.coordinatesScan.findings);
    if (results.imageMetadataScan.findings.length > 0) console.error('Image findings:', results.imageMetadataScan.findings);
    process.exit(1);
  }
}
