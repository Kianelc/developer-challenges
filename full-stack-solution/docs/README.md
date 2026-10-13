# Documentation

**Audience:** engineers reviewing or maintaining this codebase.

To *run* the application, start at the [root README](../README.md). These documents
explain why the code looks the way it does.

| # | Document | Read it when you want to know |
|---|----------|-------------------------------|
| 01 | [Requirements](./01-requirements.md) | What the system does, its constraints, non-goals and vocabulary |
| 04 | [Architecture](./04-architecture.md) | How the pieces fit and how a request flows |
| 05 | [Domain Model](./05-domain-model.md) | Entities, relationships, schema, invariants |
| 06 | [API Contracts](./06-api-contracts.md) | Every endpoint, payload and status code |
| 07 | [Business Rules](./07-business-rules.md) | The rules, where they live and how they fail |
| 08 | [Security](./08-security.md) | Authentication, authorization and the trade-offs |
| 09 | [Testing Strategy](./09-testing-strategy.md) | What is tested, at which level, and the gaps |
| 10 | [Implementation Plan](./10-implementation-plan.md) | Status and backlog |
| 11 | [Decisions](./11-decisions.md) | Each decision, its rejected alternative, the reasoning |
| 12 | [Assumptions](./12-assumptions.md) | Every ambiguity in the brief and how it was resolved |
| 13 | [Requirements Traceability](./13-requirements-traceability.md) | Where each challenge requirement is implemented and tested |
| 14 | [Performance](./14-performance.md) | The latency requirement, measured |

Numbering is historical: 02 and 03 were folded into 01.

## Conventions

- **One home per subject.** Each fact is stated once, where it belongs, and
  referenced from everywhere else. The table above is that map: rules in 07,
  decisions in 11, assumptions in 12, contracts in 06, commands in the root README.
- **Verified** means executed and observed. **Assumed** means a design decision taken
  without a requirement. The two are never mixed.
- Code references are `path:symbol`, relative to the repository root.
- Shared business rules are cited from `libs/shared`, their single home in the code.
