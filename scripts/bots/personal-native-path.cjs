// Windows junctions in this workspace require Node's native realpath implementation.
const fs = require('node:fs');
if (process.platform === 'win32') {
  const native = fs.realpathSync.native;
  fs.realpathSync = native;
  fs.realpathSync.native = native;
}
