// Builds public/anims/moves.glb: the non-combat clips of the CC0 Universal Animation Library 1 + 2 (Quaternius),
// skeleton + animations only (no mesh, no textures), fingers / leaf bones / scale tracks dropped, keys resampled and
// meshopt-compressed. The raw packs live OUTSIDE the repo (see docs/ASSETS.md); point UAL_DIR at them if they move.
//   node scripts/build-anims.mjs
// The runtime (src/art/mocap.ts) retargets these clips onto the procedural Character skeleton.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';

const RAW = process.env.UAL_DIR ?? 'C:/Dev/vs_assets_raw';
const UAL1 = `${RAW}/ual1/x/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`;
const UAL2 = `${RAW}/ual2/x/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb`;
const OUT = 'public/anims/moves.glb';

// non-combat only: no Pistol / Sword / Punch / Spell / Melee / Shield / Zombie / Death / Hit / Knockback
const KEEP1 = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Roll', 'Swim_Fwd_Loop', 'Swim_Idle_Loop', 'Driving_Loop', 'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Dance_Loop', 'Interact', 'Push_Loop'];
const KEEP2 = ['ClimbUp_1m', 'Slide_Start', 'Slide_Loop', 'Slide_Exit', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'Yes', 'Idle_No_Loop', 'Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop'];
const BAN = /pistol|sword|punch|spell|melee|shield|zombie|death|hit_|knockback/i;

// bones the retarget reads (everything else, fingers and leaf bones in particular, is dropped)
const BONES = new Set(['root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r']);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
const doc = await io.read(UAL1);
const doc2 = await io.read(UAL2);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const nodeByName = new Map(root.listNodes().map((n) => [n.getName(), n]));

// 1) UAL2 clips are copied into the UAL1 document (the two rigs are identical: same 65 joints, same names)
for (const a2 of doc2.getRoot().listAnimations()) {
  if (!KEEP2.includes(a2.getName())) continue;
  const a = doc.createAnimation(a2.getName());
  for (const ch2 of a2.listChannels()) {
    const node = nodeByName.get(ch2.getTargetNode().getName());
    if (!node) continue;
    const s2 = ch2.getSampler();
    const mk = (acc2) => doc.createAccessor().setType(acc2.getType()).setArray(acc2.getArray().slice()).setBuffer(buffer);
    const s = doc.createAnimationSampler().setInput(mk(s2.getInput())).setOutput(mk(s2.getOutput())).setInterpolation(s2.getInterpolation());
    a.addSampler(s);
    a.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch2.getTargetPath()).setSampler(s));
  }
}

// 2) keep only the wanted clips, and only the tracks the retarget needs
const keep = new Set([...KEEP1, ...KEEP2]);
for (const a of root.listAnimations()) {
  if (!keep.has(a.getName()) || BAN.test(a.getName())) {
    a.listChannels().forEach((c) => c.dispose());
    a.listSamplers().forEach((s) => s.dispose());
    a.dispose();
    continue;
  }
  for (const c of a.listChannels()) {
    const n = c.getTargetNode().getName();
    const p = c.getTargetPath();
    const ok = BONES.has(n) && (p === 'rotation' || (p === 'translation' && n === 'pelvis'));
    if (!ok) c.dispose();
  }
  for (const s of a.listSamplers()) if (s.listParents().filter((x) => x.propertyType === 'AnimationChannel').length === 0) s.dispose();
}

// 3) skeleton + animations only: no mesh, skin, material or texture
for (const n of root.listNodes()) {
  if (n.getMesh()) n.setMesh(null);
  if (n.getSkin()) n.setSkin(null);
}
root.listMeshes().forEach((m) => m.dispose());
root.listSkins().forEach((s) => s.dispose());
root.listMaterials().forEach((m) => m.dispose());
root.listTextures().forEach((t) => t.dispose());

// 4) resample (lossless key de-duplication) + prune + meshopt
await doc.transform(resample({ tolerance: 0.0002 }), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));

mkdirSync('public/anims', { recursive: true });
await io.write(OUT, doc);
const names = root.listAnimations().map((a) => a.getName());
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB, ${names.length} clips`);
console.log(names.join(', '));
