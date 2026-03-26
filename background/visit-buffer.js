import { SERVER_CONFIG } from '../common/server-config.js';

/**
 * Visit Buffer - 방문 기록을 모아서 배치로 서버에 전송
 *
 * 설정:
 * - BUFFER_SIZE: 50개 (50개씩 묶어서 전송)
 * - FLUSH_INTERVAL: 5분 (5분마다 자동 전송)
 */
class VisitBuffer {
  constructor() {
    this.buffer = [];
    this.BUFFER_SIZE = 50;  // 50개씩 모아서 전송
    this.FLUSH_INTERVAL = 5 * 60 * 1000;  // 5분 (밀리초)
    this.isFlushing = false;
    this.setupAutoFlush();

    console.log('[VisitBuffer] Initialized with buffer size:', this.BUFFER_SIZE);
  }

  /**
   * 버퍼에 방문 추가
   * @param {Object} visit - 방문 데이터
   */
  add(visit) {
    this.buffer.push(visit);

    console.log(`[VisitBuffer] Added visit, buffer: ${this.buffer.length}/${this.BUFFER_SIZE}`);

    // 버퍼가 가득 차면 즉시 전송
    if (this.buffer.length >= this.BUFFER_SIZE) {
      console.log('[VisitBuffer] Buffer full, flushing...');
      this.flush();
    }
  }

  /**
   * 버퍼의 모든 데이터를 서버로 전송
   */
  async flush() {
    // 버퍼가 비어있으면 스킵
    if (this.buffer.length === 0) {
      return;
    }

    // 이미 전송 중이면 스킵 (중복 방지)
    if (this.isFlushing) {
      console.log('[VisitBuffer] Already flushing, skipping');
      return;
    }

    this.isFlushing = true;

    // 전송할 데이터 복사 (버퍼는 즉시 비우기)
    const visitsToSend = [...this.buffer];
    this.buffer = [];

    console.log(`[VisitBuffer] Flushing ${visitsToSend.length} visits to server...`);

    try {
      const response = await fetch(`${SERVER_CONFIG.BASE_URL}${SERVER_CONFIG.ENDPOINTS.UPLOAD_VISIT_BATCH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visits: visitsToSend
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const result = await response.json();
      console.log('[VisitBuffer] ✅ Successfully sent:', result);

    } catch (error) {
      console.error('[VisitBuffer] ❌ Failed to send visits:', error);

      // 실패 시 버퍼에 다시 추가 (데이터 손실 방지)
      console.log('[VisitBuffer] Re-adding failed visits to buffer');
      this.buffer = [...visitsToSend, ...this.buffer];

      // 버퍼가 너무 커지면 오래된 데이터 제거 (메모리 보호)
      if (this.buffer.length > this.BUFFER_SIZE * 5) {
        console.warn('[VisitBuffer] Buffer too large, removing oldest visits');
        this.buffer = this.buffer.slice(-this.BUFFER_SIZE * 3);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 자동 플러시 설정 (5분마다)
   */
  setupAutoFlush() {
    // 5분마다 자동으로 버퍼 비우기
    setInterval(() => {
      if (this.buffer.length > 0) {
        console.log('[VisitBuffer] Auto-flush triggered');
        this.flush();
      }
    }, this.FLUSH_INTERVAL);

    // Chrome alarm으로도 설정 (백업)
    chrome.alarms.create('flushVisitBuffer', {
      periodInMinutes: 5
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'flushVisitBuffer') {
        console.log('[VisitBuffer] Alarm-triggered flush');
        this.flush();
      }
    });
  }

  /**
   * Extension 종료 시 남은 데이터 전송
   */
  async shutdown() {
    console.log('[VisitBuffer] Shutdown - flushing remaining visits');
    await this.flush();
  }

  /**
   * 현재 버퍼 상태 조회
   */
  getStatus() {
    return {
      bufferSize: this.buffer.length,
      maxSize: this.BUFFER_SIZE,
      isFlushing: this.isFlushing,
      fillPercentage: Math.round((this.buffer.length / this.BUFFER_SIZE) * 100)
    };
  }
}

// Singleton instance
export const visitBuffer = new VisitBuffer();

// Extension 종료 시 처리
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onSuspend.addListener(() => {
    console.log('[VisitBuffer] Extension suspending, flushing buffer');
    visitBuffer.shutdown();
  });
}
