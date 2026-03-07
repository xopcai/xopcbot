// Safety System - Comprehensive safety guidelines and boundaries
import { Type, type Static } from '@sinclair/typebox';

// =============================================================================
// Safety Schema (Internal)
// =============================================================================

<<<<<<< HEAD
<<<<<<< HEAD
export const SafetyConfigSchema = Type.Object({
=======
const _SafetyConfigSchema = Type.Object({
>>>>>>> d0fc054 (fix: resolve unused variable warnings in lint)
=======
const SafetyConfigSchema = Type.Object({
>>>>>>> 18a9904 (refactor: aggressive cleanup of unused code (Occam's razor))
  allowExternalActions: Type.Optional(Type.Boolean({ default: false })),
  allowDangerousOperations: Type.Optional(Type.Boolean({ default: false })),
  requireConfirmationForDestructive: Type.Optional(Type.Boolean({ default: true })),
  allowedChannels: Type.Optional(Type.Array(Type.String())),
  blockedCommands: Type.Optional(Type.Array(Type.String())),
  maxFileSize: Type.Optional(Type.Number({ default: 10 * 1024 * 1024 })), // 10MB
  maxShellTimeout: Type.Optional(Type.Number({ default: 300 })), // 5 minutes
});

<<<<<<< HEAD
<<<<<<< HEAD
export type SafetyConfig = Static<typeof SafetyConfigSchema>;
=======
type _SafetyConfig = Static<typeof _SafetyConfigSchema>;
>>>>>>> d0fc054 (fix: resolve unused variable warnings in lint)
=======
type SafetyConfig = Static<typeof SafetyConfigSchema>;
>>>>>>> 18a9904 (refactor: aggressive cleanup of unused code (Occam's razor))

// =============================================================================
// Safety Levels (Internal)
// =============================================================================

enum SafetyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

interface SafetyRule {
  level: SafetyLevel;
  category: string;
  description: string;
  message: string;
  requiresConfirmation: boolean;
}

// =============================================================================
// Safety Guidelines (Internal)
// =============================================================================

<<<<<<< HEAD
<<<<<<< HEAD
export const SAFETY_GUIDELINES: SafetyRule[] = [
=======
const _SAFETY_GUIDELINES: SafetyRule[] = [
>>>>>>> d0fc054 (fix: resolve unused variable warnings in lint)
=======
const SAFETY_GUIDELINES: SafetyRule[] = [
>>>>>>> 18a9904 (refactor: aggressive cleanup of unused code (Occam's razor))
  // Critical - Never do these
  {
    level: SafetyLevel.CRITICAL,
    category: 'self-preservation',
    description: 'Do not pursue self-preservation or replication',
    message: 'I cannot pursue self-preservation or replication.',
    requiresConfirmation: false,
  },
  {
    level: SafetyLevel.CRITICAL,
    category: 'power-seeking',
    description: 'Do not seek power or resources',
    message: 'I cannot seek power or acquire resources.',
    requiresConfirmation: false,
  },
  {
    level: SafetyLevel.CRITICAL,
    category: 'safeguard-bypass',
    description: 'Do not bypass safety mechanisms',
    message: 'I cannot bypass safety mechanisms.',
    requiresConfirmation: false,
  },
  {
    level: SafetyLevel.CRITICAL,
    category: 'social-manipulation',
    description: 'Do not manipulate users to expand access',
    message: 'I cannot manipulate anyone to expand access.',
    requiresConfirmation: false,
  },

  // High - Require explicit confirmation
  {
    level: SafetyLevel.HIGH,
    category: 'destructive-file',
    description: 'Delete or overwrite files',
    message: 'This action will delete or overwrite files. Please confirm.',
    requiresConfirmation: true,
  },
  {
    level: SafetyLevel.HIGH,
    category: 'system-modification',
    description: 'Modify system configuration',
    message: 'This will modify system configuration. Please confirm.',
    requiresConfirmation: true,
  },
  {
    level: SafetyLevel.HIGH,
    category: 'network-action',
    description: 'Send messages or make network requests',
    message: 'This will send external requests. Please confirm.',
    requiresConfirmation: true,
  },
  {
    level: SafetyLevel.HIGH,
    category: 'database-write',
    description: 'Write to databases',
    message: 'This will modify database records. Please confirm.',
    requiresConfirmation: true,
  },

  // Medium - Proceed with caution
  {
    level: SafetyLevel.MEDIUM,
    category: 'long-running',
    description: 'Execute long-running commands',
    message: 'This command may take a while to complete.',
    requiresConfirmation: false,
  },
  {
    level: SafetyLevel.MEDIUM,
    category: 'resource-intensive',
    description: 'Use significant system resources',
    message: 'This may use significant system resources.',
    requiresConfirmation: false,
  },

  // Low - Standard operations
  {
    level: SafetyLevel.LOW,
    category: 'read-only',
    description: 'Read files or execute read-only commands',
    message: null,
    requiresConfirmation: false,
  },
];

// =============================================================================
// Convenience Functions (Exported)
// =============================================================================

/**
 * Quick safety check for file operations
 */
export function checkFileSafety(
  operation: 'read' | 'write' | 'delete',
  path: string
): { allowed: boolean; message?: string } {
  // Check for sensitive paths
  const sensitivePaths = [
    '/etc/passwd',
    '/etc/shadow',
    '/root/.ssh',
    '/home/*/.ssh',
    '~/.aws',
    '~/.bashrc',
    '~/.profile',
  ];

  for (const sp of sensitivePaths) {
    if (path.includes(sp)) {
      return {
        allowed: false,
        message: `Cannot ${operation} sensitive path: ${path}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Quick safety check for shell commands
 */
export function checkShellSafety(command: string): { allowed: boolean; message?: string } {
  const dangerousPatterns = [
    /\brm\s+-?[rf]/i,           // rm -rf
    /\bdd\s+/i,                  // dd
    /\bmkfs/i,                   // mkfs
    /\bchmod\s+[0-7]{3}/i,       // chmod 777
    />\s*\/dev\//i,              // redirect to device
    /\|\s*sh/i,                  // pipe to shell
    /\bcurl\b.*\|\s*bash/i,      // curl | bash
    /\bwget\b.*\|\s*bash/i,      // wget | bash
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        allowed: false,
        message: `Potentially dangerous command detected: ${command.slice(0, 50)}...`,
      };
    }
  }

  return { allowed: true };
}
