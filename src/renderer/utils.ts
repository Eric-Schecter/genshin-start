import { EN_BIND_FLAG, EN_RESOURCE_MISC_FLAG, EN_USAGE, GPUBufferDesc, GraphicsDevice } from "@eric-schecter/graphics";
import { vec3, mat4 } from "gl-matrix";

export function setupUniformBuffer(graphicsDevice: GraphicsDevice, data: number[], name = '') {
    const color = new Float32Array(data);
    const desc: GPUBufferDesc = {
        size: color.byteLength,
        name,
        usage: EN_USAGE.DEFAULT,
        bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
        miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
        stride: 0,
        count: color.byteLength / Float32Array.BYTES_PER_ELEMENT,
    }
    return graphicsDevice.createBuffer(desc, color);
}

export function getUp(mat: mat4) {
    return vec3.fromValues(mat[4], mat[5], mat[6]);
}

export function getFocus(mat: mat4) {
    return vec3.fromValues(mat[8], mat[9], mat[10]);
}

export function getPos(mat: mat4) {
    return vec3.fromValues(mat[12], mat[13], mat[14]);
}
