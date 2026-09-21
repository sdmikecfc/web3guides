# Release ownership

- Git pushes update the repository only; they do not publish this project live.
- The user alone releases production by running `vercel --prod` themselves.
- Do not run a production deployment, promote a Vercel deployment, change deployment automation, or use another route to publish production.
- Never describe a Git push as a live release. Report the pushed commit separately from production status.
- Do not suggest Vercel dashboard promotion as this project's release workflow. Production waits for the user's own `vercel --prod`.

# Local build storage

- Use `D:` for generated build workspaces, Next.js caches, preview output and temporary artifacts. The source checkout may remain on `C:`.
- `TEMP`/`TMP` pointing to `D:` is not enough: Next.js normally writes output beside the checkout. Use a build workspace on `D:` or a verified directory junction for local preview output.
- Never put a `node_modules` junction or symlink inside a Next.js output/cache directory. Next's cleanup follows directory links and can delete the target dependencies. For relocated preview output, set process-local `NODE_PATH` to the source dependency directory instead. Verify both a rendered page and the source dependencies after restarting.
- Isolated Next.js production builds need dependencies on the same drive, outside the disposable output directory. Avoid mixing symlink-preserving Node resolution with webpack's real-path loader resolution, which creates duplicate plugin instances.
- Do not create large build snapshots or caches on `C:`. Keep source files, player saves and unrelated projects intact.
