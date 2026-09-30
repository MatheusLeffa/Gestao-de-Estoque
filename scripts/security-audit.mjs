// InsumoSync: Automated Security & Credential Audit Script
// Executado pelo hook .githooks/pre-commit e pelo subagente verifier
// Scans the codebase for exposed keys, JWT tokens, connection strings, or hardcoded credentials.

import fs from 'fs';
import path from 'path';

const FORBIDDEN_PATTERNS = [
  { name: 'JWT Anon/Service Key', regex: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g },
  { name: 'Hardcoded Fallback Anon Key', regex: /NEXT_PUBLIC_SUPABASE_ANON_KEY\s*\|\|\s*['"][^'"]+['"]/g },
  { name: 'Hardcoded Fallback Project URL', regex: /NEXT_PUBLIC_SUPABASE_URL\s*\|\|\s*['"][^'"]+['"]/g },
  { name: 'Hardcoded Supabase Project ID in Code', regex: /https:\/\/[a-z0-9]{15,}\.supabase\.co/g },
  { name: 'Database Password/Connection URI in Code', regex: /postgres(ql)?:\/\/[^:]+:[^@]+@/g },
  { name: 'Service Role Key keyword', regex: /service_role_key\s*=\s*['"][^'"]+['"]/gi },
];

const IGNORED_PATHS = [
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.env',
  '.env.local',
  '.env.example',
  'package-lock.json',
];

function scanDirectory(dir, issues = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), fullPath);

    if (IGNORED_PATHS.some((ignored) => relativePath.startsWith(ignored) || entry.name === ignored)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, issues);
    } else if (entry.isFile()) {
      // Only scan code & config & doc files
      const ext = path.extname(entry.name);
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.sql', '.md', '.env'].includes(ext) || entry.name === '.gitignore') {
        const content = fs.readFileSync(fullPath, 'utf8');

        for (const pattern of FORBIDDEN_PATTERNS) {
          // In docs, database-schema or ADR, allow generic documentation examples
          if (ext === '.md' && pattern.name === 'Hardcoded Supabase Project ID in Code') {
            continue;
          }
          if (ext === '.sql' && pattern.name === 'Hardcoded Supabase Project ID in Code') {
            continue;
          }

          const matches = content.match(pattern.regex);
          if (matches) {
            issues.push({
              file: relativePath,
              pattern: pattern.name,
              matches: matches.length,
            });
          }
        }
      }
    }
  }

  return issues;
}

console.log('🔒 ========================================================');
console.log('🔒 INSUMOSYNC: AUDITORIA DE SEGURANÇA E ZERO CREDENCIAIS');
console.log('🔒 Executado pelo hook de pre-commit e pelo verifier');
console.log('🔒 ========================================================\n');

const issues = scanDirectory(process.cwd());

if (issues.length > 0) {
  console.error('❌ ALERTA CRÍTICO: FORAM ENCONTRADAS CREDENCIAIS OU SEGREDOS EXPOSTOS!');
  for (const issue of issues) {
    console.error(` - Arquivo: ${issue.file} | Violação: ${issue.pattern} (${issue.matches} ocorrência(s))`);
  }
  console.error('\n🚫 O commit ou entrega foi abortado pela auditoria de segurança.');
  process.exit(1);
} else {
  console.log('✅ AUDITORIA CONCLUÍDA COM SUCESSO: 0 VULNERABILIDADES OU CHAVES EXPOSTAS.');
  console.log('🛡️ O código está seguro e em total conformidade com os Guard Rails.\n');
  process.exit(0);
}
