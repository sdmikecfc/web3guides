import assert from "node:assert/strict";
import { SHELL_SIZES } from "../src/app/chef/game/_engine/rooms";
import { wallArtMount, pickWallMount, hitsWallArt } from "../src/app/chef/game/_view/wall-mount";

let mounts = 0;
for (const room of SHELL_SIZES) for (const side of ["left", "right"] as const) {
  const count = side === "left" ? room.h : room.w;
  for (let index = 0; index < count; index++) {
    const gx = side === "left" ? 0 : index, gy = side === "left" ? index : 0;
    const facing = side === "left" ? "se" : "sw";
    const mount = wallArtMount(room, gx, gy, facing);
    assert.equal(mount.side, side);
    // The section midpoint on neighborhood.drawWalls, 58 logical pixels up.
    const u = (index + .5) * 32;
    assert.equal(mount.x, side === "left" ? -u : u);
    assert.equal(mount.y, u / 2 - 58);
    assert.deepEqual(pickWallMount(room, mount.x, mount.y), { x: gx, y: gy, facing });
    assert.ok(hitsWallArt(mount, mount.x, mount.y));
    assert.ok(!hitsWallArt(mount, mount.x + 25, mount.y));
    assert.ok(!hitsWallArt(mount, mount.x + 12, mount.y - 28), "transparent canvas margin is not the frame");
    if (index > 0) for (const rotation of ["se", "sw", "nw", "ne"]) {
      assert.deepEqual(wallArtMount(room, gx, gy, rotation), mount, "saved furniture rotation cannot detach a painting from its wall");
    }
    mounts++;
  }
  assert.equal(pickWallMount(room, 20, 50), null, "floor space is not a wall target");
  assert.equal(pickWallMount(room, 20, -100), null, "space above the wall is not a wall target");
  assert.equal(pickWallMount(room, room.w * 32 + 2, 20), null);
}
console.log(`wall attachment/picking checks PASS (${mounts} wall sections across all room sizes)`);
