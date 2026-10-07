// 앱의 순수 규칙 코드(필드 카탈로그, 응애 위험도, 점검 알림 규칙 엔진)를 Supabase Edge
// Function이 import할 수 있는 위치로 복사한다. Edge Function은 supabase/functions/ 밖의
// 파일을 번들하지 못하므로 복사본이 필요하고, 손으로 두 벌을 관리하면 앱과 서버가 서로 다른
// 규칙을 갖게 되므로 항상 이 스크립트로만 만든다.
//
//   npm run sync:ai-catalog                 복사본 갱신
//   npm run sync:ai-catalog -- --check      복사본이 최신인지만 검사 (다르면 exit 1)
//
// 변환 규칙:
//   - 모든 파일을 supabase/functions/_shared/ 한 폴더에 평평하게 둔다.
//   - 상대 import는 './<파일이름>.ts' 로 바꾼다 (Deno는 확장자가 필요하다).
//   - 앱 DB 스키마의 타입 import는 같은 모양의 로컬 타입으로 바꾼다.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targetDir = path.join(root, 'supabase/functions/_shared');

// 서버가 쓰는 파일만. 이 파일들은 React Native·앱 내부 모듈에 의존하면 안 된다 (타입 import만 허용).
const SOURCES = [
  'src/features/records/recordTypesConfig.ts',
  'src/features/health/time.ts',
  'src/features/health/ruleConstants.ts',
  'src/features/health/hornetRisk.ts',
  'src/features/health/miteThresholds.ts',
  'src/features/health/miteRisk.ts',
  'src/features/health/facts.ts',
  'src/features/health/reminders.ts',
];

const SCHEMA_TYPES = {
  RiskLevel: "type RiskLevel = 'low' | 'caution' | 'high';",
  RecordType: 'type RecordType = string;',
};

const HEADER = (src) => `// AUTO-GENERATED — 직접 수정하지 마세요.
// 원본: ${src}  (npm run sync:ai-catalog 로 갱신)

`;

function transform(source, text) {
  let out = text.replace(/\r\n/g, '\n');

  out = out.replace(/^import type \{ ([A-Za-z, ]+) \} from '\.\.\/\.\.\/db\/schema';\n/gm, (_, names) => {
    const lines = names.split(',').map((n) => n.trim()).map((n) => {
      if (!SCHEMA_TYPES[n]) throw new Error(`${source}: db/schema 타입 "${n}" 의 서버용 대체가 없습니다 — 스크립트에 추가하세요.`);
      return SCHEMA_TYPES[n];
    });
    return lines.join('\n') + '\n';
  });

  out = out.replace(/(from\s+')(\.{1,2}\/[^']+)(')/g, (_, a, rel, c) => `${a}./${path.basename(rel)}.ts${c}`);

  if (/from '(?!\.\/)\.{1,2}\//.test(out) || /db\/schema/.test(out.replace(/^\/\/.*$/gm, ''))) {
    throw new Error(`${source}: 서버로 옮길 수 없는 import가 남아 있습니다.`);
  }
  return HEADER(source) + out;
}

const check = process.argv.includes('--check');
let stale = 0;

for (const source of SOURCES) {
  const generated = transform(source, fs.readFileSync(path.join(root, source), 'utf8'));
  const target = path.join(targetDir, path.basename(source));
  if (check) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== generated) {
      console.error(`최신이 아님: ${path.relative(root, target)}`);
      stale++;
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(target, generated);
  }
}

if (check) {
  if (stale > 0) {
    console.error('`npm run sync:ai-catalog` 를 실행하세요.');
    process.exit(1);
  }
  console.log('서버 공유 파일이 최신입니다.');
} else {
  console.log(`복사 완료: ${SOURCES.length}개 → supabase/functions/_shared/`);
}
