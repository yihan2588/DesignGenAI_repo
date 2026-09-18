# Yihan Wu — Hello, World

A minimal personal page for Week 1, built with Next.js and TypeScript. Includes a résumé PDF and an expandable contact panel with LinkedIn and two copyable, plain-text email addresses. No email hyperlinks, backend, or contact form.

## Run locally

Use Node.js 20.9 or later and pnpm 11.19.0.

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000.

```sh
pnpm lint
pnpm build
pnpm start
```

## Content

- `app/page.tsx`: introduction and résumé link.
- `app/contact.tsx`: LinkedIn and email copy controls.
- `app/globals.css`: responsive styling.
- `public/resume.pdf`: original résumé, served unchanged.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import `DesignGenAI_repo` as a Vercel project. Keep the detected Next.js settings and repository root directory.
3. Wait for the deployment to report Ready.
4. In project Settings → Deployment Protection, turn off Vercel Authentication and save.
5. Open the deployment details and copy that deployment's unique URL, not the moving production or branch alias. Confirm the displayed source commit matches the GitHub commit you intend to submit.
6. Check that exact URL and its résumé link in an Incognito window, then submit the URL in the course Submissions section.

Reference: https://vercel.com/docs/deployments/generated-urls and https://vercel.com/docs/deployment-protection
