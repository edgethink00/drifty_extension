# Drifty Chrome extension

현재 구현의 빌드·설치는 아래 **현재 소스와 빌드**를 따릅니다. 과거 deTime 설명은 역사 자료로 보존합니다.

**iOS Screen Time for Web** - Session-based web activity tracking and categorization Chrome Extension

웹 활동을 자동으로 추적하고 분석하는 Chrome Extension입니다. iOS Screen Time과 동일한 사용자 경험으로 웹 사용 패턴을 파악할 수 있습니다.

## 🎯 주요 기능

### ✨ 핵심 기능

- **🤖 자동 카테고리 분류**: URL과 페이지 제목을 분석하여 자동으로 8개 카테고리로 분류
- **📊 Session 기반 추적**: 연관된 활동을 하나의 세션으로 묶어 맥락있는 분석 제공
- **📱 iOS 스타일 UI**: 익숙한 Screen Time UI로 직관적인 사용 경험
- **⏰ 시간 제한**: 카테고리별 일일 사용 시간 제한 설정
- **📈 상세한 통계**: 일일/주간 통계, 타임라인, 가장 많이 사용한 사이트 등
- **🔒 Privacy Mode**: 민감한 콘텐츠 자동 감지 및 처리

### 📊 카테고리

1. **📱 Social Media** - Instagram, Twitter, Facebook, TikTok 등
2. **🎬 Entertainment** - YouTube, Netflix, Twitch, Spotify 등
3. **💼 Productivity** - Gmail, Slack, GitHub, Notion 등
4. **🛒 Shopping** - Amazon, 쿠팡, eBay 등
5. **📰 News & Reading** - 뉴스 사이트, Medium, Reddit 등
6. **🎮 Games** - Steam, 게임 사이트 등
7. **📚 Education** - Coursera, Stack Overflow, Wikipedia 등
8. **➕ Other** - 미분류 사이트

## 현재 소스와 빌드

현재 Manifest V3 빌드는 Vite, React, TypeScript를 사용합니다. [AGENTS.md](AGENTS.md)의 소스 지도를 참고하세요.

```text
src/manifest.ts             # dist/manifest.json 생성 원본
src/background/             # 서비스 워커
src/content/                # 콘텐츠 스크립트
src/popup/                  # React 팝업
src/dashboard/              # React 대시보드·설정 진입점
src/onboarding/             # React 온보딩
src/lib/                    # 도메인·메시지·클라이언트 계약
src/shared/                 # 공통 UI
vite.config.ts              # 빌드 입력과 정적 복사
```

저장소 루트에서 실행합니다:

```bash
npm ci
npm run typecheck
npm run build
```

`chrome://extensions`에서 개발자 모드를 켜고 생성된 `dist/`를 압축 해제된 확장 프로그램으로 로드합니다. 변경 후 다시 빌드하고 확장 프로그램을 새로고침합니다. UI 검증은 `npm run test:ui`를 참고하세요.

## 과거 deTime 사용·설계 기록

아래 사용법, 저장 구조, 로드맵과 이 문서 앞부분의 기능 소개는 이전 deTime 구현 기록입니다. 현재 빌드의 기능·전송 경계·배포 상태를 보장하지 않습니다. 현재 동작을 수정할 때는 `src/`의 실제 소비자와 위 빌드 경로를 기준으로 확인하세요.

## 📖 사용 방법

### 기본 사용

1. **확장 프로그램 설치 후** 웹 브라우징을 시작하면 자동으로 추적이 시작됩니다.

2. **팝업에서 빠른 확인**: 툴바의 확장 프로그램 아이콘을 클릭하면 오늘의 요약 정보를 볼 수 있습니다.

3. **전체 대시보드**: "View Full Dashboard" 버튼을 클릭하여 상세한 통계를 확인합니다.

### Session 추적 로직

deTime은 다음과 같이 세션을 추적합니다:

1. **CORE Session**: 같은 카테고리의 활동이 5분 이내에 계속되면 하나의 세션으로 묶입니다.

2. **EXTENDED Session**: 관련된 카테고리(예: Shopping → News 리뷰 읽기)로 이동하면 7분 타임아웃으로 세션이 확장됩니다.

3. **세션 종료**: 타임아웃이 지나거나 관련 없는 카테고리로 이동하면 세션이 종료됩니다.

예시:
```
10:00 - youtube.com/shorts/abc     ← Entertainment Session 시작
10:05 - youtube.com/shorts/def     ← 같은 세션 계속
10:10 - youtube.com/watch?v=xyz    ← 같은 세션 계속
10:18 - gmail.com                  ← 세션 종료 (18분 세션)
```

### 시간 제한 설정

1. **Settings 페이지**로 이동
2. **App Limits** 섹션에서 "+ Add Limit" 클릭
3. 카테고리 선택 및 일일 제한 시간 설정
4. 알림 시점 설정 (기본: 80% 도달 시)

