import { WGPUBuffer } from "@eric-schecter/graphics";
import { mat4 } from "gl-matrix";

export enum EN_CAMERA_TYPE {
    PERSPECTIVE,
    ORTHOGRAPHICS,
}

export type CameraComponent = {
    fov: number;
    aspect: number;
    near: number;
    far: number;
    orthoHeight: number;

    viewMatrix: mat4;
    projMatrix: mat4;
    inverse_view_projection: mat4;

    viewMatrixBuffer?: WGPUBuffer;
    projMatrixBuffer?: WGPUBuffer;
    cameraPosBuffer?: WGPUBuffer;

    isPrimary: boolean;

    type: EN_CAMERA_TYPE;

    dirty: boolean;
}

export const createDefaultCameraComponent = (): CameraComponent => {
    return {
        fov: 45,
        aspect: 1,
        near: 0.1,
        far: 10000,
        orthoHeight: 4096, //todo

        viewMatrix: mat4.create(),
        projMatrix: mat4.create(),
        inverse_view_projection: mat4.create(),

        isPrimary: false,

        type: EN_CAMERA_TYPE.PERSPECTIVE,

        dirty: true
    }
}
