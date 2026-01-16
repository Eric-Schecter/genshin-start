import { mat4, quat, vec3 } from "gl-matrix";

export type TransformComponent = {
    translation: vec3,
    rotation: quat,
    scale: vec3,

    localMatrix: mat4;
    worldMatrix: mat4;
    normalMatrix: mat4;

    dirty: boolean;
}

export const defaultTransformComponent: TransformComponent = {
    translation: vec3.create(),
    rotation: quat.create(),
    scale: vec3.fromValues(1, 1, 1),

    localMatrix: mat4.create(),
    worldMatrix: mat4.create(),
    normalMatrix: mat4.create(),

    dirty: false,
}
