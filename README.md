# RBI Client

이 프로젝트는 Remote Browser Isolation (RBI) Server와 상호 작용하기 위한 클라이언트 도구를 제공합니다. RBI Server는 원격 브라우저 격리 솔루션으로, 서버에서 브라우저를 실행하고 렌더링된 콘텐츠만 사용자의 장치로 스트리밍합니다.

## 구성 요소

1. **웹 클라이언트 (rbi-client.html)**: WebRTC를 사용하여 RBI Server에 연결하고 브라우저 화면을 표시하는 웹 페이지입니다.
2. **자동화 스크립트 (rbi-automation.js)**: RBI Server API를 자동화하는 Node.js 스크립트입니다.

## 설치 방법

```bash
# 저장소 클론 또는 파일 다운로드 후
npm install
```

## 간편 실행 방법

### 런처 스크립트 사용하기

이 프로젝트는 RBI Server와 클라이언트를 쉽게 실행할 수 있는 런처 스크립트를 제공합니다.

#### Windows 사용자:
```bash
start-rbi.bat
```

#### Linux/macOS 사용자:
```bash
./start-rbi.sh
```

런처 스크립트는 다음 옵션을 제공합니다:
1. RBI Server 시작
2. 웹 클라이언트 시작
3. 자동화 스크립트 시작
4. RBI Server와 웹 클라이언트 함께 시작
5. 종료

### 수동 실행 방법

#### 웹 클라이언트 사용하기

웹 클라이언트는 브라우저에서 실행되는 HTML 페이지로, WebRTC를 통해 RBI Server에 연결하고 브라우저 화면을 표시합니다.

1. HTTP 서버 시작:
   ```bash
   npm run web
   ```
   또는 다른 HTTP 서버를 사용하여 `rbi-client.html` 파일을 제공할 수 있습니다.

2. 브라우저에서 웹 클라이언트 열기 (자동으로 열리지 않는 경우):
   ```
   http://localhost:8080/rbi-client.html
   ```

3. 웹 클라이언트 인터페이스 사용:
   - **Server URL**: RBI Server의 URL (기본값: http://localhost:3000)
   - **Start URL**: 초기 URL (기본값: https://example.com)
   - **Navigate URL**: 이동할 URL (기본값: https://google.com)
   - **Width/Height**: 뷰포트 크기
   - **Frame Rate**: 프레임 레이트
   - **Quality**: 스트림 품질 (low, medium, high, ultra)
   - **Start Session**: 세션 시작
   - **Navigate**: 지정된 URL로 이동
   - **Stop Session**: 세션 종료

### 자동화 스크립트 사용하기

자동화 스크립트는 RBI Server API를 자동화하는 Node.js 스크립트입니다.

```bash
# 기본 옵션으로 실행
npm start

# 또는 직접 실행
node rbi-automation.js [옵션]
```

#### 사용 가능한 옵션:

```
--server-url <url>     RBI Server URL (기본값: http://localhost:3000)
--start-url <url>      초기 URL (기본값: https://example.com)
--width <width>        뷰포트 너비 (기본값: 1280)
--height <height>      뷰포트 높이 (기본값: 720)
--quality <quality>    스트림 품질 (low, medium, high, ultra) (기본값: high)
--frame-rate <rate>    프레임 레이트 (기본값: 30)
--navigate <url>       세션 생성 후 이동할 URL
--auto-stop <seconds>  지정된 시간(초) 후 자동으로 세션 종료
--help                 도움말 표시
```

#### 예제:

```bash
# Google로 시작
node rbi-automation.js --start-url https://google.com

# 고품질 설정
node rbi-automation.js --width 1920 --height 1080 --quality ultra

# GitHub로 이동 후 60초 후 자동 종료
node rbi-automation.js --navigate https://github.com --auto-stop 60
```

#### 대화형 모드 명령어:

스크립트가 실행되면 대화형 모드로 진입합니다. 다음 명령어를 사용할 수 있습니다:

```
navigate <url>  - URL로 이동
stats           - 스트림 통계 조회
stop            - 세션 종료 및 종료
help            - 도움말 표시
```

## RBI Server 사용 방법

RBI Server는 다음 위치에서 실행할 수 있습니다:
```bash
cd rbi-cuda-solution/server/
npm start
```

RBI Server가 실행되면 웹 클라이언트나 자동화 스크립트를 사용하여 연결할 수 있습니다.

## 질문에 대한 답변

### 1. Usage의 내용대로 따라하면 RBI Server가 보내준 이미지를 제가 볼 수 있나요?

네, 웹 클라이언트(rbi-client.html)를 사용하면 RBI Server가 보내주는 브라우저 화면을 실시간으로 볼 수 있습니다. 웹 클라이언트는 WebRTC를 사용하여 서버에서 실행되는 브라우저의 화면을 스트리밍 받아 표시합니다.

### 2. Usage의 내용을 자동화 할 수 있나요?

네, 자동화 스크립트(rbi-automation.js)를 사용하여 RBI Server API 호출을 자동화할 수 있습니다. 이 스크립트는 세션 생성, 스트림 시작, URL 탐색 등의 작업을 자동화합니다. 또한 대화형 모드를 제공하여 명령줄에서 RBI Server와 상호 작용할 수 있습니다.

## 주의사항

1. RBI Server가 실행 중이어야 합니다.
2. WebRTC 연결을 위해 최신 브라우저를 사용하세요.
3. 로컬 개발 환경에서는 HTTPS가 필요하지 않지만, 프로덕션 환경에서는 WebRTC를 위해 HTTPS가 필요할 수 있습니다.
