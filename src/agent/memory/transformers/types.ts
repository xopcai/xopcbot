import type { AgentMessage } from '@mariozechner/pi-agent-core';

export interface SummaryTransformer {
  transform(messages: AgentMessage[]): AgentMessage[];
  pipe(next: SummaryTransformer): SummaryTransformer;
}

export class TransformerPipeline implements SummaryTransformer {
  constructor(private transformers: SummaryTransformer[] = []) {}

  transform(messages: AgentMessage[]): AgentMessage[] {
    return this.transformers.reduce(
      (acc, transformer) => transformer.transform(acc),
      messages
    );
  }

  pipe(next: SummaryTransformer): SummaryTransformer {
    return new TransformerPipeline([...this.transformers, next]);
  }
}

export abstract class BaseTransformer implements SummaryTransformer {
  abstract readonly name: string;
  abstract transform(messages: AgentMessage[]): AgentMessage[];

  pipe(next: SummaryTransformer): SummaryTransformer {
    return new TransformerPipeline([this, next]);
  }
}
