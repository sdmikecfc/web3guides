import * as THREE from "three";
import type { CombatToy } from "./combat-toy";

/** Coordinates on the actual native mould, before its grip rotation. */
export function nativeWeaponContact(variant: number): THREE.Vector3 {
  const points = [[0,1.18,0],[0,1.21,0],[.44,.96,0],[0,1.345,0],[.33,.99,0],[0,1.26,0],[.4445,.96,0],[.445,.92,0]];
  return new THREE.Vector3().fromArray(points[variant] ?? points[0]);
}
export const hasStrikingFace = (variant: number) => [2,4,6,7].includes(variant);
export const weaponGripYaw = (variant: number) => hasStrikingFace(variant) ? -Math.PI / 2 : 0;

/** Position AND orientation IK for a hammer face or cutting edge. The old
 * point-only wrist solver could put the marker on target with the broad side
 * pointing at the opponent. Keep the working face forward and solve the arm
 * for the grip position that puts that face on the recorded impact. */
export function createWeaponContactSolver() {
  const forward=new THREE.Vector3(), shaft=new THREE.Vector3(), side=new THREE.Vector3();
  const localSide=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);
  const matrix=new THREE.Matrix4(), localMatrix=new THREE.Matrix4();
  const orientation=new THREE.Quaternion(), localOrientation=new THREE.Quaternion(), parent=new THREE.Quaternion();
  const wristWorld=new THREE.Quaternion(), weaponLocal=new THREE.Quaternion(), delta=new THREE.Quaternion(), current=new THREE.Quaternion();
  const offset=new THREE.Vector3(), goal=new THREE.Vector3(), joint=new THREE.Vector3(), end=new THREE.Vector3(), from=new THREE.Vector3(), toward=new THREE.Vector3();
  const shoulder=new THREE.Vector3(), elbow=new THREE.Vector3(), bend=new THREE.Vector3(), elbowGoal=new THREE.Vector3();
  const scale=new THREE.Vector3();
  return (toy: CombatToy, target: THREE.Vector3, amount: number): boolean => {
    if (!toy.weaponFace || amount<=0) return false;
    const weapon=toy.bones.weapon, wrist=toy.bones.wristR;
    toy.root.updateMatrixWorld(true);
    forward.copy(target).sub(toy.root.getWorldPosition(joint)); forward.y=0;
    if(forward.lengthSq()<1e-6)return false;
    forward.normalize();
    weapon.getWorldQuaternion(current);
    toy.bones.armR.getWorldPosition(shoulder);
    // Aim a low strike below the hand and a high strike above it. Otherwise
    // an upright hammer on a low target asks the wrist to reach past the knee.
    shaft.copy(target).sub(shoulder); shaft.addScaledVector(forward,-shaft.dot(forward));
    if(shaft.lengthSq()<.04){shaft.copy(up).applyQuaternion(current);shaft.addScaledVector(forward,-shaft.dot(forward));}
    if(shaft.lengthSq()<.01)shaft.copy(up);
    shaft.normalize(); side.crossVectors(forward,shaft).normalize(); shaft.crossVectors(side,forward);
    localSide.crossVectors(toy.weaponFace,up).normalize();
    matrix.makeBasis(forward,shaft,side); localMatrix.makeBasis(toy.weaponFace,up,localSide);
    orientation.setFromRotationMatrix(matrix).multiply(localOrientation.setFromRotationMatrix(localMatrix).invert());
    current.slerp(orientation,amount);
    // Hold the handle rigidly in the palm. Only the wrist/arm articulate.
    weaponLocal.copy(weapon.quaternion);
    wristWorld.copy(current).multiply(localOrientation.copy(weaponLocal).invert());
    wrist.getWorldScale(scale);
    offset.copy(toy.weaponContact).multiply(weapon.scale).applyQuaternion(weaponLocal).add(weapon.position).multiply(scale).applyQuaternion(wristWorld);
    goal.copy(target).sub(offset);
    toy.bones.elbowR.getWorldPosition(elbow); wrist.getWorldPosition(end);
    const upperLength=shoulder.distanceTo(elbow), lowerLength=elbow.distanceTo(end);
    // The generic reach estimate includes the whole shaft, which overstates
    // reach when the head must meet the target face-on. Step into this actual
    // grip's range instead of leaving the hammer floating short of the hit.
    const maxReach=upperLength+lowerLength-.0001, dy=goal.y-shoulder.y;
    toward.copy(goal).sub(shoulder);toward.y=0;
    const horizontal=toward.length(), allowed=Math.sqrt(Math.max(.0001,maxReach*maxReach-dy*dy));
    if(horizontal>allowed){
      toy.root.position.addScaledVector(toward,(horizontal-allowed)/horizontal*amount);
      toy.root.updateMatrixWorld(true);toy.bones.armR.getWorldPosition(shoulder);toy.bones.elbowR.getWorldPosition(elbow);
    }
    toward.copy(goal).sub(shoulder);const distance=Math.max(.0001,toward.length());toward.divideScalar(distance);
    const reach=Math.max(Math.abs(upperLength-lowerLength)+.0001,Math.min(upperLength+lowerLength-.0001,distance));
    const along=(upperLength*upperLength+reach*reach-lowerLength*lowerLength)/(2*reach);
    bend.copy(elbow).sub(shoulder);bend.addScaledVector(toward,-bend.dot(toward));
    if(bend.lengthSq()<1e-8){bend.crossVectors(toward,up);if(bend.lengthSq()<1e-8)bend.set(1,0,0);}
    elbowGoal.copy(shoulder).addScaledVector(toward,along).addScaledVector(bend.normalize(),Math.sqrt(Math.max(0,upperLength*upperLength-along*along)));
    for(const [bone,child,targetJoint] of [[toy.bones.armR,toy.bones.elbowR,elbowGoal],[toy.bones.elbowR,wrist,goal]] as const){
      toy.root.updateMatrixWorld(true); child.getWorldPosition(end);bone.getWorldPosition(joint);
      from.copy(end).sub(joint);toward.copy(targetJoint).sub(joint);
      if(from.lengthSq()<1e-8||toward.lengthSq()<1e-8)continue;
      delta.setFromUnitVectors(from.normalize(),toward.normalize());bone.getWorldQuaternion(orientation);bone.parent!.getWorldQuaternion(parent);
      orientation.premultiply(delta).premultiply(parent.invert());bone.quaternion.slerp(orientation,amount);
    }
    toy.root.updateMatrixWorld(true); wrist.parent!.getWorldQuaternion(parent);
    wrist.quaternion.copy(parent.invert().multiply(wristWorld));
    toy.root.updateMatrixWorld(true);
    return true;
  };
}
