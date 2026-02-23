---
name: Refactor
about: Propose a code or architecture refactor
title: "[Refactor] "
labels: refactor
assignees: ""
---

## Summary

A clear and concise description of what needs to be refactored and why.

## Motivation

What technical debt, maintainability concern, or performance issue drives this refactor?

## Scope

List the files, modules, or components affected:

- `src/`

## Proposed Approach

Describe the intended changes at a high level.

## Risks / Considerations

- Are there schema changes that could affect `StockSignals` or `StockDocs`?
- Are there changes to LLM prompts or Bedrock invocation?
- Any impact on the daily batch pipeline or Step Functions orchestration?

## Acceptance Criteria

- [ ] All existing `npm run ci` checks pass
- [ ] No unintended behavior changes
- [ ] 

## Additional Context

Any other context or references.
