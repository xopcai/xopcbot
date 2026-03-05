/**
 * Log Alerts
 * 
 * Real-time alerting based on log patterns and thresholds:
 * - Error rate threshold
 * - Specific error patterns
 * - Performance degradation
 * - Security events
 */

import type { LogLevel } from './types.js';
import { onDiagnosticEvent } from '../diagnostic-events.js';
import type { DiagnosticEventPayload } from '../diagnostic-events.js';

// ============================================
// Types
// ============================================

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  actions: AlertAction[];
  cooldownMs?: number;
  description?: string;
}

export type AlertCondition =
  | { type: 'error_rate'; threshold: number; windowMinutes: number }
  | { type: 'level_count'; level: LogLevel; threshold: number; windowMinutes: number }
  | { type: 'pattern_match'; pattern: RegExp; level?: LogLevel }
  | { type: 'consecutive_errors'; threshold: number }
  | { type: 'latency_p95'; thresholdMs: number }
  | { type: 'custom'; fn: (event: DiagnosticEventPayload) => boolean };

export type AlertAction =
  | { type: 'log'; level: LogLevel }
  | { type: 'webhook'; url: string; headers?: Record<string, string> }
  | { type: 'email'; to: string[] }
  | { type: 'slack'; webhook: string; channel?: string }
  | { type: 'callback'; fn: (alert: Alert) => void | Promise<void> };

export interface Alert {
  id: string;
  ruleId: string;
  name: string;
  triggeredAt: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, unknown>;
}

export interface AlertState {
  lastTriggered: number;
  triggerCount: number;
  consecutiveErrors: number;
  errorCount: number;
  windowStart: number;
}

// ============================================
// State Management
// ============================================

const rules: Map<string, AlertRule> = new Map();
const states: Map<string, AlertState> = new Map();

let unsubscribeDiagnostic: (() => void) | null = null;

// ============================================
// Rule Management
// ============================================

export function addAlertRule(rule: AlertRule): void {
  rules.set(rule.id, rule);
  if (!states.has(rule.id)) {
    states.set(rule.id, {
      lastTriggered: 0,
      triggerCount: 0,
      consecutiveErrors: 0,
      errorCount: 0,
      windowStart: Date.now(),
    });
  }
}

export function removeAlertRule(ruleId: string): void {
  rules.delete(ruleId);
  states.delete(ruleId);
}

export function updateAlertRule(ruleId: string, updates: Partial<AlertRule>): void {
  const rule = rules.get(ruleId);
  if (rule) {
    rules.set(ruleId, { ...rule, ...updates });
  }
}

export function getAlertRules(): AlertRule[] {
  return Array.from(rules.values());
}

export function clearAlertRules(): void {
  rules.clear();
  states.clear();
}

// ============================================
// Alert Evaluation
// ============================================

function evaluateCondition(
  condition: AlertCondition,
  event: DiagnosticEventPayload,
  state: AlertState
): boolean {
  const now = Date.now();
  
  switch (condition.type) {
    case 'error_rate': {
      // Reset window if needed
      const windowMs = condition.windowMinutes * 60 * 1000;
      if (now - state.windowStart > windowMs) {
        state.errorCount = 0;
        state.windowStart = now;
      }
      
      // Count errors
      if (event.type === 'webhook.error' || event.type === 'message.processed') {
        const isError = 'outcome' in event && event.outcome === 'error';
        if (isError) {
          state.errorCount++;
        }
      }
      
      return state.errorCount >= condition.threshold;
    }
    
    case 'level_count': {
      // This would be called from log processing, not diagnostic events
      return false;
    }
    
    case 'pattern_match': {
      const message = JSON.stringify(event);
      const levelMatch = !condition.level || event.type.includes(condition.level);
      return levelMatch && condition.pattern.test(message);
    }
    
    case 'consecutive_errors': {
      if (event.type === 'webhook.error' || 
          (event.type === 'message.processed' && 'outcome' in event && event.outcome === 'error')) {
        state.consecutiveErrors++;
      } else {
        state.consecutiveErrors = 0;
      }
      return state.consecutiveErrors >= condition.threshold;
    }
    
    case 'latency_p95': {
      if ('durationMs' in event && typeof event.durationMs === 'number') {
        return event.durationMs > condition.thresholdMs;
      }
      return false;
    }
    
    case 'custom': {
      try {
        return condition.fn(event);
      } catch {
        return false;
      }
    }
    
    default:
      return false;
  }
}

