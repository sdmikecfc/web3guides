# Release ownership

- Git pushes update the repository only; they do not publish this project live.
- The user alone releases production by running `vercel --prod` themselves.
- Do not run a production deployment, promote a Vercel deployment, change deployment automation, or use another route to publish production.
- Never describe a Git push as a live release. Report the pushed commit separately from production status.
- Do not suggest Vercel dashboard promotion as this project's release workflow. Production waits for the user's own `vercel --prod`.

# Local build storage

- Use `D:` for generated build workspaces, Next.js caches, preview output and temporary artifacts. The source checkout may remain on `C:`.
- `TEMP`/`TMP` pointing to `D:` is not enough: Next.js normally writes output beside the checkout. Use a build workspace on `D:` or a verified directory junction for local preview output.
- Preserve dependency lookup when using cross-drive junctions. The relocated preview output needs access to the project's `node_modules`; isolated Next.js production builds need dependencies on the same drive. Avoid mixing symlink-preserving Node resolution with webpack's real-path loader resolution, which creates duplicate plugin instances. Verify a rendered page after moving output.
- Do not create large build snapshots or caches on `C:`. Keep source files, player saves and unrelated projects intact.
