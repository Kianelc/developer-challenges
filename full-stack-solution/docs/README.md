# Documentation

Technical documentation for the Dynamox full-stack challenge solution.

**Audience:** engineers reviewing or maintaining this codebase. It assumes you can
read TypeScript but nothing about this particular project.

To *run* the application, start at the [root README](../README.md) — these documents
explain why the code looks the way it does, not how to boot it.

| # | Document | Read it when you want to know |
|---|----------|-------------------------------|
| 01 | [Context](./01-context.md) | What the product does and who it is for |
| 02 | [Problem Definition](./02-problem-definition.md) | What had to be solved, and the constraints |
| 03 | [Scope](./03-scope.md) | What is in, what is out, and why |
| 04 | [Architecture](./04-architecture.md) | How the pieces fit and how a request flows |
| 05 | [Domain Model](./05-domain-model.md) | The entities, their relationships and the schema |
| 06 | [API Contracts](./06-api-contracts.md) | Every endpoint, payload and status code |
| 07 | [Business Rules](./07-business-rules.md) | The rules, where they live and how they fail |
| 08 | [Security](./08-security.md) | Authentication, authorization and the trade-offs |
| 09 | [Testing Strategy](./09-testing-strategy.md) | What is tested, at which level and why |
| 10 | [Implementation Plan](./10-implementation-plan.md) | The delivery order, status and backlog |
| 11 | [Decisions](./11-decisions.md) | Each significant decision and the rejected alternative |
| 12 | [Assumptions](./12-assumptions.md) | Every ambiguity in the brief and how it was resolved |
| 13 | [Requirements Traceability](./13-requirements-traceability.md) | Where each challenge requirement is implemented |
| 14 | [Performance](./14-performance.md) | The latency requirement and how it is met |

## Conventions used here

- **Verified** means it was executed and observed. **Assumed** means it is a design
  decision taken in the absence of a requirement. The two are never mixed.
- Code references are `path:symbol`, relative to the repository root.
- Shared business rules are always cited from `libs/shared`, their single home.
