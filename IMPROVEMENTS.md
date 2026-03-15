# 자율 개선 에이전트 지침

## 우선순위 (순서대로)
1. 버그 수정 - 에러, 예외처리 누락, 타입 불일치
2. 성능 최적화 - 불필요한 연산, 중복 코드, 메모리 누수
3. 코드 품질 - 가독성, 모듈화, 네이밍
4. 기능 개선 - 더 나은 UX, 엣지케이스 처리

## 매 사이클마다 해야 할 것
- 변경사항은 반드시 git commit (메시지: 무엇을 왜 고쳤는지)
- IMPROVEMENTS.md에 이번 사이클 작업 내용 기록
- 다음 사이클에서 이어갈 작업을 파일 맨 아래 메모

## 하지 말아야 할 것
- 테스트 파일 삭제
- 기존 API 인터페이스 변경
- .env 파일 수정

---

## 사이클 1 (2026-03-15)

### 완료된 작업

#### 버그 수정
1. **노트 미리듣기 볼륨 버그** — `velocity` → `volume` 파라미터명 수정 (app.js:425)
2. **Undo가 루프 상태 미복원** — totalLoopSections, currentLoopSection을 스냅샷에 포함 (app.js:570-620)
3. **빈 프로젝트 임포트 시 noteIdCounter 크래시** — `Math.max(...[])` → `-Infinity` 방지 (app.js:1223)
4. **되감기 버튼 null 참조 크래시** — wrapper 요소 null 체크 추가 (app.js:1410)
5. **showTapFeedback null 참조 크래시** — wrapper 미존재 시 early return (app.js:1252)

#### 메모리 누수 수정
6. **ResizeObserver 정리 안 됨** — 인스턴스 저장 + destroy() 메서드 추가 (canvas-renderer.js:22-27)

#### 접근성 개선
7. **모바일 BPM 버튼 터치 타겟** — min-height 30px → 44px (WCAG 준수)

#### 기능 추가
8. **스윙(Groove) 기능** — 설정 패널에 0~80% 스윙 슬라이더, 엇박 타이밍 오프셋으로 그루브감 생성

### 다음 사이클에서 할 작업
- WAV 내보내기 시 리버브 누락 문제 (audio-engine.js exportWav)
- buildStepSequencer DOM 전체 재생성 → 부분 업데이트로 성능 최적화
- 8/16비트 확장 그리드 뷰 (현재 4비트만 보임)
- 재생 커서 자동 추적 (현재 바 밖의 비트 재생 시 바 전환)
- 프리셋의 Math.random() → 결정적 패턴으로 변경
