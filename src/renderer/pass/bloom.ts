import { ComputePipeline, EN_BIND_FLAG, EN_FORMAT, EN_RESOURCE_MISC_FLAG, EN_RESOURCE_STATE, EN_TEX_TYPE, EN_USAGE, GraphicsDevice, RenderCommandBuffer, WGPUBuffer, WGPUTexture } from "@eric-schecter/graphics";
import { EN_MIPGENFILTER, EN_SAMPLER_TYPE, MipmapGenerator, Renderer, ResourceManager } from "../renderers";
import { vec4 } from "gl-matrix";

const POSTPROCESS_BLOCKSIZE = 8;

export class Bloom extends Renderer {
    private _pipeline: ComputePipeline;

    private _bloomThreshold = 2;

    private _exposure = 0.6;

    private _output: WGPUTexture;

    private _tempTex: WGPUTexture;

    private _params: WGPUBuffer;

    private _needUpdate = true;

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);

        this._init();
    }

    public get res() {
        return this._output;
    }

    public get exposure() {
        return this._exposure;
    }

    public set exposure(value: number) {
        this._exposure = value;
        this._needUpdate = true;
    }

    public set bloomThreshold(value: number) {
        this._bloomThreshold = value;
        this._needUpdate = true;
    }

    public update(dt: number) { }

    public render(cmd: RenderCommandBuffer, input: WGPUTexture, linearDepth: WGPUTexture, mipmapGenerator: MipmapGenerator) {
        if (!this._pipeline || !input) {
            return;
        }
        const { canvas: { width, height } } = this._graphicsDevice;
        if (width !== this._output?.desc.width || height !== this._output?.desc.height) {
            this._output?.destroy();
            this._tempTex?.destroy();
            this._createTexture(width, height);
            this._needUpdate = true;
        }
        const { width: outputWidth, height: outputHeight } = this._output.desc;

        if (this._needUpdate) {
            this._params.update(new Float32Array([1 / outputWidth, 1 / outputHeight, this._exposure, this._bloomThreshold]));
            this._needUpdate = false;
        }

        this._graphicsDevice.beginEvent(cmd, "Postprocess_Bloom");
        this._graphicsDevice.beginComputePass(cmd);
        this._graphicsDevice.bindComputePipeline(cmd, this._pipeline);
        this._graphicsDevice.bindResource(cmd, this._params, 0);
        this._graphicsDevice.bindResource(cmd, input, 1);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_CLAMP)!, 2);
        this._graphicsDevice.bindUAV(cmd, this._output, 3, 0);
        this._graphicsDevice.dispatch(cmd,
            Math.ceil(outputWidth / POSTPROCESS_BLOCKSIZE),
            Math.ceil(outputHeight / POSTPROCESS_BLOCKSIZE),
        1);
        this._graphicsDevice.endComputePass(cmd);
        this._graphicsDevice.endEvent(cmd);

        mipmapGenerator.render(cmd, this._output, EN_MIPGENFILTER.GAUSSIAN, this._tempTex, linearDepth)
    }

    private _createTexture(width: number, height: number) {
        const desc = {
            type: EN_TEX_TYPE.TEXTURE_2D,
            width: Math.floor(width / 4),
            height: Math.floor(height / 4),
            depth: 1,
            arraySize: 1,
            mipLevels: 5,
            format: EN_FORMAT.R32G32B32A32_FLOAT,
            sampleCount: 1,
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE | EN_BIND_FLAG.UNORDERED_ACCESS,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            clear: { color: vec4.create() },
            layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
            name: 'bloom',
        };

        this._output = this._graphicsDevice.createTexture(desc);

        this._tempTex = this._graphicsDevice.createTexture({ ...desc, name: 'bloom temp' });
    }

    private async _init() {
        this._params = this._setupUniformBuffer([1, 1, this._exposure, this._bloomThreshold], 'params');

        this._pipeline = await this._graphicsDevice.createComputePipeline('shaders/postprocess/bloom_cs.wgsl');
    }
}
