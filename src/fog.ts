import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE,
    EN_COMPARISION_FUNC, EN_CULL_MODE, EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT,
    EN_INPUT_CLASSIFICATION, EN_PRIMITIVE_TOPOLOGY, EN_RESOURCE_MISC_FLAG, EN_STENCIL_OP, EN_USAGE, GraphicsDevice,
    GraphicsPipeline, InputLayout, RasterizerState, RenderCommandBuffer, WGPUBuffer
} from "@eric-schecter/graphics";
import { scene, Renderer, Plane, getPrimaryCamera, invalid_id } from "./renderer";

export class Fog extends Renderer {
    private _pipeline: GraphicsPipeline;

    private _instanceStorageBuffer: WGPUBuffer;
    private _paramsBuffer: WGPUBuffer;
    private _planeEntity = invalid_id;
    private _meshEntity = invalid_id;
    private _time = 0;

    private _interval = 80;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._instanceStorageBuffer = this._graphicsDevice.createBuffer({
            size: 64 * 4,
            name: 'instance storage buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: 1,
        });

        this._paramsBuffer = this._graphicsDevice.createBuffer({
            size: 4,
            name: 'params buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: 1,
        })

        this._setupPipeline();

        const { objects, transforms, meshes, materials } = scene.components;
        const planeEntity = Plane.create(1000, 1000);
        const transformComponent = transforms[planeEntity];
        transformComponent.translation[2] = -this._interval;
        transformComponent.dirty = true;

        const [meshEntity] = objects[planeEntity].meshEntities;
        const mesh = meshes[meshEntity];
        const [materialEntity] = mesh.materialEntity;
        materials[materialEntity].type = 'fog';

        this._meshEntity = meshEntity;
        this._planeEntity = planeEntity;
    }

    public update(dt: number) {
        if (this._planeEntity === invalid_id) {
            return;
        }
        // todo: add dirty mark
        const { transforms } = scene.components;

        const primaryCameraEntity = getPrimaryCamera();
        // todo: enable dirty mark
        // if (transforms[primaryCameraEntity].dirty) {
        const cameraCenter = transforms[primaryCameraEntity].translation[2];

        // todo: delay update?
        const transformComponent = transforms[this._planeEntity];
        const { worldMatrix, translation } = transformComponent;
        translation[2] = cameraCenter - 400;
        transformComponent.dirty = true;

        this._instanceStorageBuffer.update(new Float32Array(worldMatrix));
        // }

        this._time += dt;
        this._paramsBuffer.update(new Float32Array([this._time]));
    }

    public render(cmd: RenderCommandBuffer) {
        if (!this._pipeline || this._meshEntity === invalid_id) {
            return;
        }

        this._graphicsDevice.bindPipeline(cmd, this._pipeline);

        const { meshes, cameras } = scene.components;

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

        const { vertexBuffers, indexBuffer } = meshComponent;

        this._graphicsDevice.bindVertexBuffers(cmd, vertexBuffers, 0);
        this._graphicsDevice.bindIndexBuffer(cmd, indexBuffer!, EN_INDEX_BUFFER_FORMAT.UINT32, 0);
        this._graphicsDevice.bindResource(cmd, viewMatrixBuffer, 0);
        this._graphicsDevice.bindResource(cmd, projMatrixBuffer, 1);
        this._graphicsDevice.bindResource(cmd, this._instanceStorageBuffer, 2);
        this._graphicsDevice.bindResource(cmd, this._paramsBuffer, 3);
        this._graphicsDevice.drawIndexedInstanced(cmd, indexBuffer!.desc.count, 1);
    }

    private async _setupPipeline() {
        const [vs, ps] = await Promise.all([
            this._graphicsDevice.createShader('shaders/simple_vs.wgsl'),
            this._graphicsDevice.createShader('shaders/fog_ps.wgsl')]);

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
            name: 'fog',
        })
    }
}
