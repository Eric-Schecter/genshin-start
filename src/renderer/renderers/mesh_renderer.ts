import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE,
    EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION, EN_PRIMITIVE_TOPOLOGY,
    EN_RESOURCE_MISC_FLAG,
    EN_STENCIL_OP, EN_USAGE, GraphicsDevice, GraphicsPipeline, InputLayout,
    RasterizerState, RenderCommandBuffer, WGPUBuffer, WGPUTexture
} from "@eric-schecter/graphics";
import { query } from "bitecs";
import { Renderer } from "./renderer";
import { scene, invalid_id, getPrimaryCamera, EN_LIGHT_TYPE } from "../ecs";
import { vec3 } from "gl-matrix";
import { getForward, quatToMat4 } from "../utils";
import { floatSize, maxInstanceCount } from "../constant";
import { EN_DATA_TEXTURE_TYPE, EN_SAMPLER_TYPE, ResourceManager } from "./resource_manager";
import meshVertexShader from '../../shaders/mesh_vs.wgsl';
import meshPixelShader from '../../shaders/mesh_ps.wgsl';

export class MeshRenderer extends Renderer {
    private _pipeline: GraphicsPipeline;

    private readonly _lightStorageBuffer: WGPUBuffer;

    private readonly _pushconstantBuffer: WGPUBuffer[] = [];

    private readonly _ambientLightBuffer: WGPUBuffer;

    private readonly _shadowAtlasResolution: WGPUBuffer;

    private _envTexture?: WGPUTexture;

    private _shadowAtlas?: WGPUTexture;

    private readonly _screenSize: WGPUBuffer;

