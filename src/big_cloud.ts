import { vec3 } from "gl-matrix";
import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE, EN_DEPTH_WRITE_MASK,
    EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION, EN_STENCIL_OP,
    GraphicsDevice, GraphicsPipeline, InputLayout, RasterizerState, RenderCommandBuffer, WGPUBuffer
} from "@eric-schecter/graphics";
import {
    scene, Renderer, imageLoader, getPrimaryCamera, invalid_id, getEntityByTag, createDefaultMaterialComponent,
    EN_DATA_TEXTURE_TYPE, EN_SAMPLER_TYPE, ResourceManager
} from "@eric-schecter/renderer";
import { addComponent, addEntity, query } from "bitecs";
import simpleVertexShader from '@eric-schecter/renderer/src/shaders/simple_vs.wgsl';
import { bigCloudBgPixelShader, bigCloudPixelShader } from "./shaders";

export class BigCloud extends Renderer {
    private _cloudPipeline: GraphicsPipeline;

    private _cloudBGPipeline: GraphicsPipeline;

    private readonly _modelBuffers: WGPUBuffer[] = [];

    private _bigCloudEntity = invalid_id;

    private _cloudEntity = invalid_id;

    private _cloudBgEntity = invalid_id;

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);

        for (let i = 0; i < 2; i++) {
            this._modelBuffers.push(this._graphicsDevice.createBuffer({
                size: 64,
                name: 'model buffer',
                bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
                count: 1,
            }));
        }
    }

    public async onload() {
        this._bigCloudEntity = getEntityByTag('SM_BigCloud');
        if (this._bigCloudEntity === invalid_id) {
            console.error('cannot find sm big cloud');
            return;
        }
        this._setupPipeline();
        const texture = await imageLoader.load('images/Tex_0063.png');
        const textureBG = await imageLoader.load('images/Tex_0067b.png');

        const { objects, hierarchies, meshes, tags, materials, transforms } = scene.components;
        for (const entity of query(scene, [hierarchies])) {
            if (hierarchies[entity].parent === this._bigCloudEntity) {
                const [meshEntity] = objects[entity].meshEntities;

                const materialEntity = addEntity(scene);
                addComponent(scene, materialEntity, materials);
                materials[materialEntity] = createDefaultMaterialComponent();
                meshes[meshEntity].materialEntity.push(materialEntity);
                materials[materialEntity].type = 'bigCloud';

                vec3.scale(transforms[entity].translation, transforms[entity].translation, 0.1);
                vec3.scale(transforms[entity].scale, transforms[entity].scale, 0.1);
                transforms[entity].dirty = true;

                if (tags[entity].tag === 'Plane.011') {
                    materials[materialEntity].diffuseTexture = texture;
                    this._cloudEntity = entity;
                } else {
                    materials[materialEntity].diffuseTexture = textureBG;
                    this._cloudBgEntity = entity;
                }
            }
        }

    }

    public update(dt: number) {
        if (this._bigCloudEntity === invalid_id) {
            return;
        }

        const { transforms } = scene.components;

        if (this._cloudEntity !== invalid_id) {
            const { worldMatrix } = transforms[this._cloudEntity];
            this._modelBuffers[0].update(new Float32Array(worldMatrix));
        }
        if (this._cloudBgEntity !== invalid_id) {
            const { worldMatrix } = transforms[this._cloudBgEntity];
            this._modelBuffers[1].update(new Float32Array(worldMatrix));
        }

        const cameraEntity = getPrimaryCamera();
        if (transforms[cameraEntity].dirty) {
            transforms[this._bigCloudEntity].translation = transforms[cameraEntity].translation;
            transforms[this._bigCloudEntity].dirty = true;
        }
    }

    public render(cmd: RenderCommandBuffer) {
        const cloudReady = this._cloudPipeline && this._cloudEntity !== invalid_id;
        const cloudBgReady = this._cloudBGPipeline && this._cloudBgEntity !== invalid_id
        if (!cloudReady && !cloudBgReady
        ) {
            return;
        }

        const { meshes, materials, cameras, objects } = scene.components;

        const primaryCameraEntity = getPrimaryCamera();
        if (primaryCameraEntity === invalid_id) {
            console.warn('no primary camera component found');
            return;
        }
        const { viewMatrixBuffer, projMatrixBuffer } = cameras[primaryCameraEntity];
        if (!viewMatrixBuffer || !projMatrixBuffer) {
            return;
        }

        if (cloudReady) {
            this._graphicsDevice.bindPipeline(cmd, this._cloudPipeline);
            const object = objects[this._cloudEntity];
            if (object.meshEntities.length === 0) {
                return;
            }

            const [meshEntity] = object.meshEntities;
            const meshComponent = meshes[meshEntity];
            const materialEntity = meshComponent?.materialEntity;
            if (materialEntity.length > 1) {
                // console.warn('not implememnt multi material for now');
            }
            const materialComponent = materials[materialEntity[0]]; // todo

            const { diffuseTexture } = materialComponent;
            const { vertexBuffers, indexBuffer } = meshComponent;

            this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
            this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
            this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
            this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
            this._graphicsDevice.bindResource(cmd, this._modelBuffers[0], 2);
            this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_CLAMP)!, 3);
            this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE)!, 4);
            this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, 1);
        }

        if (cloudBgReady) {
            this._graphicsDevice.bindPipeline(cmd, this._cloudBGPipeline);
            const object = objects[this._cloudBgEntity];
            if (object.meshEntities.length === 0) {
                return;
            }

            const [meshEntity] = object.meshEntities;
            const meshComponent = meshes[meshEntity];
            const materialEntity = meshComponent?.materialEntity;
            if (materialEntity.length > 1) {
                // console.warn('not implememnt multi material for now');
            }
            const materialComponent = materials[materialEntity[0]]; // todo

            const { diffuseTexture } = materialComponent;
            const { vertexBuffers, indexBuffer } = meshComponent;

            this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
            this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
            this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
            this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
            this._graphicsDevice.bindResource(cmd, this._modelBuffers[1], 2);
            this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_CLAMP)!, 3);
            this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE)!, 4);
            this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, 1);
        }
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
            depthWriteMask: EN_DEPTH_WRITE_MASK.ZERO,
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
                    renderTargetWriteMask: EN_COLOR_WRITE.DISABLE
                }
            ],
            alphaToCoverageEnable: false,
            independentBlendEnable: true,
        };

        this._cloudPipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(simpleVertexShader),
            ps: this._graphicsDevice.createShaderByCode(bigCloudPixelShader),

            il,
            bs,
            rs,
            dss,

            name: 'big cloud',
        })

        this._cloudBGPipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(simpleVertexShader),
            ps: this._graphicsDevice.createShaderByCode(bigCloudBgPixelShader),

            il,
            bs,
            rs,
            dss,

            name: 'big cloud bg',
        })
    }
}
