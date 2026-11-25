export function seededOrderKey(id: string, seed: string): number {
  let hash = 2_166_136_261;
  for (const character of `${seed}\0${id}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85_eb_ca_6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2_b2_ae_35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
