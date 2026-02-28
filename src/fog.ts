import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE,
    EN_COMPARISION_FUNC, EN_CULL_MODE, EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT, EN_INDEX_BUFFER_FORMAT,
    EN_INPUT_CLASSIFICATION, EN_STENCIL_OP, GraphicsDevice,
    GraphicsPipeline, InputLayout, RasterizerState, RenderCommandBuffer, RenderTargetBlendState, WGPUBuffer
} from "@eric-schecter/graphics";
import { scene, Renderer, Plane, getPrimaryCamera, invalid_id } from "@eric-schecter/renderer";
import simpleVertexShader from '@eric-schecter/renderer/src/shaders/simple_vs.wgsl?raw';
import { fogPixelShader } from "./shaders";

function createDepthStencil(override: Partial<DepthStencilState> = {}): DepthStencilState {
    const defaultState: DepthStencilState = {
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

    return {
        ...defaultState,
        ...override,
        frontFace: override.frontFace
            ? { ...defaultState.frontFace, ...override.frontFace }
            : defaultState.frontFace,
        backFace: override.backFace
            ? { ...defaultState.backFace, ...override.backFace }
            : defaultState.backFace,
    }
}

function createRasterizerState(override: Partial<RasterizerState> = {}): RasterizerState {
    const defaultState: RasterizerState = {
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

    return {
        ...defaultState,
        ...override,
    }
}

type PartialBlendState = Omit<Partial<BlendState>, 'renderTarget'> & {
    renderTarget?: Array<Partial<RenderTargetBlendState> | undefined>;
};

function createBlendState(override: PartialBlendState = {}): BlendState {
    const defaultRenderTarget = {
        srcBlend: EN_BLEND.SRC_ALPHA,
        destBlend: EN_BLEND.INV_SRC_ALPHA,
        blendOp: EN_BLEND_OP.ADD,
        srcBlendAlpha: EN_BLEND.ONE,
        destBlendAlpha: EN_BLEND.INV_SRC_ALPHA,
        blendOpAlpha: EN_BLEND_OP.ADD,
        blendEnable: true,
        renderTargetWriteMask: EN_COLOR_WRITE.ENABLE_ALL
    };
    const bs: BlendState = {
        renderTarget: [],
        alphaToCoverageEnable: false,
        independentBlendEnable: true,
    };

    return {
        ...bs,
        ...override,
        renderTarget: override.renderTarget
            ? override.renderTarget.map((rt) => ({
                ...defaultRenderTarget,
                ...rt,
            }))
            : bs.renderTarget,
    }
}

export class Fog extends Renderer {
    private _pipeline: GraphicsPipeline;

    private readonly _instanceStorageBuffer: WGPUBuffer;
    private readonly _paramsBuffer: WGPUBuffer;
    private readonly _planeEntity: number = invalid_id;
    private readonly _meshEntity: number = invalid_id;

    private readonly _interval = 80;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._instanceStorageBuffer = this._graphicsDevice.createBuffer({
            size: 64 * 4,
            name: 'instance storage buffer',
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            count: 1,
        });

        this._paramsBuffer = this._graphicsDevice.createBuffer({
            size: 4,
            name: 'params buffer',
            bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
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

    public update(dt: number, et: number) {
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

        this._paramsBuffer.update(new Float32Array([et]));
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

        const dss = createDepthStencil();
        const rs = createRasterizerState();
        const bs = createBlendState({
            renderTarget: [
                {}, {
                    blendEnable: false,
                    renderTargetWriteMask: EN_COLOR_WRITE.DISABLE
                }
            ]
        });

        this._pipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(simpleVertexShader),
            ps: this._graphicsDevice.createShaderByCode(fogPixelShader),

            il,
            bs,
            rs,
            dss,

            name: 'fog',
        })
    }
}
