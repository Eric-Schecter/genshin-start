import { quat, vec3 } from "gl-matrix";
import { PolarLightList } from "./datas";
import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE, EN_DEPTH_WRITE_MASK,
    EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION, EN_PRIMITIVE_TOPOLOGY, EN_RESOURCE_MISC_FLAG, EN_STENCIL_OP, EN_USAGE,
    GraphicsDevice, GraphicsPipeline, InputLayout, RasterizerState, RenderCommandBuffer, WGPUBuffer
} from "@eric-schecter/graphics";
import {
    clone, scene, Renderer, imageLoader, getPrimaryCamera, invalid_id, TransformComponent, getEntityByTag,
    createDefaultMaterialComponent, EN_DATA_TEXTURE_TYPE, EN_SAMPLER_TYPE, ResourceManager, floatSize
} from "./renderer";
import { zLength } from "./constant";
import { addComponent, addEntity, query } from "bitecs";
import simpleVertexShader from './shaders/simple_vs.wgsl';
import polarLightPixelShader from './shaders/polar_light_ps.wgsl';

export class PolarLight extends Renderer {
    private _prefab = invalid_id; // not real prefab

    private _pipeline: GraphicsPipeline;

    private readonly _instanceStorageBuffer: WGPUBuffer;

    private readonly _paramsBuffer: WGPUBuffer;

    private readonly _polarLightEntities: number[] = []; // mesh entity -> object entities

    private readonly _posList: TransformComponent[] = [];

    private _meshEntity = invalid_id;

    private _firstTime = true;

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);

        const maxCount = PolarLightList.length;

        this._instanceStorageBuffer = this._graphicsDevice.createBuffer({
            size: maxCount * 64 * floatSize,
            name: 'instance storage buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: maxCount,
        });

        this._paramsBuffer = this._graphicsDevice.createBuffer({
            size: floatSize,
            name: 'params buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: 1,
        })
    }

    public async onload() {
        const polarLightEntity = getEntityByTag('SM_Light');
        if (polarLightEntity === invalid_id) {
            console.error('cannot find sm light');
            return;
        }
        await this._setupPipeline();
        const texture = await imageLoader.load('images/Tex_0071.png');

        const transformList: { pos: vec3, rotation: quat }[] = [];
        for (const { Location, Rotation } of PolarLightList) {
            const pos = vec3.scale(vec3.create(), vec3.fromValues(Location[0], Location[2], -Location[1]), 0.1);
            const rotation = quat.fromEuler(quat.create(), Rotation[0] / Math.PI * 180, -Rotation[1] / Math.PI * 180, Rotation[2] / Math.PI * 180, 'xyz');
            transformList.push({ pos, rotation });
        }
        transformList.sort((a, b) => a.pos[2] - b.pos[2]);

        const { objects, transforms, meshes, materials, hierarchies } = scene.components;
        for (const { pos, rotation } of transformList) {
            if (this._prefab === invalid_id) {
                this._prefab = polarLightEntity;
                for (const childEntity of query(scene, [hierarchies])) {
                    if (hierarchies[childEntity].parent === this._prefab) {
                        const transformComponent = transforms[childEntity];
                        transformComponent.translation = pos;
                        transformComponent.rotation = rotation;
                        transformComponent.scale = vec3.fromValues(0.1, 0.1, 0.1);
                        transformComponent.dirty = true;

                        const [meshEntity] = objects[childEntity].meshEntities;

                        const materialEntity = addEntity(scene);
                        addComponent(scene, materialEntity, materials);
                        materials[materialEntity] = createDefaultMaterialComponent();
                        materials[materialEntity].diffuseTexture = texture;
                        materials[materialEntity].type = 'polar light';
                        materials[materialEntity].dirty = true;

                        meshes[meshEntity].materialEntity.push(materialEntity);

                        this._meshEntity = meshEntity;
                        this._polarLightEntities.push(childEntity);
                        this._posList.push(transformComponent);
                    }
                }
            } else {
                const clonedEntity = clone(this._prefab);

                for (const childEntity of query(scene, [hierarchies])) {
                    if (hierarchies[childEntity].parent === clonedEntity) {
                        const transformComponent = transforms[childEntity];
                        transformComponent.translation = pos;
                        transformComponent.rotation = rotation;
                        transformComponent.dirty = true;

                        this._polarLightEntities.push(childEntity);
                        this._posList.push(transformComponent);
                    }
                }
            }
        }
    }

    public update(dt: number, et: number) {
        if (this._posList.length === 0) {
            return;
        }
        // todo: add dirty mark
        const { transforms } = scene.components;

        const primaryCameraEntity = getPrimaryCamera();
        const cameraCenter = transforms[primaryCameraEntity].translation[2];

        // const worldPos = mat4.getTranslation(vec3.create(), this._posList[this._posList.length - 1].worldMatrix);
        if (this._firstTime) {
            this._updateModelMatrix();
            this._firstTime = false;
        }
        if (this._posList[this._posList.length - 1].translation[2] > cameraCenter) {
            let firstElement = this._posList.pop();
            if (firstElement) {
                firstElement.translation[2] -= zLength * 0.1;
                firstElement.dirty = true;
                this._posList.unshift(firstElement);

                // todo: delay update?
                this._updateModelMatrix();
            }
        }

        this._paramsBuffer.update(new Float32Array([et]));
    }

    private _updateModelMatrix() {
        const { transforms } = scene.components;

        let stride = 64;

        const data = new Float32Array(this._polarLightEntities.length * stride);

        let offset = 0;
        stride = 16;
        for (const entity of this._polarLightEntities) {
            const { worldMatrix } = transforms[entity];
            data.set(worldMatrix, offset * stride);
            offset++;
        }

        this._instanceStorageBuffer.update(data);
    }

    public render(cmd: RenderCommandBuffer) {
        if (!this._pipeline || this._meshEntity === invalid_id) {
            return;
        }

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

        const meshComponent = meshes[this._meshEntity];
        const materialEntity = meshComponent?.materialEntity;
        if (materialEntity.length > 1) {
            // console.warn('not implememnt multi material for now');
        }
        const materialComponent = materials[materialEntity[0]]; // todo

        const { diffuseTexture } = materialComponent;
        const { vertexBuffers, indexBuffer } = meshComponent;

        this._graphicsDevice.bindPipeline(cmd, this._pipeline);
        this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
        this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
        this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
        this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
        this._graphicsDevice.bindResource(cmd, this._instanceStorageBuffer, 2);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_WRAP)!, 3);
        this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE)!, 4);
        this._graphicsDevice.bindResource(cmd, cameraBuffer, 5);
        this._graphicsDevice.bindResource(cmd, this._paramsBuffer, 6);
        this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, this._posList.length);
    }

    private async _setupPipeline() {
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

        this._pipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(simpleVertexShader),
            ps: this._graphicsDevice.createShaderByCode(polarLightPixelShader),
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            il,
            bs,
            rs,
            dss,
            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'polar light',
        })
    }
}
