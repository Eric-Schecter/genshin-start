import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE,
    EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION, EN_LOAD_OP, EN_PRIMITIVE_TOPOLOGY,
    EN_RESOURCE_MISC_FLAG,
    EN_RESOURCE_STATE,
    EN_STENCIL_OP, EN_TEX_TYPE, EN_USAGE, GraphicsDevice, GraphicsPipeline, InputLayout,
    RasterizerState, Rect, RenderCommandBuffer, RenderPassImage, Viewport, WGPUBuffer,
    WGPUTexture
} from "@eric-schecter/graphics";
import { query } from "bitecs";
import { Renderer } from "./renderer";
import { scene, EN_LIGHT_TYPE } from "../ecs";
import { Packer } from "./packer";
import { floatSize, maxInstanceCount } from "../constant";
import meshVertexShader from '../../shaders/mesh_vs.wgsl';

export class ShadowRenderer extends Renderer {
    private _pipeline: GraphicsPipeline;

    private readonly _pushconstantBuffer: WGPUBuffer[] = [];

    private _shadowAtlas: WGPUTexture;

    private readonly _packer: Packer;

    private readonly _maxShadowResolution2D = 1024;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._packer = new Packer();

        this._setupPipeline();

        // todo: change to dynamic size
        for (let i = 0; i < maxInstanceCount; i++) {
            this._pushconstantBuffer[i] = graphicsDevice.createBuffer({
                size: floatSize,
                name: 'pushconstant buffer',
                usage: EN_USAGE.DEFAULT,
                bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
                miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
                stride: 0,
                count: 1,
            });
        }
    }

    public get shadowAtlas() {
        return this._shadowAtlas;
    }

    public update() {
        // todo: add dirty mark
        const { transforms, lights } = scene.components;

        let iterative_scaling = 1;

        while (iterative_scaling > 0.03) {
            this._packer.clear();
            for (const entity of query(scene, [lights, transforms])) {
                const lightComponent = lights[entity];

                let width = 0;
                let height = 0;

                switch (lightComponent.type) {
                    case EN_LIGHT_TYPE.DIRECTIONAL: {
                        width = this._maxShadowResolution2D * iterative_scaling * lightComponent.cascadeCount;
                        height = this._maxShadowResolution2D * iterative_scaling;
                        break;
                    }
                    case EN_LIGHT_TYPE.SPOT: {

                        break;
                    }
                    case EN_LIGHT_TYPE.POINT: {

                        break;
                    }
                    default: {
                        console.error('not supported light');
                    }
                }

                // not handle if too small
                if (width > 8 && height > 8) {
                    this._packer.add(width, height, entity);
                }
            }
            if (this._packer.pack(8192)) {
                const { rects } = this._packer;
                for (const rect of rects) {
                    const lightComponent = lights[rect.id];
                    const { w, h, x, y } = rect;

                    // if (rect.was_packed) {
                    lightComponent.shadowRect.x = x;
                    lightComponent.shadowRect.y = y;
                    lightComponent.shadowRect.width = w;
                    lightComponent.shadowRect.height = h;

                    // Remove slice multipliers from rect:
                    switch (lightComponent.type) {
                        case EN_LIGHT_TYPE.DIRECTIONAL: {
                            lightComponent.shadowRect.width /= lightComponent.cascadeCount;
                            break;
                        }
                        case EN_LIGHT_TYPE.POINT: {
                            lightComponent.shadowRect.width /= 6;
                            break;
                        }
                        // todo
                        default: {

                        }
                    }
                    // }
                    // else {
                    //     // light.Direction = {};
                    // }
                }

                if (!this._shadowAtlas || this._shadowAtlas.desc.width < this._packer.width
                    || this._shadowAtlas.desc.height < this._packer.height) {
                    this._shadowAtlas = this._graphicsDevice.createTexture({
                        type: EN_TEX_TYPE.TEXTURE_2D,
                        width: this._packer.width,
                        height: this._packer.height,
                        depth: 1,
                        arraySize: 1,
                        mipLevels: 1,
                        usage: EN_USAGE.DEFAULT,
                        format: EN_FORMAT.D16_UNORM,
                        sampleCount: 1,
                        bindFlags: EN_BIND_FLAG.DEPTH_STENCIL | EN_BIND_FLAG.SHADER_RESOURCE,
                        miscFlags: EN_RESOURCE_MISC_FLAG.TEXTURE_COMPATIBLE_COMPRESSION, // todo
                        clear: { depth: 1 },
                        layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
                        name: 'shadow map atlas'
                    });
                }

                break;
            }
            else {
                // use smaller size if pack failed
                iterative_scaling *= 0.5;
            }
        }
    }

    public render(cmd: RenderCommandBuffer, renderBatch: Map<number, number[]>, instanceStorageBuffer: WGPUBuffer) {
        if (!this._pipeline || !this._shadowAtlas) {
            return;
        }

        this._graphicsDevice.beginEvent(cmd, 'render shadowmap');
        this._graphicsDevice.beginRenderPass(cmd,
            [RenderPassImage.depthStencil({ resource: this._shadowAtlas, load_op: EN_LOAD_OP.CLEAR })]
        );

        this._graphicsDevice.bindPipeline(cmd, this._pipeline);

        const { meshes, cameras, lights, transforms } = scene.components;

        for (const entity of query(scene, [lights, transforms])) {
            const lightComponent = lights[entity];
            if (!lightComponent.castShadow) {
                continue;
            }

            // todo: handle directional light for now
            if (lightComponent.type !== EN_LIGHT_TYPE.DIRECTIONAL) {
                continue;
            }

            for (const cameraEntity of lightComponent.cameras) {
                const { viewMatrixBuffer, projMatrixBuffer } = cameras[cameraEntity];
                if (!viewMatrixBuffer || !projMatrixBuffer) {
                    continue;
                }

                let drawcall = 0;
                let entityCount = 0;
                for (const [meshEntity, objectEntities] of renderBatch) {
                    const meshComponent = meshes[meshEntity];
                    const materialEntity = meshComponent?.materialEntity;
                    if (materialEntity.length > 1) {
                        // console.warn('not implememnt multi material for now');
                    }
                    const { vertexBuffers, indexBuffer } = meshComponent;

                    this._pushconstantBuffer[drawcall].update(new Uint32Array([entityCount]));

                    const { shadowRect: { width, height, x, y }, cascadeCount } = lightComponent;
                    for (let cascade = 0; cascade < cascadeCount; cascade++) {
                        const viewport: Viewport = {
                            width,
                            height,
                            topLeftX: x + cascade * width,
                            topLeftY: y,
                            minDepth: 0,
                            maxDepth: 1,
                        };

                        const rect: Rect = {
                            top: y,
                            bottom: height,
                            left: x,
                            right: width,
                        };

                        this._graphicsDevice.bindViewport(cmd, viewport);
                        this._graphicsDevice.bindScissorRects(cmd, rect);
                        this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
                        this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
                        this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
                        this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
                        this._graphicsDevice.bindResource(cmd, this._pushconstantBuffer[drawcall], 2);
                        this._graphicsDevice.bindResource(cmd, instanceStorageBuffer, 3);
                        this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, objectEntities.length);
                    }

                    drawcall++;
                    entityCount += objectEntities.length;
                }

                // console.log(`drawcall: ${drawcall}, entity: ${entityCount}`);
            }
        }

        this._graphicsDevice.endRenderPass(cmd);
        this._graphicsDevice.endEvent(cmd);
    }

    private _setupPipeline() {
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
            cullMode: EN_CULL_MODE.NONE,
            depthBias: 0,
            depthBiasClamp: 0,
            slopeScaledDepthBias: 0,
            // depthBias: -1,
            // depthBiasClamp: 0,
            // slopeScaledDepthBias: -2,
            depthClipEnable: false, // not supported
            multisampleEnable: false,
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
            vs: this._graphicsDevice.createShaderByCode(meshVertexShader),
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            il,
            bs,
            rs,
            dss,
            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'shadow',
        })
    }
}
