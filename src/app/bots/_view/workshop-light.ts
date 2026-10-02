import type { Container } from "pixi.js";
import type { Pixi } from "@/app/s7/games/_shared/pixi";

const vertex = `
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;
const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
void main() {
  vec4 c = texture(uTexture, vTextureCoord);
  float nearAlpha = texture(uTexture, vTextureCoord + vec2(2.0,-3.0)*uInputSize.zw).a;
  float farAlpha = texture(uTexture, vTextureCoord + vec2(4.0,-5.0)*uInputSize.zw).a;
  float solid = smoothstep(0.45,0.98,c.a);
  float rim = (max(0.0,c.a-nearAlpha)*0.72 + max(0.0,c.a-farAlpha)*0.18) * solid;
  vec3 colour = c.rgb * vec3(1.09,1.05,0.99);
  colour += rim * vec3(0.66,0.43,0.17);
  finalColor = vec4(min(colour,vec3(c.a)), c.a);
}`;

/** Light the assembled silhouette after mirroring. Never bake light into a limb. */
export function installToyLight(PIXI: Pixi, robot: Container) {
  const filter = new PIXI.Filter({ glProgram: PIXI.GlProgram.from({ vertex, fragment, name: "workshop-toy-rim" }), padding: 6, resolution: 1, antialias: true });
  robot.filters = [filter];
  return filter;
}

/** Empty scenic plate; the real stands, parts and hit targets stay on top. */
export async function installWorkshop(PIXI: Pixi, room: Container, w: number, h: number, floorY: number) {
  const texture = await PIXI.Assets.load("/bots-art/plates/workshop-interior.png");
  const sprite = new PIXI.Sprite(texture);
  const scale = Math.max(w / texture.width, floorY / (.67 * texture.height), (h - floorY) / (.33 * texture.height));
  sprite.scale.set(scale);
  sprite.position.set((w - sprite.width) / 2, floorY - .67 * sprite.height);
  sprite.eventMode = "none";
  room.addChildAt(sprite,0);
  return sprite;
}