    private readonly _maxLightCount = 64;

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);

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

        const maxLightCount = 64;
        this._lightStorageBuffer = graphicsDevice.createBuffer({
            size: maxLightCount * 4 * 9 * 4 * floatSize,
            name: 'light storage buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: maxLightCount,
        });

        this._ambientLightBuffer = graphicsDevice.createBuffer({
            size: 4 * floatSize,
            name: 'ambient light buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: 1,
        });

        this._shadowAtlasResolution = graphicsDevice.createBuffer({
            size: 2 * floatSize,
            name: 'shadow atlas resolution',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: 1,
        });

        this._screenSize = graphicsDevice.createBuffer({
            size: 2 * floatSize,
            name: 'screen size',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: 1,
        });
    }

    public set envTexture(value: WGPUTexture) {
        this._envTexture = value;
    }

    public set shadowAtlas(value: WGPUTexture) {
        this._shadowAtlas = value;
        if (!value) {
            return;
        }
        const { desc } = this._shadowAtlas;
        this._shadowAtlasResolution.update(new Float32Array([desc.width, desc.height]));
    }

    public resize(width: number, height: number) {
        this._screenSize.update(new Float32Array([width, height]));
    }

    public update() {
        // todo: add dirty mark
        const { transforms, lights } = scene.components;

        for (const entity of query(scene, [lights])) {
            const light = lights[entity];
            if (light.type === EN_LIGHT_TYPE.AMBIENT && light.dirty) {
                const color = vec3.scale(vec3.create(), light.color, light.intensity);
                this._ambientLightBuffer.update(new Float32Array([color[0], color[1], color[2], 1]));
                light.dirty = false;
                // one ambient light for now
                break
            }
        }

        let lightIndex = 0;
        const stride = 4 * 4 * 4 * 4;

        for (const entity of query(scene, [lights, transforms])) {
            if (lightIndex > this._maxLightCount) {
                console.warn('reach light count limit');
                break;
            }
            const light = lights[entity];
            const transform = transforms[entity];
            if (light.type === EN_LIGHT_TYPE.DIRECTIONAL && light.dirty) {
                // if (light.type === EN_LIGHT_TYPE.DIRECTIONAL) {
                const color = vec3.scale(vec3.create(), light.color, light.intensity * Math.PI); // todo: PI?

                const lightData = new Float32Array([
                    ...Array.from(transform.translation), 0,
                    ...Array.from(getForward(quatToMat4(transform.rotation))), 0,
                    ...Array.from(color), 0,
                    ...Array.from(light.matrix),
                    ...Array.from(light.shadowAtlasMulAdd),
                    1, // enable
                    0, // light type
                    light.cascadeCount // todo
                ]);

                this._lightStorageBuffer.update(lightData, lightIndex * stride)
                light.dirty = false;
                lightIndex++;
            }
            if (light.type === EN_LIGHT_TYPE.SPOT && light.dirty) {

                light.dirty = false;
                lightIndex++;
            }
            if (light.type === EN_LIGHT_TYPE.POINT && light.dirty) {

                light.dirty = false;
                lightIndex++;
            }
        }
    }

    public render(cmd: RenderCommandBuffer, renderBatch: Map<number, number[]>, instanceStorageBuffer: WGPUBuffer) {
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
        const { viewMatrixBuffer, projMatrixBuffer, cameraBuffer } = cameras[primaryCameraEntity];
        if (!viewMatrixBuffer || !projMatrixBuffer || !cameraBuffer) {
            return;
        }

        let drawcall = 0;
        let entityCount = 0;
        for (const [meshEntity, objectEntities] of renderBatch) {
            const meshComponent = meshes[meshEntity];
            const materialEntity = meshComponent?.materialEntity;
            if (materialEntity.length > 1) {
                // console.warn('not implememnt multi material for now');
            }
            const materialComponent = materials[materialEntity[0]]; // todo

            const { diffuseTexture, normalTexture, metallicRoughnessTexture, emissiveTexture,
                occlusionTexture, shaderMaterialBuffer } = materialComponent;
            const { vertexBuffers, indexBuffer } = meshComponent;

            this._pushconstantBuffer[drawcall].update(new Uint32Array([entityCount]));

            this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
            this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
            this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
            this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
            this._graphicsDevice.bindResource(cmd, this._pushconstantBuffer[drawcall], 2);
            this._graphicsDevice.bindResource(cmd, instanceStorageBuffer, 3);
            this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE)!, 4);
            this._graphicsDevice.bindResource(cmd, emissiveTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.BLACK)!, 5);
            this._graphicsDevice.bindResource(cmd, normalTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.BLACK)!, 6);
            this._graphicsDevice.bindResource(cmd, metallicRoughnessTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE)!, 7);
            this._graphicsDevice.bindResource(cmd, occlusionTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE)!, 8);
            this._graphicsDevice.bindResource(cmd, this._envTexture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE_CUBE)!, 9);
            this._graphicsDevice.bindResource(cmd, cameraBuffer, 10);
            this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_WRAP)!, 11);
            this._graphicsDevice.bindResource(cmd, this._ambientLightBuffer, 12);
            this._graphicsDevice.bindResource(cmd, this._lightStorageBuffer, 13);
            this._graphicsDevice.bindResource(cmd, this._shadowAtlasResolution, 14);
            this._graphicsDevice.bindResource(cmd, this._shadowAtlas || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.DEPTH)!, 15);
            this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.DEPTH_COMPARE)!, 16);
            this._graphicsDevice.bindResource(cmd, shaderMaterialBuffer!, 17);
            this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.ANISO_WRAP)!, 18);
            this._graphicsDevice.bindResource(cmd, this._screenSize, 19);
            this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, objectEntities.length);

            drawcall++;
            entityCount += objectEntities.length;
        }

        // console.log(`drawcall: ${drawcall}, entity: ${entityCount}`);
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
                },
                {
                    srcBlend: EN_BLEND.SRC_ALPHA,
                    destBlend: EN_BLEND.INV_SRC_ALPHA,
                    blendOp: EN_BLEND_OP.ADD,
                    srcBlendAlpha: EN_BLEND.ONE,
                    destBlendAlpha: EN_BLEND.INV_SRC_ALPHA,
                    blendOpAlpha: EN_BLEND_OP.ADD,
                    blendEnable: false,
                    renderTargetWriteMask: EN_COLOR_WRITE.ENABLE_ALL
                }
            ],
            alphaToCoverageEnable: false,
            independentBlendEnable: true,
        };

        this._pipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(meshVertexShader),
            ps: this._graphicsDevice.createShaderByCode(meshPixelShader),
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
