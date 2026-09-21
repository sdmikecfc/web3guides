# Release ownership

- Git pushes update the repository only; they do not publish this project live.
- The user alone releases production by running `vercel --prod` themselves.
- Do not run a production deployment, promote a Vercel deployment, change deployment automation, or use another route to publish production.
- Never describe a Git push as a live release. Report the pushed commit separately from production status.
- Do not suggest Vercel dashboard promotion as this project's release workflow. Production waits for the user's own `vercel --prod`.
