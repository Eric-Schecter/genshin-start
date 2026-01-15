import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE,
    EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION, EN_PRIMITIVE_TOPOLOGY,
    EN_RESOURCE_MISC_FLAG,
    EN_STENCIL_OP, EN_USAGE, GraphicsDevice, GraphicsPipeline, InputLayout,
    RasterizerState, RenderCommandBuffer, WGPUBuffer, WGPUTexture
} from "@eric-schecter/graphics";
import { query } from "bitecs";
import { Renderer } from "./renderer";
import { scene, invalid_id, getPrimaryCamera } from "../ecs";

export class MeshRenderer extends Renderer {
    private _pipeline: GraphicsPipeline;

    private _instanceStorageBuffer: WGPUBuffer;

    private _paramsBuffer: WGPUBuffer[] = [];

    private _renderBatch = new Map<number, number[]>(); // mesh entity -> object entities

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._setupPipeline();

        const maxCount = 10000;
        this._instanceStorageBuffer = graphicsDevice.createBuffer({
            size: maxCount * 4 * 4 * 4,
            name: 'instance storage buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: maxCount,
        });

        // todo: change to dynamic size
        for (let i = 0; i < maxCount; i++) {
            this._paramsBuffer[i] = graphicsDevice.createBuffer({
                size: 4 * 4,
                name: 'params buffer',
                usage: EN_USAGE.DEFAULT,
                bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
                miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
                stride: 0,
                count: 1,
            });
        }

    }

    public update() {
        // todo: add dirty mark
        const { objects, transforms } = scene.components;

        this._renderBatch.clear();

        for (const entity of query(scene, [objects, transforms])) {
            const objectComponent = objects[entity];
            const meshEntities = objectComponent?.meshEntities;

            for (let i = 0; i < meshEntities.length; i++) {
                const meshEntity = meshEntities[i];
                if (!this._renderBatch.has(meshEntity)) {
                    this._renderBatch.set(meshEntity, [entity]);
                } else {
                    this._renderBatch.get(meshEntity)?.push(entity);
                }
            }
        }

        let count = 0;
        const stride = 64;
        for (const [_, objectEntities] of this._renderBatch) {
            count += objectEntities.length;
        }
        const data = new Float32Array(count * stride);

        let offset = 0;
        for (const [_, objectEntities] of this._renderBatch) {
            for (let i = 0; i < objectEntities.length; i++) {
                const entity = objectEntities[i];

                const { worldMatrix } = transforms[entity];
                data.set(worldMatrix, offset * 16);

                offset++;
            }
        }

        this._instanceStorageBuffer.update(data);
    }

    public render(cmd: RenderCommandBuffer, envTexture: WGPUTexture) {
        if (!this._pipeline) {
            return;
        }

        this._graphicsDevice.bindPipeline(cmd, this._pipeline);

        const { meshes, materials, cameras } = scene.components;

        const primaryCameraEntity = getPrimaryCamera();
        if (primaryCameraEntity === invalid_id) {
            console.warn('no primary camera component found');
            return;
        }
        const { viewMatrixBuffer, projMatrixBuffer, cameraPosBuffer } = cameras[primaryCameraEntity];
        if (!viewMatrixBuffer || !projMatrixBuffer || !cameraPosBuffer) {
            return;
        }

        let drawcall = 0;
        let offset = 0;
        for (const [meshEntity, objectEntities] of this._renderBatch) {

            const meshComponent = meshes[meshEntity];
            const materialEntity = meshComponent?.materialEntity;
            if (materialEntity.length > 1) {
                // console.warn('not implememnt multi material for now');
            }
            const materialComponent = materials[materialEntity[0]]; // todo

            const { diffuseTexture, normalTexture, metallicRoughnessTexture, emissiveTexture, occlusionTexture } = materialComponent;
            const { vertexBuffers, indexBuffer } = meshComponent;

            this._paramsBuffer[drawcall].update(new Uint32Array([offset, 0, 0, 0]));

            this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
            this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32);
            this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
            this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
            this._graphicsDevice.bindResource(cmd, this._paramsBuffer[drawcall], 2);
            this._graphicsDevice.bindSampler(cmd, this._sampler, 3);
            this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._blackTexture, 4);
            this._graphicsDevice.bindResource(cmd, emissiveTexture.texture || this._blackTexture, 5);
            this._graphicsDevice.bindResource(cmd, normalTexture.texture || this._blackTexture, 6);
            this._graphicsDevice.bindResource(cmd, metallicRoughnessTexture.texture || this._blackTexture, 7);
            this._graphicsDevice.bindResource(cmd, occlusionTexture.texture || this._blackTexture, 8);
            this._graphicsDevice.bindResource(cmd, envTexture || this._whiteTextureCube, 9);
            this._graphicsDevice.bindResource(cmd, cameraPosBuffer, 10);
            this._graphicsDevice.bindResource(cmd, this._instanceStorageBuffer, 11);
            this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, objectEntities.length);

            drawcall++;

            offset += objectEntities.length;
        }

        console.log(drawcall);
    }

    private async _setupPipeline() {
        const [vs, ps] = await Promise.all([this._graphicsDevice.createShader('shaders/mesh_vs.wgsl'), this._graphicsDevice.createShader('shaders/mesh_ps.wgsl')]);

        const il: InputLayout = {
            elements: [
                {
                    semanticIndex: 0,
                    format: EN_FORMAT.R32G32B32_FLOAT,
                    alignedByteOffset: 0,
                    inputSlotClass: EN_INPUT_CLASSIFICATION.PER_VERTEX_DATA
                },
                {
                    semanticIndex: 1,
                    format: EN_FORMAT.R32G32B32_FLOAT,
                    alignedByteOffset: 0,
                    inputSlotClass: EN_INPUT_CLASSIFICATION.PER_VERTEX_DATA
                },
                {
                    semanticIndex: 2,
                    format: EN_FORMAT.R32G32_FLOAT,
                    alignedByteOffset: 0,
                    inputSlotClass: EN_INPUT_CLASSIFICATION.PER_VERTEX_DATA
                },
                {
                    semanticIndex: 3,
                    format: EN_FORMAT.R32G32B32A32_FLOAT,
                    alignedByteOffset: 0,
                    inputSlotClass: EN_INPUT_CLASSIFICATION.PER_VERTEX_DATA
                },
                // {
                //     "COLOR",
                //     0,
                //     Rendering:: Format:: R8G8B8A8_UNORM,
                //         0,
                //         Rendering:: InputLayout:: APPEND_ALIGNED_ELEMENT,
                //             Rendering:: InputClassification:: PER_VERTEX_DATA
                // },
            ]
        };

        const dss: DepthStencilState = {
            depthEnable: true,
            stencilEnable: false,
            depthBoundsTestEnable: false,
            depthWriteMask: EN_DEPTH_WRITE_MASK.ALL,
            depthFunc: EN_COMPARISION_FUNC.LESS,
            stencilReadMask: 0,
            stencilWriteMask: 0xff,
            frontFace: {
                stencilFunc: EN_COMPARISION_FUNC.ALWAYS,
                stencilPassOp: EN_STENCIL_OP.REPLACE,
                stencilFailOp: EN_STENCIL_OP.KEEP,
                stencilDepthFailOp: EN_STENCIL_OP.KEEP,
            },
            backFace: {
                stencilFunc: EN_COMPARISION_FUNC.ALWAYS,
                stencilPassOp: EN_STENCIL_OP.REPLACE,
                stencilFailOp: EN_STENCIL_OP.KEEP,
                stencilDepthFailOp: EN_STENCIL_OP.KEEP,
            }
        };

        const rs: RasterizerState = {
            fillMode: EN_FILL_MODE.SOLID,
            cullMode: EN_CULL_MODE.BACK,
            depthBias: 0,
            depthBiasClamp: 0,
            slopeScaledDepthBias: 0,
            depthClipEnable: false, // not supported
            multisampleEnable: true,
            antialiasedLineEnable: false,
            conservativeRasterizationEnable: false,
            forcedSampleCount: 0,
            lineWidth: 1,
            frontCounterClockwise: true,
        };

        const bs: BlendState = {
            renderTarget: [
                {
                    srcBlend: EN_BLEND.SRC_ALPHA,
                    destBlend: EN_BLEND.INV_SRC_ALPHA,
                    blendOp: EN_BLEND_OP.ADD,
                    srcBlendAlpha: EN_BLEND.ONE,
                    destBlendAlpha: EN_BLEND.INV_SRC_ALPHA,
                    blendOpAlpha: EN_BLEND_OP.ADD,
                    blendEnable: true,
                    renderTargetWriteMask: EN_COLOR_WRITE.ENABLE_ALL
                }
            ],
            alphaToCoverageEnable: false,
            independentBlendEnable: false,
        };

        this._pipeline = this._graphicsDevice.createPipeline({
            vs,
            ps,
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            il,
            bs,
            rs,
            dss,
            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'mesh',
        })
    }
}
