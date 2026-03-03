/**
 * Progress Feedback Manager - Enhanced Features Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressFeedbackManager } from '../progress.js';

describe('ProgressFeedbackManager - Enhanced', () => {
  let manager: ProgressFeedbackManager;
  let progressMessages: any[];

  beforeEach(() => {
    progressMessages = [];
    manager = new ProgressFeedbackManager({
      level: 'normal',
      showErrorAccumulation: true,
      showRequestLimitWarning: true,
    });
    
    manager.setCallbacks({
      onProgress: (msg) => {
        progressMessages.push(msg);
      },
    });
  });

  describe('onToolErrorAccumulated', () => {
    it('should notify on first tool failure', () => {
      manager.onToolErrorAccumulated('shell', 1, 3, 2);
      
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0].type).toBe('warning');
      expect(progressMessages[0].message).toContain('Shell 失败 1 次');
      expect(progressMessages[0].detail).toContain('剩余重试次数：2');
    });

    it('should notify with warning at 50% failures', () => {
      manager.onToolErrorAccumulated('shell', 2, 3, 1);
      
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0].type).toBe('warning');
      expect(progressMessages[0].message).toContain('Shell 失败 2/3 次');
      expect(progressMessages[0].detail).toContain('剩余重试次数：1');
    });

    it('should notify with error at 100% failures', () => {
      manager.onToolErrorAccumulated('shell', 3, 3, 0);
      
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0].type).toBe('error');
      expect(progressMessages[0].message).toContain('已达到最大失败次数');
      expect(progressMessages[0].detail).toContain('停止执行该工具');
    });

    it('should not notify when showErrorAccumulation is false', () => {
      const noErrorManager = new ProgressFeedbackManager({
        level: 'normal',
        showErrorAccumulation: false,
      });
      
      noErrorManager.setCallbacks({
        onProgress: (msg) => progressMessages.push(msg),
      });
      
      noErrorManager.onToolErrorAccumulated('shell', 1, 3, 2);
      expect(progressMessages).toHaveLength(0);
    });

    it('should not notify in minimal level', () => {
      const minimalManager = new ProgressFeedbackManager({
        level: 'minimal',
        showErrorAccumulation: true,
      });
      
      minimalManager.setCallbacks({
        onProgress: (msg) => progressMessages.push(msg),
      });
      
      minimalManager.onToolErrorAccumulated('shell', 1, 3, 2);
      expect(progressMessages).toHaveLength(0);
    });

    it('should format tool name correctly', () => {
      manager.onToolErrorAccumulated('read_file', 1, 3, 2);
      
      expect(progressMessages[0].message).toContain('Read File');
    });
  });

  describe('onRequestLimitStatus', () => {
    it('should not notify when not warning and not stopping', () => {
      manager.onRequestLimitStatus(10, 50, 40, false, false);
      expect(progressMessages).toHaveLength(0);
    });

    it('should notify warning when approaching limit', () => {
      manager.onRequestLimitStatus(40, 50, 10, true, false);
      
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0].type).toBe('warning');
      expect(progressMessages[0].message).toContain('接近请求限制');
      expect(progressMessages[0].detail).toContain('剩余请求数：10');
    });

    it('should notify warning at 90%', () => {
      manager.onRequestLimitStatus(45, 50, 5, true, false);
      
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0].message).toContain('请求限制警告');
    });

    it('should notify error when limit reached', () => {
      manager.onRequestLimitStatus(50, 50, 0, true, true);
      
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0].type).toBe('error');
      expect(progressMessages[0].message).toContain('已达到请求限制');
      expect(progressMessages[0].detail).toContain('停止执行');
    });

    it('should not notify when showRequestLimitWarning is false', () => {
      const noWarningManager = new ProgressFeedbackManager({
        level: 'normal',
        showRequestLimitWarning: false,
      });
      
      noWarningManager.setCallbacks({
        onProgress: (msg) => progressMessages.push(msg),
      });
      
      noWarningManager.onRequestLimitStatus(45, 50, 5, true, false);
      expect(progressMessages).toHaveLength(0);
    });

    it('should not notify in minimal level', () => {
      const minimalManager = new ProgressFeedbackManager({
        level: 'minimal',
        showRequestLimitWarning: true,
      });
      
      minimalManager.setCallbacks({
        onProgress: (msg) => progressMessages.push(msg),
      });
      
      minimalManager.onRequestLimitStatus(45, 50, 5, true, false);
      expect(progressMessages).toHaveLength(0);
    });
  });

  describe('configuration', () => {
    it('should respect showErrorAccumulation config', () => {
      const enabledManager = new ProgressFeedbackManager({
        level: 'normal',
        showErrorAccumulation: true,
      });
      
      enabledManager.setCallbacks({
        onProgress: (msg) => progressMessages.push(msg),
      });
      
      enabledManager.onToolErrorAccumulated('shell', 1, 3, 2);
      expect(progressMessages).toHaveLength(1);
    });

    it('should respect showRequestLimitWarning config', () => {
      const enabledManager = new ProgressFeedbackManager({
        level: 'normal',
        showRequestLimitWarning: true,
      });
      
      enabledManager.setCallbacks({
        onProgress: (msg) => progressMessages.push(msg),
      });
      
      enabledManager.onRequestLimitStatus(45, 50, 5, true, false);
      expect(progressMessages).toHaveLength(1);
    });

    it('should use default config values', () => {
      const defaultManager = new ProgressFeedbackManager();
      
      // Should have enhanced features enabled by default
      defaultManager.setCallbacks({
        onProgress: (msg) => progressMessages.push(msg),
      });
      
      defaultManager.onToolErrorAccumulated('shell', 1, 3, 2);
      expect(progressMessages).toHaveLength(1);
      
      progressMessages = [];
      defaultManager.onRequestLimitStatus(45, 50, 5, true, false);
      expect(progressMessages).toHaveLength(1);
    });
  });

  describe('message formatting', () => {
    it('should format tool name from snake_case', () => {
      manager.onToolErrorAccumulated('read_file', 1, 3, 2);
      expect(progressMessages[0].message).toContain('Read File');
    });

    it('should format tool name with underscores', () => {
      manager.onToolErrorAccumulated('web_search', 1, 3, 2);
      expect(progressMessages[0].message).toContain('Web Search');
    });

    it('should include tool name in message', () => {
      manager.onToolErrorAccumulated('shell', 1, 3, 2);
      expect(progressMessages[0].toolName).toBe('shell');
    });

    it('should include stage in message', () => {
      manager.onToolErrorAccumulated('shell', 1, 3, 2);
      expect(progressMessages[0].stage).toBe('executing');
      
      progressMessages = [];
      manager.onRequestLimitStatus(45, 50, 5, true, false);
      expect(progressMessages[0].stage).toBe('thinking');
    });
  });

  describe('edge cases', () => {
    it('should handle zero maxFailures gracefully', () => {
      manager.onToolErrorAccumulated('shell', 0, 0, 0);
      expect(progressMessages).toHaveLength(1);
      // 0/0 = 0%, so it's a warning
      expect(progressMessages[0].type).toBe('warning');
    });

    it('should handle zero limit gracefully', () => {
      manager.onRequestLimitStatus(0, 0, 0, false, false);
      expect(progressMessages).toHaveLength(0); // Should not notify
    });

    it('should handle negative remaining attempts', () => {
      manager.onToolErrorAccumulated('shell', 5, 3, -2);
      expect(progressMessages[0].detail).toContain('停止执行该工具');
    });

    it('should handle undefined remaining attempts', () => {
      manager.onToolErrorAccumulated('shell', 1, 3);
      expect(progressMessages[0].detail).toContain('剩余重试次数：2');
    });
  });
});
