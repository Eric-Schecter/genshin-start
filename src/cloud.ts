import { vec3 } from "gl-matrix";
import { CloudList } from "./datas";
import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE,
    EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT, EN_INPUT_CLASSIFICATION,
    EN_RESOURCE_MISC_FLAG, EN_STENCIL_OP, EN_USAGE, GraphicsDevice, GraphicsPipeline, InputLayout, RasterizerState, RenderCommandBuffer, WGPUBuffer
} from "@eric-schecter/graphics";
import {
    clone, scene, Renderer, imageLoader, Plane, getPrimaryCamera, invalid_id, TransformComponent, EN_DATA_TEXTURE_TYPE,
    EN_SAMPLER_TYPE, ResourceManager
} from "@eric-schecter/renderer";
import { zLength } from "./constant";
import { cloudPixelShader, cloudVertexShader } from "./shaders";

export class Cloud extends Renderer {
    private _cloudPipeline: GraphicsPipeline;

    private readonly _instanceStorageBuffer: WGPUBuffer;

    private readonly _cloudEntities: number[] = []; // mesh entity -> object entities

    private readonly _posList: TransformComponent[] = [];

    private _meshEntity = invalid_id;

    private _init = true;

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);

        const maxCount = CloudList.length;
        this._instanceStorageBuffer = this._graphicsDevice.createBuffer({
            size: maxCount * 64 * 4,
            name: 'instance storage buffer',
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            count: maxCount,
        });
    }

    public async onload() {
        this._setupPipeline();
        const texture = await imageLoader.load('images/Tex_0062.png');

        const posList: vec3[] = [];
        for (const cloud of CloudList) {
            const position = vec3.fromValues(cloud.Location[0], cloud.Location[2], -cloud.Location[1]);
            vec3.scale(position, position, 0.1);
            posList.push(position)
        }
        posList.sort((a, b) => a[2] - b[2]);

        const { objects, transforms, meshes, materials } = scene.components;
        const planeEntity = Plane.create(3000, 1500);
        const transformComponent = transforms[planeEntity];
        transformComponent.translation = posList[0];
        transformComponent.dirty = true;

        const [meshEntity] = objects[planeEntity].meshEntities;
        const [materialEntity] = meshes[meshEntity].materialEntity;
        materials[materialEntity].diffuseTexture = texture;
        materials[materialEntity].type = 'cloud';
        materials[materialEntity].dirty = true;

        this._meshEntity = meshEntity;
        this._cloudEntities.push(planeEntity);
        this._posList.push(transformComponent);

        for (let i = 1; i < posList.length; i++) {
            const clonedEntity = clone(planeEntity);
            const transformComponent = transforms[clonedEntity];
            transformComponent.translation = posList[i];
            transformComponent.dirty = true;

            this._cloudEntities.push(clonedEntity);
            this._posList.push(transformComponent);
        }
    }

    public update(dt: number) {
        if (this._posList.length === 0) {
            return;
        }
        // todo: add dirty mark
        const { transforms } = scene.components;

        const primaryCameraEntity = getPrimaryCamera();
        const cameraCenter = transforms[primaryCameraEntity].translation[2];

        // const worldPos = mat4.getTranslation(vec3.create(), this._posList[this._posList.length - 1].worldMatrix);
        if (this._posList[this._posList.length - 1].translation[2] > cameraCenter) {
            let firstElement = this._posList.pop();
            if (firstElement) {
                firstElement.translation[2] -= zLength * 0.1;
                firstElement.dirty = true;
                this._posList.unshift(firstElement);
            }
        }

        if (this._posList[this._posList.length - 1].translation[2] > cameraCenter || this._init) {
            // todo: delay update?
            this._updateModelMatrix();
        }

        this._init = false;
    }

    public render(cmd: RenderCommandBuffer) {
        if (!this._cloudPipeline || this._meshEntity === invalid_id) {
            return;
        }

        const { meshes, materials, cameras } = scene.components;

        const primaryCameraEntity = getPrimaryCamera();
        if (primaryCameraEntity === invalid_id) {
            console.warn('no primary camera component found');
            return;
        }
        const { viewMatrixBuffer, projMatrixBuffer } = cameras[primaryCameraEntity];
        if (!viewMatrixBuffer || !projMatrixBuffer) {
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

        this._graphicsDevice.bindPipeline(cmd, this._cloudPipeline);
        this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
        this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
        this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
        this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
        this._graphicsDevice.bindResource(cmd, this._instanceStorageBuffer, 2);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_CLAMP)!, 3);
        this._graphicsDevice.bindResource(cmd, diffuseTexture.texture || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.WHITE)!, 4);
        this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, this._posList.length);
    }

    private _updateModelMatrix() {
        const { transforms } = scene.components;

        let stride = 64;

        const data = new Float32Array(this._cloudEntities.length * stride);

        let offset = 0;
        stride = 16;
        for (const entity of this._cloudEntities) {
            const { worldMatrix } = transforms[entity];
            data.set(worldMatrix, offset * stride);
            offset++;
        }

        this._instanceStorageBuffer.update(data);
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
            vs: this._graphicsDevice.createShaderByCode(cloudVertexShader),
            ps: this._graphicsDevice.createShaderByCode(cloudPixelShader),

            il,
            bs,
            rs,
            dss,

            name: 'cloud',
        })
    }
}
