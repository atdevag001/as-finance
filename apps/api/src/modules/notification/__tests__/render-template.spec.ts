import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../render-template';

describe('renderTemplate', () => {
  it('should substitute all placeholders with variable values', () => {
    const template = 'Dear {{customerName}}, loan {{loanNumber}} approved.';
    const variables = { customerName: 'Rajesh', loanNumber: 'LN-2024-00001' };

    const result = renderTemplate(template, variables);

    expect(result).toBe('Dear Rajesh, loan LN-2024-00001 approved.');
  });

  it('should replace missing variables with empty string', () => {
    const template = 'Dear {{customerName}}, amount: Rs.{{amount}}';
    const variables = { customerName: 'Rajesh' };

    const result = renderTemplate(template, variables);

    expect(result).toBe('Dear Rajesh, amount: Rs.');
  });

  it('should return template unchanged when no placeholders exist', () => {
    const template = 'No placeholders here.';
    const result = renderTemplate(template, { foo: 'bar' });

    expect(result).toBe('No placeholders here.');
  });

  it('should handle empty variables map', () => {
    const template = 'Dear {{customerName}}';
    const result = renderTemplate(template, {});

    expect(result).toBe('Dear ');
  });

  it('should handle empty template', () => {
    const result = renderTemplate('', { customerName: 'Rajesh' });
    expect(result).toBe('');
  });

  it('should handle multiple occurrences of the same variable', () => {
    const template = '{{name}} paid. Thank you {{name}}.';
    const result = renderTemplate(template, { name: 'Rajesh' });

    expect(result).toBe('Rajesh paid. Thank you Rajesh.');
  });

  it('should handle complex template with all SMS template variables', () => {
    const template =
      'Dear {{customerName}}, payment of Rs.{{amount}} received for loan {{loanNumber}}. Receipt: {{receiptNumber}}. Outstanding: Rs.{{outstanding}}. Thank you - AS Finance.';
    const variables = {
      customerName: 'Rajesh Kumar',
      amount: '5,000',
      loanNumber: 'LN-2024-00015',
      receiptNumber: 'RCP-2024-00042',
      outstanding: '45,000',
    };

    const result = renderTemplate(template, variables);

    expect(result).toBe(
      'Dear Rajesh Kumar, payment of Rs.5,000 received for loan LN-2024-00015. Receipt: RCP-2024-00042. Outstanding: Rs.45,000. Thank you - AS Finance.',
    );
  });
});
