import { describe, it, expect } from 'vitest';
import {
  detectModelCapabilities,
  detectEnvironmentContext,
  renderToolDescription,
  DynamicToolDescriptionRenderer,
  TOOL_TEMPLATES,
} from '../tools/dynamic-description.js';

describe('Dynamic Tool Description', () => {
  describe('detectModelCapabilities', () => {
    it('should detect Claude 3 Opus capabilities', () => {
      const caps = detectModelCapabilities('claude-3-opus-20240229', 'anthropic');
      
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsTools).toBe(true);
      expect(caps.supportsReasoning).toBe(true);
      expect(caps.contextLength).toBe(200000);
      expect(caps.provider).toBe('anthropic');
    });

    it('should detect GPT-4 Turbo capabilities', () => {
      const caps = detectModelCapabilities('gpt-4-turbo', 'openai');
      
      expect(caps.supportsTools).toBe(true);
      expect(caps.supportsReasoning).toBe(true);
      expect(caps.contextLength).toBe(128000);
    });

    it('should detect GPT-4 Vision capabilities', () => {
      const caps = detectModelCapabilities('gpt-4-vision-preview', 'openai');
      
      expect(caps.supportsVision).toBe(true);
    });

    it('should handle unknown models with defaults', () => {
      const caps = detectModelCapabilities('unknown-model');
      
      expect(caps.supportsVision).toBe(false);
      expect(caps.supportsTools).toBe(false);
      expect(caps.supportsReasoning).toBe(false);
      expect(caps.contextLength).toBe(4096);
    });

    it('should handle empty/undefined model', () => {
      const caps = detectModelCapabilities(undefined, undefined);
      
      expect(caps.modelName).toBe('unknown');
      expect(caps.provider).toBe('unknown');
    });
  });

  describe('detectEnvironmentContext', () => {
    it('should detect environment context', () => {
      const ctx = detectEnvironmentContext('/workspace');
      
      expect(ctx.workspace).toBe('/workspace');
      expect(ctx.os).toBeDefined();
      expect(ctx.shell).toBeDefined();
      expect(ctx.nodeVersion).toBeDefined();
      expect(ctx.availableTools).toEqual([]);
    });
  });

  describe('renderToolDescription', () => {
    it('should render read_file description with vision support', () => {
      const caps = detectModelCapabilities('claude-3-opus', 'anthropic');
      const env = detectEnvironmentContext('/workspace');
      
      const desc = renderToolDescription('read_file', caps, env);
      
      expect(desc).toContain('Reads the content of a file');
      expect(desc).toContain('Image Support');
    });

    it('should render read_file description without vision support', () => {
      const caps = detectModelCapabilities('gpt-3.5-turbo', 'openai');
      const env = detectEnvironmentContext('/workspace');
      
      const desc = renderToolDescription('read_file', caps, env);
      
      expect(desc).toContain('Reads the content of a file');
      expect(desc).toContain('does NOT support vision');
    });

    it('should include model context in description', () => {
      const caps = detectModelCapabilities('claude-3-opus', 'anthropic');
      const env = detectEnvironmentContext('/workspace');
      
      const desc = renderToolDescription('shell', caps, env);
      
      expect(desc).toContain('Model Context');
      expect(desc).toContain('claude-3-opus');
      expect(desc).toContain('anthropic');
    });

    it('should return empty string for unknown tool', () => {
      const caps = detectModelCapabilities('claude-3-opus', 'anthropic');
      const env = detectEnvironmentContext('/workspace');
      
      const desc = renderToolDescription('unknown_tool', caps, env);
      
      expect(desc).toBe('');
    });

    it('should substitute environment variables in shell tool', () => {
      const caps = detectModelCapabilities('claude-3-opus', 'anthropic');
      const env = detectEnvironmentContext('/my-workspace');
      
      const desc = renderToolDescription('shell', caps, env);
      
      expect(desc).toContain('/my-workspace');
    });
  });

  describe('DynamicToolDescriptionRenderer', () => {
    it('should render single tool description', () => {
      const renderer = new DynamicToolDescriptionRenderer(
        'claude-3-opus',
        'anthropic',
        '/workspace'
      );
      
      const desc = renderer.render('read_file');
      
      expect(desc).toContain('Reads the content of a file');
      expect(desc).toContain('Model Context');
    });

    it('should render all tool descriptions', () => {
      const renderer = new DynamicToolDescriptionRenderer(
        'claude-3-opus',
        'anthropic',
        '/workspace'
      );
      
      const descriptions = renderer.renderAll(['read_file', 'write_file', 'shell']);
      
      expect(descriptions.size).toBe(3);
      expect(descriptions.has('read_file')).toBe(true);
      expect(descriptions.has('write_file')).toBe(true);
      expect(descriptions.has('shell')).toBe(true);
    });

    it('should update model', () => {
      const renderer = new DynamicToolDescriptionRenderer(
        'gpt-3.5-turbo',
        'openai',
        '/workspace'
      );
      
      expect(renderer.getCapabilities().supportsVision).toBe(false);
      
      renderer.updateModel('claude-3-opus', 'anthropic');
      
      expect(renderer.getCapabilities().supportsVision).toBe(true);
    });

    it('should update workspace', () => {
      const renderer = new DynamicToolDescriptionRenderer(
        'claude-3-opus',
        'anthropic',
        '/old-workspace'
      );
      
      expect(renderer.getEnvironment().workspace).toBe('/old-workspace');
      
      renderer.updateWorkspace('/new-workspace');
      
      expect(renderer.getEnvironment().workspace).toBe('/new-workspace');
    });
  });

  describe('TOOL_TEMPLATES', () => {
    it('should have templates for core tools', () => {
      expect(TOOL_TEMPLATES.read_file).toBeDefined();
      expect(TOOL_TEMPLATES.write_file).toBeDefined();
      expect(TOOL_TEMPLATES.edit_file).toBeDefined();
      expect(TOOL_TEMPLATES.shell).toBeDefined();
      expect(TOOL_TEMPLATES.grep).toBeDefined();
    });

    it('should have examples for each tool', () => {
      Object.values(TOOL_TEMPLATES).forEach(template => {
        expect(template.examples.length).toBeGreaterThan(0);
        expect(template.examples[0].description).toBeDefined();
        expect(template.examples[0].code).toBeDefined();
      });
    });

    it('should have limitations for each tool', () => {
      Object.values(TOOL_TEMPLATES).forEach(template => {
        expect(template.limitations.length).toBeGreaterThan(0);
      });
    });
  });
});
