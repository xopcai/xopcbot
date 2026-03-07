export { SummaryTransformer, TransformerPipeline, BaseTransformer } from './types.js';
export { DropSystemMessages } from './drop-system.js';
export { DedupeConsecutiveUser } from './dedupe-user.js';
export { DedupeConsecutiveAssistant } from './dedupe-assistant.js';
export { TrimByFilePath } from './trim-by-filepath.js';
export { StripWorkingDir } from './strip-workspace.js';

import { TransformerPipeline } from './types.js';
import { DropSystemMessages } from './drop-system.js';
import { DedupeConsecutiveUser } from './dedupe-user.js';
import { DedupeConsecutiveAssistant } from './dedupe-assistant.js';
import { TrimByFilePath } from './trim-by-filepath.js';
import { StripWorkingDir } from './strip-workspace.js';

export function createStandardCompactionPipeline(workspaceDir: string): TransformerPipeline {
  return new TransformerPipeline([
    new DropSystemMessages(),
    new DedupeConsecutiveUser(),
    new TrimByFilePath(),
    new DedupeConsecutiveAssistant(),
    new StripWorkingDir(workspaceDir),
  ]);
}
