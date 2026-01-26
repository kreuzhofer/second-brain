# Property-Based Testing Guidelines

## When to Use Property Tests

✅ **Use property tests for:**
- Parsers/serializers (round-trip invariants)
- Mathematical properties (commutativity, idempotency)
- Data transformations with many edge cases
- Input validation with complex rules

❌ **Don't use property tests for:**
- Authorization checks (binary: allowed/denied)
- CRUD operations (deterministic code paths)
- API response format validation
- Tests where random data wouldn't realistically enter the system

## numRuns Guidelines

| Test Type | numRuns | Rationale |
|-----------|---------|-----------|
| Pure functions (no I/O) | 10-20 | Fast, benefits from variety |
| DB operations | 3-5 | Slow, same logic regardless of input |
| Authorization/role checks | 3 | Binary outcome, deterministic |
| API endpoint tests | 3-5 | Network overhead, same code path |
| Parsing/validation | 5-10 | Benefits from edge cases |

## Default: `numRuns: 3`

Unless there's a specific reason for more iterations, use `{ numRuns: 3 }`.

## Prefer Example-Based Tests

Convert property tests to example-based when:
- Testing 2-3 specific scenarios covers all branches
- Random data adds no value (e.g., role = 'admin' | 'user')
- The "property" is just "it works" not a mathematical invariant

```typescript
// ❌ Unnecessary property test
fc.assert(fc.asyncProperty(
  fc.constantFrom('admin', 'account_owner'),
  async (role) => { /* same test for both */ }
), { numRuns: 100 });

// ✅ Simple example-based test
it.each(['admin', 'account_owner'])('works for %s role', async (role) => {
  /* same test */
});
```

## Random Data Rules

- Use `testEmailArbitrary()` for emails, not `fc.emailAddress()`
- Use `fc.constantFrom()` for enums, not random strings
- Use `fc.uuid()` only when testing UUID handling specifically
- Avoid random special characters unless testing input sanitization
