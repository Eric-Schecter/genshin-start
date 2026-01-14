import {
    BlendState, DepthStencilState, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE,
    EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION, EN_PRIMITIVE_TOPOLOGY,
    EN_STENCIL_OP, GraphicsDevice, GraphicsPipeline, InputLayout,
    RasterizerState, RenderCommandBuffer, WGPUTexture
} from "@eric-schecter/graphics";
import { query } from "bitecs";
import { Renderer } from "./renderer";
import { scene, invalid_id, getPrimaryCamera } from "../ecs";

export class MeshRenderer extends Renderer {
    private _pipeline: GraphicsPipeline;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._setupPipeline();
    }

    public render(cmd: RenderCommandBuffer, envTexture: WGPUTexture) {
        if (!this._pipeline) {
            return;
        }

        this._graphicsDevice.bindPipeline(cmd, this._pipeline);

        const { objects, meshes, materials, transforms, cameras } = scene.components;

        const primaryCameraEntity = getPrimaryCamera();
        if (primaryCameraEntity === invalid_id) {
            console.warn('no primary camera component found');
            return;
        }
        const { viewMatrixBuffer, projMatrixBuffer, cameraPosBuffer } = cameras[primaryCameraEntity];
        if (!viewMatrixBuffer || !projMatrixBuffer || !cameraPosBuffer) {
            return;
        }

        for (const entity of query(scene, [objects, transforms])) {
            const objectComponent = objects[entity];
            const meshEntities = objectComponent?.meshEntities;
            if (!objectComponent || meshEntities.length === 0) {
                continue;
            }
            const { modelMatrixBuffer } = transforms[entity];
            if (!modelMatrixBuffer) {
                // console.error('no transform data');
                continue;
            }

            for (let i = 0; i < meshEntities.length; i++) {
                const meshComponent = meshes[meshEntities[i]];
                const materialEntity = meshComponent?.materialEntity;
                if (materialEntity.length > 1) {
                    // console.warn('not implememnt multi material for now');
                }
                const materialComponent = materials[materialEntity[0]]; // todo

                const { diffuseTexture, normalTexture, metallicRoughnessTexture, emissiveTexture, occlusionTexture } = materialComponent;
                const { vertexBuffers, indexBuffer } = meshComponent;

                this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
                this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
                this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
                this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
                this._graphicsDevice.bindResource(cmd, modelMatrixBuffer, 2);
                this._graphicsDevice.bindSampler(cmd, this._sampler, 3);
                this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._blackTexture, 4);
                this._graphicsDevice.bindResource(cmd, emissiveTexture.texture || this._blackTexture, 5);
                this._graphicsDevice.bindResource(cmd, normalTexture.texture || this._blackTexture, 6);
                this._graphicsDevice.bindResource(cmd, metallicRoughnessTexture.texture || this._blackTexture, 7);
                this._graphicsDevice.bindResource(cmd, occlusionTexture.texture || this._blackTexture, 8);
                this._graphicsDevice.bindResource(cmd, envTexture || this._whiteTextureCube, 9);
                this._graphicsDevice.bindResource(cmd, cameraPosBuffer, 10);
                this._graphicsDevice.drawIndexed(cmd, indexBuffer!.desc.count);
            }
        }
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
