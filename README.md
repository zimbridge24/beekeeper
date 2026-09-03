# 비히어로 (BeeHero)

한국 양봉가를 위한 AI 양봉일지 및 봉군 건강관리 앱. Expo + Supabase, **local-first** 아키텍처 —
Expo SQLite가 유일한 local source of truth이고, UI는 오직 로컬 SQLite만 읽고 씁니다. Supabase와의
동기화는 완전히 분리된 별도 레이어(`src/sync/`)가 담당합니다.

전체 26개 화면 중 인증·양봉장/봉군 CRUD·오프라인 동기화·충돌 해결·방문 시작·빠른 선택형 기록까지
구현되어 있고, 음성 AI 내검·봉군 이력/건강 변화 화면은 다음 단계입니다.

## 시작하기

### 1. 환경변수

`.env` 파일에 Supabase anon key를 채워주세요 (URL은 이미 채워져 있습니다):

```
EXPO_PUBLIC_SUPABASE_URL=https://tsowznsmuspfqhsoybew.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<Supabase 대시보드 → Project Settings → API 에서 복사>
```

### 2. Supabase 스키마 적용

`supabase/migrations/0001_init.sql`과 `0002_visits_records.sql`을 **순서대로** Supabase
대시보드의 SQL Editor에 붙여넣어 실행하거나, Supabase CLI가 프로젝트에 연결되어 있다면:

```bash
supabase db push
```

### 3. 의존성 설치 및 실행

```bash
npm install
npx expo start
```

Expo Go 앱으로 QR코드를 스캔하면 휴대폰 인증(SMS OTP)·이메일/비밀번호 로그인과 양봉장·봉군
CRUD, 오프라인 저장·동기화·충돌 해결까지 전부 테스트할 수 있습니다.

### 4. 휴대폰 인증(SENS) 연결

문자 발송은 NCP SENS로 나가도록 커스텀 Edge Function(`supabase/functions/send-sms-hook`)을
Supabase의 "Send SMS Hook"에 연결해서 씁니다. [Supabase CLI](https://supabase.com/docs/guides/cli)가
설치되어 있어야 합니다.

```bash
supabase login
supabase link --project-ref tsowznsmuspfqhsoybew
supabase functions deploy send-sms-hook
```

배포 후 아래 secrets를 설정하세요 (NCP 콘솔 → 마이페이지 → 인증키 관리에서 Access/Secret Key,
SENS 콘솔 → 프로젝트 상세에서 Service ID 확인):

```bash
supabase secrets set NCP_ACCESS_KEY=<Access Key>
supabase secrets set NCP_SECRET_KEY=<Secret Key>
supabase secrets set NCP_SENS_SERVICE_ID=<SENS Service ID>
supabase secrets set NCP_SENS_SENDER_NUMBER=<등록된 발신번호, 숫자만 예: 01012345678>
```

마지막으로 Supabase 대시보드 → **Authentication → Hooks → Send SMS hook**에서 활성화하고,
방금 배포한 함수의 URL(`https://<project-ref>.supabase.co/functions/v1/send-sms-hook`)을
등록하면 대시보드가 hook secret(`v1,whsec_...`)을 보여줍니다. 그 값을 아래처럼 설정하세요:

```bash
supabase secrets set SEND_SMS_HOOK_SECRET="v1,whsec_..."
```

이 단계가 끝나야 로그인 화면의 "휴대폰 번호로 계속하기"가 실제로 문자를 보냅니다.

## 아키텍처

- **로컬 DB**: `src/db/schema.ts` (Drizzle ORM + expo-sqlite). `src/db/migrations/`는
  `npx drizzle-kit generate`로 생성되며, 앱 시작 시 `useDatabaseMigrations()`가 자동 적용합니다.
- **Repository 레이어**: `src/repositories/` — UI는 이 레이어를 통해서만 데이터를 읽고 씁니다.
  Supabase를 직접 호출하지 않습니다.
- **Sync 엔진**: `src/sync/` — outbox 패턴으로 로컬 mutation을 큐잉하고(`outbox.ts`), 온라인
  전환/앱 포그라운드 복귀 시(`triggers.ts`) push(`push.ts`) 후 pull(`pull.ts`)을 실행합니다.
  충돌은 `watermark_at_enqueue`와 서버 `updated_at`을 비교해 감지하고(`conflicts.ts`), 자동으로
  덮어쓰지 않고 `/sync/conflicts` 화면에서 사용자가 선택하게 합니다.
- **인증**: `src/auth/` — 휴대폰 인증(SMS OTP) + 이메일/비밀번호 (둘 다 Supabase Auth). 로컬
  `users` 테이블이 오프라인 부트스트랩 소스이며, 네트워크 실패로는 강제 로그아웃하지 않습니다.
- **디자인 토큰**: `src/theme/tokens.ts` — Claude Design 캔버스에서 추출한 정확한 컬러·타이포·
  spacing 값. Pretendard 폰트는 `assets/fonts/`에 로컬 번들되어 있습니다.

## 검증 시나리오

이 환경(Claude Code)에는 모바일 시뮬레이터가 없어 타입체크·번들링까지만 확인했습니다. 아래
시나리오는 사용자가 직접 기기에서 확인해주세요:

1. 회원가입 → 로그인 → 첫 양봉장/봉군 등록 → 홈 화면 진입
2. 비행기 모드 켜고 봉군 이름 수정 → "기기 내 저장" 상태 확인
3. 비행기 모드 해제 → 자동 동기화 → "동기화 완료" 확인 (`/sync/status`)
4. 같은 계정으로 다른 기기(또는 Supabase 대시보드에서 직접)에서 같은 봉군을 다르게 수정 →
   두 기기 모두 온라인 상태로 동기화 → 충돌 배너 확인 → `/sync/conflicts`에서 해결
5. 홈에서 "오늘 내검 시작하기" (또는 봉군 상세에서 "빠른 상태 선택으로 내검하기") → 여러
   항목 있음/없음/확인 안 함으로 선택 → 저장 → 연속 내검 현황 화면에서 완료 표시 확인 →
   동기화 후 Supabase `records`/`record_field_values` 테이블에 데이터 확인

## 다음 단계

음성 녹음 · AI 구조화 검토 · 봉군 이력/건강 변화 화면 · 사진 첨부는 아직 구현되지 않았습니다
(`record_transcripts`, `photos` 테이블 설계는 완료되어 있으나 마이그레이션에는 포함하지
않았습니다).
