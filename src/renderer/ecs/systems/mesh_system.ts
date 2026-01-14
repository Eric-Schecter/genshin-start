import { EN_BIND_FLAG, EN_RESOURCE_MISC_FLAG, EN_USAGE, GPUBufferDesc, GraphicsDevice, WGPUBuffer } from '@eric-schecter/graphics';
import { query } from 'bitecs';
import { scene } from '../scene';

export class MeshSystem {
    public update(graphicsDevice: GraphicsDevice): number {
        let res = 0;

        const { meshes } = scene.components;

        for (const entity of query(scene, [meshes])) {
            const meshComponent = meshes[entity];
            if (!meshComponent.dirty) {
                continue;
            }

            if(entity === 30){
                console.log('hit')
            }

            meshComponent.vertexBuffers.push(this._createVertexBuffer(graphicsDevice, meshComponent.positions));
            meshComponent.vertexBuffers.push(this._createVertexBuffer(graphicsDevice, meshComponent.normals));
            meshComponent.vertexBuffers.push(this._createVertexBuffer(graphicsDevice, meshComponent.uvs));
            meshComponent.vertexBuffers.push(this._createVertexBuffer(graphicsDevice, meshComponent.tangents));

            meshComponent.indexBuffer = this._createIndexBuffer(graphicsDevice, meshComponent.indices);

            meshComponent.dirty = false;

            res = 1;
        }

        return res;
    }

    private _createVertexBuffer(graphicsDevice: GraphicsDevice, vertexData: Float32Array<ArrayBuffer>): WGPUBuffer {
        const desc: GPUBufferDesc = {
            size: vertexData.byteLength,
            name: 'mesh vertex buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.VERTEX_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: vertexData.byteLength / Float32Array.BYTES_PER_ELEMENT,
        }

        return graphicsDevice.createBuffer(desc, vertexData);
    }

    private _createIndexBuffer(graphicsDevice: GraphicsDevice, indexData: Uint32Array<ArrayBuffer>): WGPUBuffer {
        const desc: GPUBufferDesc = {
            size: indexData.byteLength,
            name: 'mesh vertex buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.INDEX_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: indexData.byteLength / Uint32Array.BYTES_PER_ELEMENT,
        }

        return graphicsDevice.createBuffer(desc, indexData);
    }
}
