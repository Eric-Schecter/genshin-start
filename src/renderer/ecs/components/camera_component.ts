import { WGPUBuffer } from "@eric-schecter/graphics";
import { mat4 } from "gl-matrix";

export type CameraComponent = {
    fov: number;
    aspect: number;
    near: number;
    far: number;

    viewMatrix: mat4;
    projMatrix: mat4;
    inverse_view_projection: mat4;

    viewMatrixBuffer?: WGPUBuffer;
    projMatrixBuffer?: WGPUBuffer;
    cameraPosBuffer?: WGPUBuffer;

    isPrimary: boolean;

    dirty: boolean;
}

export const defaultCameraComponent: CameraComponent = {
    fov: 45,
    aspect: 1,
    near: 0.1,
    far: 10000,

    viewMatrix: mat4.create(),
    projMatrix: mat4.create(),
    inverse_view_projection: mat4.create(),

    isPrimary: false,

    dirty: true,
}
