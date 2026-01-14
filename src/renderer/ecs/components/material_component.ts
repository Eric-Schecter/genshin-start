import { WGPUTexture } from "@eric-schecter/graphics";
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

    dirty: boolean;
}

export const defaultTextureData: TextureData = {
    data: new Uint8Array(),
    width: 1,
    height: 1,
    name: '',
}

export const defaultMaterialComponent: MaterialComponent = {
    diffuseTexture: defaultTextureData,
    normalTexture: defaultTextureData,
    occlusionTexture: defaultTextureData,
    emissiveTexture: defaultTextureData,
    metallicRoughnessTexture: defaultTextureData,

    baseColorFactor: vec4.create(),
    metallicFactor: 0,
    roughnessFactor: 1,

    dirty: true,
}
