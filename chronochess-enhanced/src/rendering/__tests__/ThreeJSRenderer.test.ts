import { describe, it, expect, vi } from 'vitest';
import { QualityLevel } from '../types';

// Create a simple test that doesn't require complex mocking
describe('ThreeJSRenderer Types', () => {
  it('should have correct quality level values', () => {
    expect(QualityLevel.LOW).toBe('low');
    expect(QualityLevel.MEDIUM).toBe('medium');
    expect(QualityLevel.HIGH).toBe('high');
    expect(QualityLevel.ULTRA).toBe('ultra');
  });
});