function determineSeverity(condition: AlertCondition): Alert['severity'] {
  switch (condition.type) {
    case 'error_rate':
      return condition.threshold > 100 ? 'critical' : condition.threshold > 10 ? 'high' : 'medium';
    case 'consecutive_errors':
      return condition.threshold > 10 ? 'critical' : condition.threshold > 5 ? 'high' : 'medium';
    case 'latency_p95':
      return condition.thresholdMs > 10000 ? 'critical' : condition.thresholdMs > 5000 ? 'high' : 'medium';
    default:
      return 'medium';
  }
}

// ============================================
// Alert Actions
// ============================================

async function executeActions(alert: Alert, actions: AlertAction[]): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'log':
          console[action.level](`[ALERT] ${alert.name}: ${alert.message}`);
          break;
          
        case 'webhook':
          await fetch(action.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...action.headers,
            },
            body: JSON.stringify(alert),
          });
          break;
          
        case 'slack':
          await fetch(action.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: action.channel,
              text: `🚨 *${alert.name}*\n${alert.message}`,
              attachments: [
                {
                  color: alert.severity === 'critical' ? 'danger' : alert.severity === 'high' ? 'warning' : 'good',
                  fields: Object.entries(alert.details || {}).map(([title, value]) => ({
                    title,
                    value: String(value),
                    short: true,
                  })),
                },
              ],
            }),
          });
          break;
          
        case 'email':
          // Email sending would require integration with email service
          console.log(`[Alert] Would send email to: ${action.to.join(', ')}`);
          break;
          
        case 'callback':
          await action.fn(alert);
          break;
      }
    } catch (err) {
      console.error(`[Alert] Failed to execute action ${action.type}:`, err);
    }
  }
}

async function triggerAlert(rule: AlertRule, event: DiagnosticEventPayload): Promise<void> {
  const state = states.get(rule.id);
  if (!state) return;
  
  const now = Date.now();
  
  // Check cooldown
  if (rule.cooldownMs && now - state.lastTriggered < rule.cooldownMs) {
    return;
  }
  
  const alert: Alert = {
    id: `alert_${now}_${Math.random().toString(36).substring(2, 8)}`,
    ruleId: rule.id,
    name: rule.name,
    triggeredAt: new Date().toISOString(),
    severity: determineSeverity(rule.condition),
    message: `Alert triggered: ${rule.description || rule.name}`,
    details: {
      eventType: 'type' in event ? event.type : 'unknown',
      ...('durationMs' in event ? { durationMs: event.durationMs } : {}),
    },
  };
  
  state.lastTriggered = now;
  state.triggerCount++;
  
  await executeActions(alert, rule.actions);
}

// ============================================
// Event Processing
// ============================================

function processDiagnosticEvent(event: DiagnosticEventPayload): void {
  for (const rule of rules.values()) {
    if (!rule.enabled) continue;
    
    const state = states.get(rule.id);
    if (!state) continue;
    
    if (evaluateCondition(rule.condition, event, state)) {
      triggerAlert(rule, event);
    }
  }
}

// ============================================
// Initialization
// ============================================

export function startAlertEngine(): void {
  if (unsubscribeDiagnostic) return;
  
  unsubscribeDiagnostic = onDiagnosticEvent(processDiagnosticEvent);
}

export function stopAlertEngine(): void {
  if (unsubscribeDiagnostic) {
    unsubscribeDiagnostic();
    unsubscribeDiagnostic = null;
  }
}

export function isAlertEngineRunning(): boolean {
  return unsubscribeDiagnostic !== null;
}

// ============================================
// Preset Rules
// ============================================

export const presetRules = {
  highErrorRate: (threshold: number = 10, windowMinutes: number = 5): AlertRule => ({
    id: 'high_error_rate',
    name: 'High Error Rate',
    enabled: true,
    description: `Triggers when error count exceeds ${threshold} in ${windowMinutes} minutes`,
    condition: {
      type: 'error_rate',
      threshold,
      windowMinutes,
    },
    actions: [{ type: 'log', level: 'error' }],
    cooldownMs: 60000, // 1 minute
  }),
  
  consecutiveErrors: (threshold: number = 5): AlertRule => ({
    id: 'consecutive_errors',
    name: 'Consecutive Errors',
    enabled: true,
    description: `Triggers after ${threshold} consecutive errors`,
    condition: {
      type: 'consecutive_errors',
      threshold,
    },
    actions: [{ type: 'log', level: 'warn' }],
    cooldownMs: 30000,
  }),
  
  highLatency: (thresholdMs: number = 5000): AlertRule => ({
    id: 'high_latency',
    name: 'High Latency',
    enabled: true,
    description: `Triggers when P95 latency exceeds ${thresholdMs}ms`,
    condition: {
      type: 'latency_p95',
      thresholdMs,
    },
    actions: [{ type: 'log', level: 'warn' }],
    cooldownMs: 300000, // 5 minutes
  }),
};
