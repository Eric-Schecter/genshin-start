import { vec3 } from "gl-matrix";
import { BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE, EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION, EN_PRIMITIVE_TOPOLOGY, EN_RESOURCE_MISC_FLAG, EN_STENCIL_OP, EN_USAGE, GraphicsDevice, GraphicsPipeline, InputLayout, RasterizerState, RenderCommandBuffer, WGPUBuffer } from "@eric-schecter/graphics";
import { scene, Renderer, imageLoader, getPrimaryCamera, invalid_id, getEntityByTag, createDefaultMaterialComponent } from "./renderer";
import { addComponent, addEntity, query } from "bitecs";

export class BigCloud extends Renderer {
    private _cloudPipeline: GraphicsPipeline;

    private _cloudBGPipeline: GraphicsPipeline;

    private _modelBuffers: WGPUBuffer[] = [];

    private _bigCloudEntity = invalid_id;

    private _cloudEntity = invalid_id;

    private _cloudBgEntity = invalid_id;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        for (let i = 0; i < 2; i++) {
            this._modelBuffers.push(this._graphicsDevice.createBuffer({
                size: 64,
                name: 'model buffer',
                usage: EN_USAGE.DEFAULT,
                bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
                miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
                stride: 0,
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
        await this._setupPipeline();
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
            this._graphicsDevice.bindSampler(cmd, this._sampler, 3);
            this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._whiteTexture, 4);
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
            this._graphicsDevice.bindSampler(cmd, this._sampler, 3);
            this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._whiteTexture, 4);
            this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, 1);
        }
    }

    private async _setupPipeline() {

        const [vs, ps, bg_ps] = await Promise.all([
            this._graphicsDevice.createShader('shaders/simple_vs.wgsl'),
            this._graphicsDevice.createShader('shaders/cloud/big_cloud_ps.wgsl'),
            this._graphicsDevice.createShader('shaders/cloud/big_cloud_bg_ps.wgsl'),
        ]);

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
                }
            ],
            alphaToCoverageEnable: false,
            independentBlendEnable: false,
        };

        this._cloudPipeline = this._graphicsDevice.createPipeline({
            vs,
            ps,
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            il,
            bs,
            rs,
            dss,
            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'big cloud',
        })

        this._cloudBGPipeline = this._graphicsDevice.createPipeline({
            vs,
            ps: bg_ps,
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            il,
            bs,
            rs,
            dss,
            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'big cloud bg',
        })
    }
}
