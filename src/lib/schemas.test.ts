import { describe, it, expect } from 'vitest';
import { TransactionSchema } from './schemas';

describe('TransactionSchema', () => {
    it('should validate a correct transaction', () => {
        const validData = {
            type: 'expense',
            amount: 100.50,
            description: 'Supermarket',
            category: 'food',
            date: '2023-01-01'
        };
        const result = TransactionSchema.safeParse(validData);
        expect(result.success).toBe(true);
    });

    it('should reject negative amount', () => {
        const invalidData = {
            type: 'expense',
            amount: -10,
            description: 'Error',
            category: 'food',
            date: '2023-01-01'
        };
        const result = TransactionSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });

    it('should reject invalid type', () => {
        const invalidData = {
            type: 'invalid',
            amount: 10,
            description: 'Error',
            category: 'food',
            date: '2023-01-01'
        };
        const result = TransactionSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });
});
