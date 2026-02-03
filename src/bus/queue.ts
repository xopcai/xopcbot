import { EventEmitter } from 'events';
import { InboundMessage, OutboundMessage } from '../types/index.js';

interface MessageBusEvents {
  inbound: (msg: InboundMessage) => void;
  outbound: (msg: OutboundMessage) => void;
}

class MessageBus extends EventEmitter {
  private inboundQueue: InboundMessage[] = [];
  private outboundQueue: OutboundMessage[] = [];
  private processing = false;

  async publishInbound(msg: InboundMessage): Promise<void> {
    this.inboundQueue.push(msg);
    this.emit('inbound', msg);
    this.processQueues();
  }

  async publishOutbound(msg: OutboundMessage): Promise<void> {
    this.outboundQueue.push(msg);
    this.emit('outbound', msg);
    this.processQueues();
  }

  async consumeInbound(): Promise<InboundMessage> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.inboundQueue.length > 0) {
          resolve(this.inboundQueue.shift()!);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  async consumeOutbound(): Promise<OutboundMessage> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.outboundQueue.length > 0) {
          resolve(this.outboundQueue.shift()!);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private processQueues(): void {
    if (this.processing) return;
    this.processing = true;
    
    // Process outbound messages asynchronously
    while (this.outboundQueue.length > 0) {
      const msg = this.outboundQueue.shift();
      if (msg) {
        this.emit('outbound', msg);
      }
    }
    
    this.processing = false;
  }

  // For testing: drain all queues
  clear(): void {
    this.inboundQueue = [];
    this.outboundQueue = [];
  }
}

export const bus = new MessageBus();
export { MessageBus };
export type { MessageBusEvents };
