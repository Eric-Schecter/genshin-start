import { WGPUBuffer } from "@eric-schecter/graphics";
import { BoundingBox } from "../../bbox";

export type MeshComponent = {
    positions: Float32Array<ArrayBuffer>;
    normals: Float32Array<ArrayBuffer>;
    uvs: Float32Array<ArrayBuffer>;
    tangents: Float32Array<ArrayBuffer>;

    indices: Uint32Array<ArrayBuffer>;

    materialEntity: number[],

    vertexBuffers: WGPUBuffer[],
    indexBuffer?: WGPUBuffer,

    bbox: BoundingBox;

    dirty: boolean;
}

export const defaultMeshComponent: MeshComponent = {
    positions: new Float32Array(),
    normals: new Float32Array(),
    uvs: new Float32Array(),
    tangents: new Float32Array(),

    indices: new Uint32Array(),

    materialEntity: [],

    vertexBuffers: [],
    indexBuffer: undefined,

    bbox: new BoundingBox(),

    dirty: true,
}
