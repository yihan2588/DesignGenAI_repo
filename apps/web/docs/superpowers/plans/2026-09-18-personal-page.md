# Personal page implementation plan

Goal: build the user-approved minimal Next.js homework app in this repository.

Approved design: white background, dark typography, spacious responsive layout; “Hello, I’m Yihan Wu”; AI/ML and software engineering subtitle; résumé PDF opens in a new tab; Contact me reveals LinkedIn and two selectable email addresses with copy controls. Emails must not be links. The user approved this design and added yihan2588@gmail.com alongside yw4756@columbia.edu. IntelliJ is not required by the user.

Architecture: Next.js App Router, static home page with a small client-side contact disclosure. No backend, form submission, external fonts, or analytics. Original PDF is served unchanged from public/resume.pdf.

Files: app/page.tsx (introduction), app/contact.tsx (disclosure/copy interaction), app/globals.css (responsive styles), app/layout.tsx (metadata), app/icon.svg (monogram), public/resume.pdf, package.json and generated tooling, README.md.

- [x] Scaffold using create-next-app and preserve existing Git metadata.
- [x] Implement approved page and keyboard-accessible contact disclosure. Clipboard failure must leave selectable email text and a useful message.
- [x] Verify lint, production build, résumé response, both email copy controls, keyboard interaction, and narrow/mobile layout.
- [ ] Commit verified app. Connect GitHub when its actual URL is available; deploy through Vercel if authenticated access is available. Record actual deployment and commit; do not claim hosted completion without verification.

Validation uses the real production build and browser interactions; no unit tests that merely mirror this small presentation layer.

Verification (2026-09-18): pnpm lint and pnpm build passed. Browser verified both copied addresses, Enter-key disclosure, no mailto links, and 375px document width at 375px viewport. Served PDF matches original SHA-256 c83b25e19d697924d4c31aa37331c4d8e7394fc6f5919beb3f1032d9a0141adb. Vercel import reached GitHub authorization; approval pending.
