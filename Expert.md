## Design Document: Chat Interface with Curated Feedback Loop

### Table of Contents
1. Overview
2. Goals and Requirements
3. System Architecture
4. Component Descriptions
   - 4.1 Frontend UI
   - 4.2 Prompt & Criteria Input
   - 4.3 Loop Orchestrator Service
   - 4.4 Creator LLM Module
   - 4.5 Rating LLM Module
   - 4.6 Editor LLM Module
   - 4.7 OpenRouter Integration
5. Data Models and Types
6. API Endpoints
7. Sequence Flow
8. Technology Stack
9. Security and Rate Limiting
10. Deployment and Scalability
11. Monitoring and Logging
12. Next Steps

---

### 1. Overview
This document describes a TypeScript-based application that implements a multi-agent feedback loop for generating high-quality chat responses. The loop consists of:

1. **Creator LLM**: Generates an initial response.
2. **Rating LLM**: Scores the response against user-provided quality criteria and rating goals.
3. **Editor LLM**: Provides actionable advice to improve the response.
4. The improved instructions are fed back to the **Creator LLM** for regeneration.

All LLM calls are routed through **OpenRouter** for uniform access.

---

### 2. Goals and Requirements
- **User Inputs**:
  - Prompt text
  - Quality criteria (e.g., clarity, accuracy, creativity)
  - Rating goals (numeric thresholds per criterion)
- **System Outputs**:
  - Curated response meeting or exceeding goals
  - Rating report and editor suggestions
- **Non-Functional**:
  - Modular, testable services
  - Type-safe interfaces (TypeScript)
  - Scalable orchestration for parallel loops

---

### 3. System Architecture
```plaintext
[ User UI ] --> [ API Gateway ] --> [ Loop Orchestrator ] 
     |                                      |
     v                                      v
[ OpenRouter ] <-> [ Creator | Rating | Editor LLM Modules ]
