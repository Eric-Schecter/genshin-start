import { WGPUBuffer, WGPUTexture } from "@eric-schecter/graphics";
import { vec4 } from "gl-matrix";

export type TextureData = {
    texture?: WGPUTexture,
    data: Uint8Array;
    width: number,
    height: number,
    name: string,
}

export type MaterialComponent = {
    diffuseTexture: TextureData,
    normalTexture: TextureData,
    occlusionTexture: TextureData,
    emissiveTexture: TextureData,
    metallicRoughnessTexture: TextureData,

    baseColorFactor: vec4,
    metallicFactor: number,
    roughnessFactor: number,

    shaderMaterialBuffer?: WGPUBuffer,

    type: string,

    name: string,

    dirty: boolean,
}

export const createDefaultTextureData = (): TextureData => {
    return {
        data: new Uint8Array(),
        width: 1,
        height: 1,
        name: ''
    }
}

export const createDefaultMaterialComponent = (): MaterialComponent => {
    return {
        diffuseTexture: createDefaultTextureData(),
        normalTexture: createDefaultTextureData(),
        occlusionTexture: createDefaultTextureData(),
        emissiveTexture: createDefaultTextureData(),
        metallicRoughnessTexture: createDefaultTextureData(),

        baseColorFactor: vec4.create(),
        metallicFactor: 0,
        roughnessFactor: 1,

        type: 'default',

        name: '',

        dirty: true
    }
}