### Privacy Mode

1. **Settings 페이지**로 이동
2. **Privacy Mode** 섹션에서 활성화
3. 옵션:
   - Auto-delete: 민감한 콘텐츠 자동 삭제
   - Exclude from Statistics: 통계에서 제외
   - Hide from Timeline: 타임라인에서 숨김

### Server Sync (NEW 🆕)

deTime은 서버와 동기화하여 카테고리 데이터베이스를 자동으로 업데이트합니다.

**주요 기능:**
- 🔄 **자동 업데이트**: 매일 1회 서버에서 최신 카테고리 DB 다운로드
- 📊 **익명 통계 공유**: 사용자 동의 시 익명 사용 패턴 전송 (카테고리 개선에 활용)
- 🆕 **신규 사이트 발견**: 사용자들이 방문한 새 도메인 자동 수집 및 분류
- 🔒 **완전 익명**: 도메인만 전송, URL은 전송하지 않음

**사용 방법:**
1. **Settings 페이지**로 이동
2. **Server Sync** 섹션에서 "Enable Server Sync" 활성화
3. (선택) "Share Anonymous Usage Data" 활성화로 카테고리 개선에 기여
4. "Sync Now" 버튼으로 즉시 동기화 가능

**서버 API:**
- 서버 URL: `https://api.detime.co/api`
- 엔드포인트:
  - `GET /categories` - 최신 카테고리 DB 다운로드
  - `GET /categories/version` - 버전 체크
  - `POST /usage-stats` - 익명 통계 업로드

**프라이버시:**
- 전송 데이터: 도메인, 감지된 카테고리, 익명 ID만
- 전송하지 않는 데이터: 전체 URL, 페이지 제목, 개인정보
- 완전 익명: 해시 처리된 랜덤 ID 사용
- 사용자 동의 필요: 기본적으로 비활성화

## 🎨 UI 스크린샷

### Popup (Quick View)
- 오늘의 총 사용 시간
- 카테고리별 사용 시간 (상위 5개)
- 가장 많이 사용한 사이트 (상위 4개)

### Dashboard
- **Today Tab**: 오늘의 상세 통계
- **Last 7 Days Tab**: 주간 추세 차트 및 하이라이트
- **Timeline Tab**: 시간대별 활동 타임라인

### Settings
- App Limits 관리
- Privacy Mode 설정
- Server Sync 설정 (NEW 🆕)
- 알림 설정
- 데이터 내보내기

## 🔧 기술 스택

- **Manifest V3**: 최신 Chrome Extension API
- **IndexedDB**: 로컬 데이터 저장
- **Vanilla JavaScript**: 외부 라이브러리 없이 순수 JS
- **ES6 Modules**: 모듈화된 코드 구조
- **CSS3**: iOS 스타일 디자인

## 📊 데이터 저장

모든 데이터는 **로컬 (IndexedDB)**에만 저장됩니다:

- ✅ 완전한 프라이버시 보호
- ✅ 서버 전송 없음
- ✅ 오프라인 작동
- ✅ 빠른 성능

### 데이터 구조

```javascript
// Sessions
{
  id: "session_1234567890",
  category: "social",
  startTime: 1701234567890,
  endTime: 1701238467890,
  duration: 3900000,  // 65분
  visits: [
    {url: "instagram.com/feed", timestamp: ..., title: "..."},
    {url: "twitter.com/home", timestamp: ..., title: "..."}
  ]
}

// Daily Stats
{
  date: "2024-12-27",
  categories: {
    social: {
      time: 7200000,      // 2시간
      sessionCount: 5,
      topSites: ["instagram.com", "twitter.com"]
    }
  },
  totalTime: 20520000,    // 5h 42m
  pickups: 23
}
```

## 🛣️ 로드맵

### Phase 1: MVP ✅
- [x] Session tracking
- [x] 자동 카테고리 분류
- [x] Today Dashboard
- [x] 기본 통계

### Phase 2: iOS Parity
- [ ] Weekly Report 차트 개선
- [ ] Timeline View 완성
- [ ] App Limits 차단 페이지
- [ ] Smart Alerts

### Phase 3: Advanced
- [ ] Custom Categories
- [ ] Focus Mode
- [ ] CSV Export
- [ ] Privacy Mode 고도화

### Phase 4: Premium (Optional)
- [ ] 서버 동기화
- [ ] Multi-device
- [ ] 고급 분석
- [ ] 월간 리포트

## 🤝 기여하기

기여는 언제나 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

## 💬 문의 및 지원

- **Issues**: [GitHub Issues](https://github.com/yourusername/web-activity-tracker/issues)
- **Email**: your.email@example.com

## 🙏 감사의 말

iOS Screen Time에서 영감을 받아 제작되었습니다.

---

**Made with ❤️ for better web browsing habits**
