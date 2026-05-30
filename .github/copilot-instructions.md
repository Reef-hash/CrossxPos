# CrossxPos (Capacitor + Vite) Repository Instructions

This repository contains the CrossxPos frontend/mobile application.

## Scope
- Web/mobile UI code in `src/`
- Capacitor and Android integration in `android/` and `capacitor.config.ts`
- Frontend tooling via Vite, TypeScript, ESLint

## Development Guidelines
- Keep TypeScript strict and lint-friendly.
- Reuse existing components/styles before adding new patterns.
- Prefer incremental, testable UI changes.
- Do not edit generated output in `dist/` unless explicitly requested.

## Build & Run
- Install dependencies: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Copilot Working Rule
Before starting implementation, confirm task scope is for this repository and not `EZPos` desktop or `EZPos-Web`.
